// Autenticação do app de ponto (/ponto) — CPF + PIN, sem Telegram.
//
// Para o colaborador são dois sistemas: o portal (/portal, via Telegram) cuida
// do contrato de trabalho; o /ponto só bate ponto. Esta sessão nunca abre
// documentos, salário ou Fale com o RH — e a sessão do portal nunca abre o
// /ponto sem PIN. Quem junta as duas, só para REGISTRAR a batida, é
// lib/ponto-identidade.ts.
//
// Mesmo desenho de segurança do portal: token aleatório de 32 bytes no
// cookie, só o SHA-256 no banco (PontoSessao). O PIN vive como bcrypt em
// Colaborador.pontoPinHash — o valor em claro existe uma vez, no retorno da
// action do RH que o gera.
import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  estadoDoLogin,
  limparTentativas,
  minutosAteLiberar,
  registrarFalha,
} from "@/lib/login-tentativas";

export const COOKIE_PONTO = "ponto_sessao";

/** Vida da sessão do ponto — um turno, como a do portal. Constante própria de
 * propósito: mudar a validade de um app não pode arrastar o outro. */
export const HORAS_VALIDADE_SESSAO_PONTO = 12;

// Chaves do rate limit na tabela TentativaLogin. O prefixo garante que um CPF
// nunca colide com um username do login interno. São DOIS baldes:
//   - por CPF+IP (5 falhas/15min, os padrões de login-tentativas): protege
//     sem punir colegas na mesma rede;
//   - por CPF sozinho, com teto mais alto e janela maior: sem ele, IPs
//     rotativos ganham 5 tentativas novas a cada IP, e um PIN de 6 dígitos
//     vira força bruta distribuída viável. CPF não é segredo como username é.
const CHAVE_POR_IP = (cpf: string) => `ponto-pin:${cpf}`;
const CHAVE_GLOBAL = (cpf: string) => `ponto-pin-global:${cpf}`;
const IP_GLOBAL = "*";
export const MAX_TENTATIVAS_GLOBAL = 20;
export const JANELA_MINUTOS_GLOBAL = 60;

// Contra oráculo de timing: quando o CPF não tem nenhum candidato elegível, a
// resposta sairia rápida demais (nenhum bcrypt rodou) e denunciaria quais
// CPFs existem, mesmo com a mensagem genérica. Comparar contra este hash
// nivela o tempo. Hash fixo de um valor impossível (PIN tem 6 dígitos; isto
// não é PIN de ninguém), custo 10 como os reais.
const HASH_FANTASMA = "$2b$10$63bDVbH4Duggiu8JcSKiPuVEddD.Q1IyUdeIPJUwFeGfx0E8k.Mp2";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const novoToken = () => randomBytes(32).toString("base64url");

export type ResultadoEntradaPin =
  | { ok: true; sessaoToken: string; expiraEm: Date; colaboradorId: string }
  // Mais de um vínculo no grupo validou o mesmo CPF+PIN (unique é por
  // empresa): a tela oferece a escolha DEPOIS do PIN conferido — nunca antes,
  // para não contar a quem ainda não provou o PIN quantos vínculos existem.
  | { ok: true; escolher: Array<{ colaboradorId: string; empresa: string }> }
  | { ok: false; erro: string };

/** Falhas do balde global (por CPF, qualquer IP) dentro da janela longa. */
async function estadoGlobal(cpf: string, agora = new Date()) {
  const desde = new Date(agora.getTime() - JANELA_MINUTOS_GLOBAL * 60_000);
  const falhas = await prisma.tentativaLogin.findMany({
    where: { username: CHAVE_GLOBAL(cpf), ip: IP_GLOBAL, criadoEm: { gt: desde } },
    select: { criadoEm: true },
  });
  // avaliarTentativas usa MAX/JANELA padrão; aqui o teto é maior, então a
  // conta é direta: estourou o teto na janela longa, bloqueia.
  return { bloqueado: falhas.length >= MAX_TENTATIVAS_GLOBAL };
}

/**
 * `colaboradorIdEscolhido` é a segunda etapa do caso raro de dois vínculos:
 * a tela reenvia CPF + PIN + o id escolhido, e o PIN é conferido DE NOVO na
 * mesma chamada. Não existe endpoint que abra sessão a partir de um id sem
 * prova do PIN — seria uma porta sem fechadura.
 */
