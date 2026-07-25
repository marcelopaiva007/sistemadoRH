// Autenticação do portal do colaborador — sem senha.
//
// Quem autentica é o bot do Telegram: a pessoa já provou quem é quando vinculou
// o chat_id, então pede /portal e recebe, só naquele chat, um link de vida curta
// e uso único. Abrir o link queima o token e troca por uma sessão em cookie.
//
// Nenhum token é guardado em claro — só o SHA-256. Um vazamento do banco não
// pode virar acesso ao portal.
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const COOKIE_SESSAO = "portal_sessao";

/** Vida do link mandado pelo bot. Curto de propósito: é o que trafega no chat. */
export const MINUTOS_VALIDADE_LINK = 15;
/** Vida da sessão depois de aberta — um turno de trabalho. */
export const HORAS_VALIDADE_SESSAO = 12;
/** Errou o CPF esse tanto de vezes, a sessão morre e é preciso pedir outro link. */
export const MAXIMO_TENTATIVAS_CPF = 5;
/** Janela em que pedir /portal de novo devolve o mesmo link, em vez de gerar outro. */
const SEGUNDOS_REAPROVEITA_LINK = 60;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const novoToken = () => randomBytes(32).toString("base64url");

export type ResultadoLink =
  | { ok: true; url: string; expiraEm: Date }
  | { ok: false; motivo: "sem_url_publica" | "link_recente" };

/**
 * Gera o link de entrada de um colaborador. Devolve o token em claro uma única
 * vez — é o que vai na mensagem do bot e nunca mais existe em lugar nenhum.
 */
export async function criarLinkDeAcesso(
  colaboradorId: string,
  canal: "TELEGRAM" | "RH" = "TELEGRAM",
): Promise<ResultadoLink> {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) return { ok: false, motivo: "sem_url_publica" };

  const agora = new Date();

  // Toque repetido no /portal (ou update duplicado do Telegram) não pode virar
  // uma fila de links válidos. Como só o hash foi guardado, o link anterior não
  // é recuperável: dentro da janela, o certo é não gerar outro e o chamador
  // avisar que o link já foi enviado.
  const recente = await prisma.portalAcesso.findFirst({
    where: {
      colaboradorId,
      usadoEm: null,
      expiraEm: { gt: agora },
      createdAt: { gt: new Date(agora.getTime() - SEGUNDOS_REAPROVEITA_LINK * 1000) },
    },
    select: { id: true },
  });
  if (recente) return { ok: false, motivo: "link_recente" };

  const token = novoToken();
  const expiraEm = new Date(agora.getTime() + MINUTOS_VALIDADE_LINK * 60 * 1000);

  await prisma.$transaction([
    // Pedir um link novo invalida os anteriores: no máximo um link vivo por vez.
    prisma.portalAcesso.updateMany({
      where: { colaboradorId, usadoEm: null },
      data: { usadoEm: agora },
    }),
    prisma.portalAcesso.create({
      data: { colaboradorId, tokenHash: hash(token), expiraEm, canal },
    }),
  ]);

  return { ok: true, url: `${base}/portal/entrar/${token}`, expiraEm };
}

export type ResultadoEntrada =
  | { ok: true; sessaoToken: string; expiraEm: Date; colaboradorId: string }
  | { ok: false; motivo: "invalido" | "expirado" | "usado" };

/**
 * Queima o token de entrada e abre uma sessão. O `updateMany` com
 * `usadoEm: null` é o que garante uso único mesmo se o link for aberto duas
 * vezes ao mesmo tempo (pré-visualização do Telegram, duplo toque).
 */
export async function consumirLinkDeAcesso(token: string): Promise<ResultadoEntrada> {
  const acesso = await prisma.portalAcesso.findUnique({
    where: { tokenHash: hash(token) },
    select: { id: true, colaboradorId: true, expiraEm: true, usadoEm: true },
  });
  if (!acesso) return { ok: false, motivo: "invalido" };
  if (acesso.usadoEm) return { ok: false, motivo: "usado" };
  if (acesso.expiraEm < new Date()) return { ok: false, motivo: "expirado" };

  const { count } = await prisma.portalAcesso.updateMany({
    where: { id: acesso.id, usadoEm: null },
    data: { usadoEm: new Date() },
  });
  if (count === 0) return { ok: false, motivo: "usado" };

  const sessaoToken = novoToken();
  const expiraEm = new Date(Date.now() + HORAS_VALIDADE_SESSAO * 60 * 60 * 1000);
  await prisma.portalSessao.create({
    data: { colaboradorId: acesso.colaboradorId, tokenHash: hash(sessaoToken), expiraEm },
  });

  return { ok: true, sessaoToken, expiraEm, colaboradorId: acesso.colaboradorId };
}

export type SessaoPortal = {
  id: string;
  colaboradorId: string;
  tentativasCpf: number;
  verificado: boolean;
};

/** Lê a sessão do cookie. `null` quando não há, expirou ou foi encerrada. */
export async function lerSessaoPortal(): Promise<SessaoPortal | null> {
  const cookie = (await cookies()).get(COOKIE_SESSAO)?.value;
  if (!cookie) return null;

  const sessao = await prisma.portalSessao.findUnique({
    where: { tokenHash: hash(cookie) },
    select: {
      id: true,
      colaboradorId: true,
      expiraEm: true,
      encerradaEm: true,
      tentativasCpf: true,
      colaborador: { select: { ativo: true, portalVerificadoEm: true } },
    },
  });
  if (!sessao || sessao.encerradaEm || sessao.expiraEm < new Date()) return null;
  // Desligou ou foi desativado: o acesso cai junto.
  if (!sessao.colaborador.ativo) return null;

  return {
    id: sessao.id,
    colaboradorId: sessao.colaboradorId,
    tentativasCpf: sessao.tentativasCpf,
    verificado: sessao.colaborador.portalVerificadoEm !== null,
  };
}

export async function encerrarSessaoPortal(sessaoId?: string): Promise<void> {
  const jar = await cookies();
  const cookie = jar.get(COOKIE_SESSAO)?.value;
  if (sessaoId) {
    await prisma.portalSessao.updateMany({
      where: { id: sessaoId, encerradaEm: null },
      data: { encerradaEm: new Date() },
    });
  } else if (cookie) {
    await prisma.portalSessao.updateMany({
      where: { tokenHash: hash(cookie), encerradaEm: null },
      data: { encerradaEm: new Date() },
    });
  }
  jar.delete(COOKIE_SESSAO);
}

export async function definirCookieDeSessao(token: string, expiraEm: Date): Promise<void> {
  (await cookies()).set(COOKIE_SESSAO, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiraEm,
    path: "/",
  });
}

/**
 * Compara CPF em tempo constante. Exagero? Não custa nada, e aqui o que se
 * compara é o segredo que libera salário e documentos.
 */
export function cpfConfere(informado: string, cadastrado: string | null): boolean {
  const a = Buffer.from((informado || "").replace(/\D/g, ""));
  const b = Buffer.from(cadastrado ?? "");
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