export async function entrarComPin(
  cpfInformado: string,
  pin: string,
  ip: string,
  colaboradorIdEscolhido?: string,
): Promise<ResultadoEntradaPin> {
  // Normalizado UMA vez, aqui — a mesma string vai para o rate limit e para a
  // consulta. Dois lugares normalizando é balde furado por formatação.
  const cpf = (cpfInformado || "").replace(/\D/g, "");
  const erroGenerico = { ok: false as const, erro: "CPF ou PIN incorretos." };

  if (cpf.length !== 11 || !/^\d{4,6}$/.test(pin)) return erroGenerico;

  // Bloqueios ANTES do bcrypt — bcrypt é caro de propósito, e barrar antes é
  // o que impede a força bruta de gastar nossa CPU (mesma ordem do auth.ts).
  const agora = new Date();
  const porIp = await estadoDoLogin(CHAVE_POR_IP(cpf), ip, agora);
  if (porIp.bloqueado) {
    return {
      ok: false,
      erro: `Tentativas demais. Aguarde ${minutosAteLiberar(porIp.liberaEm!, agora)} minuto(s).`,
    };
  }
  const global = await estadoGlobal(cpf, agora);
  if (global.bloqueado) {
    return { ok: false, erro: "Tentativas demais para este CPF. Aguarde e tente de novo." };
  }

  const candidatos = await prisma.colaborador.findMany({
    where: { cpf, ativo: true, pontoLiberado: true, pontoPinHash: { not: null } },
    select: { id: true, pontoPinHash: true, empresa: { select: { nome: true } } },
  });

  // Compara contra TODOS, sempre — parar no primeiro acerto vazaria pelo
  // tempo em qual posição (empresa) o CPF está. Sem candidato nenhum, o
  // fantasma roda para o tempo de resposta não denunciar CPFs inexistentes.
  let validados: typeof candidatos = [];
  if (candidatos.length === 0) {
    await bcrypt.compare(pin, HASH_FANTASMA);
  } else {
    const resultados = await Promise.all(
      candidatos.map((c) => bcrypt.compare(pin, c.pontoPinHash!)),
    );
    validados = candidatos.filter((_, i) => resultados[i]);
  }

  if (validados.length === 0) {
    await registrarFalha(CHAVE_POR_IP(cpf), ip);
    await registrarFalha(CHAVE_GLOBAL(cpf), IP_GLOBAL);
    return erroGenerico;
  }

  await limparTentativas(CHAVE_POR_IP(cpf), ip);
  await limparTentativas(CHAVE_GLOBAL(cpf), IP_GLOBAL);

  if (validados.length > 1 && !colaboradorIdEscolhido) {
    return {
      ok: true,
      escolher: validados.map((v) => ({ colaboradorId: v.id, empresa: v.empresa.nome })),
    };
  }

  // Com escolha, o id TEM que estar entre os que o PIN validou nesta chamada
  // — id de fora vira o mesmo erro genérico de sempre.
  const escolhido = colaboradorIdEscolhido
    ? validados.find((v) => v.id === colaboradorIdEscolhido)
    : validados[0];
  if (!escolhido) return erroGenerico;

  const sessaoToken = novoToken();
  const expiraEm = new Date(Date.now() + HORAS_VALIDADE_SESSAO_PONTO * 60 * 60 * 1000);
  await prisma.pontoSessao.create({
    data: { colaboradorId: escolhido.id, tokenHash: hash(sessaoToken), expiraEm },
  });
  return { ok: true, sessaoToken, expiraEm, colaboradorId: escolhido.id };
}

export type SessaoPonto = {
  id: string;
  colaboradorId: string;
};

/** Lê a sessão do cookie. `null` quando não há, expirou, foi encerrada, ou o
 * colaborador perdeu a elegibilidade (desativado OU bloqueado pelo RH na aba
 * Colaboradores — o bloqueio derruba a sessão viva na hora, não só o próximo
 * login). */
export async function lerSessaoPonto(): Promise<SessaoPonto | null> {
  const cookie = (await cookies()).get(COOKIE_PONTO)?.value;
  if (!cookie) return null;

  const sessao = await prisma.pontoSessao.findUnique({
    where: { tokenHash: hash(cookie) },
    select: {
      id: true,
      colaboradorId: true,
      expiraEm: true,
      encerradaEm: true,
      colaborador: { select: { ativo: true, pontoLiberado: true } },
    },
  });
  if (!sessao || sessao.encerradaEm || sessao.expiraEm < new Date()) return null;
  if (!sessao.colaborador.ativo || !sessao.colaborador.pontoLiberado) return null;

  return { id: sessao.id, colaboradorId: sessao.colaboradorId };
}

export async function encerrarSessaoPonto(): Promise<void> {
  const jar = await cookies();
  const cookie = jar.get(COOKIE_PONTO)?.value;
  if (cookie) {
    await prisma.pontoSessao.updateMany({
      where: { tokenHash: hash(cookie), encerradaEm: null },
      data: { encerradaEm: new Date() },
    });
  }
  jar.delete(COOKIE_PONTO);
}

export async function definirCookieDePonto(token: string, expiraEm: Date): Promise<void> {
  (await cookies()).set(COOKIE_PONTO, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiraEm,
    path: "/",
  });
}
