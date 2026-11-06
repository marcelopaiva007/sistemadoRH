"use server";

import { randomBytes, createHash } from "node:crypto";
import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { usuarioPorLogin, usuariosPorEmail, type OndeProcurar } from "@/lib/usuario-por-identificador";
import { ondeDestaRequisicao } from "@/lib/endereco-cliente";
import { PAPEL_PORTAL } from "@/lib/delegacoes/acesso-colaborador";
import { sendEmail } from "@/lib/email";
import { registrarAuditoria } from "@/lib/audit";
import { estadoDoLogin, ipDaRequisicao, normalizarUsuario, registrarFalha } from "@/lib/login-tentativas";
import type { ActionResult } from "@/lib/constants";

const RECUPERACAO_EXPIRA_EM_HORAS = 1;

// DESDE A v1.191.0 O ACESSO É SÓ PELO NOME DE USUÁRIO (lib/login-usuario.ts):
// o "Esqueci minha senha" pede o USUÁRIO e manda o link para o e-mail
// cadastrado nele; o "Esqueci meu usuário" pede o E-MAIL e manda a lista dos
// usuários ligados a ele — pode ser mais de um, quando a pessoa tem um usuário
// por grupo (o "marcelo" e o "marcelo.lm" recebem no mesmo endereço).
//
// Nenhum dos dois revela para quem não está logado se a conta existe: a
// resposta é a mesma com ou sem conta, e sai antes de qualquer busca (ver
// `after`, mais abaixo). A única exceção não depende disso: os baldes de
// 15 min, que contam todo pedido.

// Tetos DIÁRIOS, por cima do balde de 15 min. O balde por (texto digitado, IP)
// só reduz a taxa: 5 a cada 15 min ainda são 85 e-mails em ~4 h — a cota
// diária inteira de envio (LIMITE_DIARIO_ENVIOS) — a partir de UM IP, e
// convites, cobranças e lembretes do resto do sistema ficam sem sair pelo
// resto do dia. Dois tetos em 24 h, contados só sobre e-mails que SAÍRAM
// (registrados depois do envio, não antes):
//   - por endereço de DESTINO, venha o pedido de que IP vier e por qual dos
//     usuários da pessoa: ninguém precisa de mais de 5 links num dia;
//   - de todos os pedidos somados (senha e usuário): protege a cota do resto
//     do sistema.
// Mesma mecânica do balde global de lib/ponto-pin-auth.ts (TentativaLogin com
// ip "*"); a faxina de 24 h daquela tabela coincide com a janela. Não são
// `export`: módulo "use server" só pode exportar funções assíncronas.
const CHAVE_DIA_EMAIL = (email: string) => `reset-dia:${email}`;
const CHAVE_DIA_GLOBAL = "reset-dia:*";
const IP_GLOBAL = "*";
const MAX_RESETS_POR_EMAIL_DIA = 5;
const MAX_RESETS_GLOBAL_DIA = 30;
const JANELA_DIA_MS = 24 * 60 * 60 * 1000;

async function enviosNoDia(chave: string): Promise<number> {
  return prisma.tentativaLogin.count({
    where: {
      username: normalizarUsuario(chave),
      ip: IP_GLOBAL,
      criadoEm: { gt: new Date(Date.now() - JANELA_DIA_MS) },
    },
  });
}

/** Já saíram e-mails demais hoje para este endereço, ou no total? */
async function tetoDoDiaAtingido(emailDestino: string): Promise<boolean> {
  const [noDiaEmail, noDiaGlobal] = await Promise.all([
    enviosNoDia(CHAVE_DIA_EMAIL(emailDestino)),
    enviosNoDia(CHAVE_DIA_GLOBAL),
  ]).catch(() => [0, 0]);
  return noDiaEmail >= MAX_RESETS_POR_EMAIL_DIA || noDiaGlobal >= MAX_RESETS_GLOBAL_DIA;
}

/** Conta nos tetos do dia um e-mail que SAIU. */
async function contarEnvioNoDia(emailDestino: string): Promise<void> {
  await Promise.all([
    registrarFalha(CHAVE_DIA_EMAIL(emailDestino), IP_GLOBAL),
    registrarFalha(CHAVE_DIA_GLOBAL, IP_GLOBAL),
  ]).catch(() => {});
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** "rh.assinelm.com/admin" — o endereço da área de administração, para o e-mail. */
function enderecoDoAdmin(baseUrl: string): string {
  return `${baseUrl.replace(/^https?:\/\//, "")}/admin`;
}

/** Nome, usuário e grupo vão para o HTML do e-mail: nada deles vira marcação. */
function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Balde por IP, somando os dois pedidos ("Esqueci minha senha" e "Esqueci meu
// usuário"): o balde por texto digitado sozinho deixava testar nomes à
// vontade — cada nome novo tinha um balde novo.
const CHAVE_PEDIDOS_DO_IP = "recuperacao:*";

/**
 * Conta o pedido e diz se ele passou do limite. GRAVA ANTES DE CONFERIR
 * (v1.192.0): conferindo antes, N pedidos em paralelo liam o balde ainda vazio
 * e passavam todos. Falha aberta se o banco reclamar — mesmo critério do login.
 *
 * O estado dos baldes não depende de a conta existir (todo pedido conta), então
 * a mensagem honesta de "muitos pedidos" não revela nada.
 */
async function pedidoBarrado(chave: string, ip: string): Promise<boolean> {
  await Promise.all([registrarFalha(chave, ip), registrarFalha(CHAVE_PEDIDOS_DO_IP, ip)]).catch(() => {});
  const [porTexto, porIp] = await Promise.all([
    estadoDoLogin(chave, ip).catch(() => null),
    estadoDoLogin(CHAVE_PEDIDOS_DO_IP, ip).catch(() => null),
  ]);
  return Boolean(porTexto?.bloqueado || porIp?.bloqueado);
}

const MENSAGEM_BARRADO = "Muitos pedidos seguidos. Aguarde alguns minutos e tente de novo.";

// A RESPOSTA NÃO PODE DEPENDER DE A CONTA EXISTIR (revisão da v1.191.0): nem
// no texto, nem no tempo. Até a v1.191.0 a busca, o token e o envio rodavam
// antes da resposta — conta real demorava centenas de ms a mais (o envio) e,
// com o envio fora do ar, só conta real ouvia "não foi possível enviar". Com o
// acesso só por usuário, isso dizia quais usuários existem ("master",
// "marcelo"...). Agora a resposta sai na hora, igual para todos, e o trabalho
// roda depois dela (`after`). Falha de envio vai para o log do servidor.

const solicitarSchema = z.object({ usuario: z.string().trim().min(1).max(200) });

/**
 * "Esqueci minha senha", pelo USUÁRIO. O link vai para o e-mail CADASTRADO na
 * conta — quem pede não escolhe para onde ele vai. Devolve `{ ok: true }`
 * exista o usuário ou não, tenha e-mail ou não (a tela diz o que fazer se nada
 * chegar).
 */
export async function solicitarRecuperacaoSenha(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = solicitarSchema.safeParse({ usuario: formData.get("usuario") });
  if (!parsed.success) return { ok: false, error: "Informe o seu usuário." };
  const digitado = parsed.data.usuario;

  const ip = ipDaRequisicao(await headers());
  if (await pedidoBarrado(`reset:${normalizarUsuario(digitado)}`, ip)) {
    return { ok: false, error: MENSAGEM_BARRADO };
  }

  // Endereço próprio do cliente (v1.198.0): procura só nele e o link volta
  // para ele. Mesma resposta em qualquer caso (não revela se a conta existe).
  const local = await ondeDestaRequisicao(await headers());
  if (local.bloqueado) return { ok: true };
  const baseUrl = local.baseUrl;
  after(() =>
    enviarLinkDeSenha(digitado, baseUrl, local.onde).catch((e) => console.error("[recuperacao-senha] pedido falhou:", e)),
  );
  return { ok: true };
}

/** O trabalho do "Esqueci minha senha", depois da resposta. */
async function enviarLinkDeSenha(digitado: string, baseUrl: string, onde: OndeProcurar): Promise<void> {
  // A mesma regra do login (sem diferença de maiúsculas, texto exato vence).
  // Acesso de portal (funcionário sem login) não ganha senha por aqui: é a
  // trava de lib/delegacoes/acesso-colaborador.ts, além do e-mail nulo.
  const user = await usuarioPorLogin(digitado, undefined, onde);
  if (!user || !user.ativo || user.role === PAPEL_PORTAL || !user.email) return;

  const emailDestino = user.email.trim().toLowerCase();
  if (await tetoDoDiaAtingido(emailDestino)) return;

  // O grupo ANTES de mexer no token: se esta consulta falhar, o link que a
  // pessoa já tinha continua valendo. Com um usuário por grupo, o mesmo
  // endereço pode receber links de contas diferentes — o e-mail diz de qual.
  const grupo = user.grupoId
    ? await prisma.grupo.findUnique({ where: { id: user.grupoId }, select: { nome: true } })
    : null;

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiraEm = new Date(Date.now() + RECUPERACAO_EXPIRA_EM_HORAS * 60 * 60 * 1000);

  // O token é salvo antes do envio para que o link seja utilizável assim que a
  // mensagem chegar. Se o envio falhar, o estado anterior é restaurado abaixo:
  // pedir recuperação não pode invalidar um link que ainda funciona sem
  // conseguir entregar o substituto.
  await prisma.user.update({
    where: { id: user.id },
    data: { recuperacaoSenhaTokenHash: tokenHash, recuperacaoSenhaExpiraEm: expiraEm },
  });

  const link = `${baseUrl}/redefinir-senha/${token}`;
  const nome = escaparHtml(user.nome);
  const usuario = escaparHtml(user.username);
  const deQualConta = grupo ? ` (${grupo.nome})` : "";
  // A conta de administrador (MASTER) entra por outra porta desde a v1.188.0:
  // o e-mail já diz qual, para o endereço não depender de memória.
  const ehContaAdmin = user.role === "MASTER";

  const html = `
      <p>Olá, ${nome},</p>
      <p>Recebemos um pedido para redefinir a senha do usuário <b>${usuario}</b>${escaparHtml(deQualConta)} no sistema de RH.</p>
      <p>No login, digite o usuário <b>${usuario}</b> — o acesso é pelo nome de usuário, não pelo e-mail.</p>${
        ehContaAdmin
          ? `
      <p>Esta é a conta de <b>administrador da FASTMAI</b>. Depois de criar a senha, entre pela Gestão FASTMAI: <a href="${baseUrl}/admin/login">${enderecoDoAdmin(baseUrl)}</a>.</p>`
          : ""
      }
      <p>Para criar uma senha nova, clique abaixo. O link expira em ${RECUPERACAO_EXPIRA_EM_HORAS} hora.</p>
      <p style="margin:24px 0">
        <a href="${link}" style="background:#0f172a;color:white;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">Redefinir senha</a>
      </p>
      <p>Ou cole este link no navegador:</p>
      <p style="word-break:break-all;color:#475569">${link}</p>
      <p>Se você não pediu isso, pode ignorar este e-mail — sua senha continua a mesma.</p>
    `.trim();

  // A chave inclui o hash deste token. Um novo pedido invalida o anterior,
  // portanto deduplicar apenas por endereço deixaria o usuário com o token
  // novo salvo no banco, mas sem receber um e-mail contendo esse token.
  const envio = await sendEmail({
    to: user.email,
    subject: `Redefinição de senha do usuário ${user.username} — Sistema de RH`,
    html,
    text: `Pedido para redefinir a senha do usuário ${user.username}${deQualConta}. No login, digite o usuário ${user.username} (o acesso é pelo nome de usuário, não pelo e-mail).${
      ehContaAdmin ? ` Esta é a conta de administrador da FASTMAI: depois de criar a senha, entre por ${baseUrl}/admin/login.` : ""
    } Acesse ${link} para redefinir sua senha. O link expira em ${RECUPERACAO_EXPIRA_EM_HORAS} hora.`,
    chave: `recuperacao-senha:${tokenHash}`,
  });

  if (!envio.ok) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        recuperacaoSenhaTokenHash: user.recuperacaoSenhaTokenHash,
        recuperacaoSenhaExpiraEm: user.recuperacaoSenhaExpiraEm,
      },
    });
    console.error(`[recuperacao-senha] envio do link falhou (conta ${user.id}): ${envio.error}`);
    return;
  }

  // Os tetos diários contam só o que SAIU: falha de envio não consome cota de
  // ninguém.
  await contarEnvioNoDia(emailDestino);
  await registrarAuditoria({
    acao: "RESET_SENHA",
    entidade: "User",
    entidadeId: user.id,
    resumo: `Solicitou redefinição de senha do usuário ${user.username} (link enviado ao e-mail cadastrado)`,
  });
}

const lembreteSchema = z.object({ email: z.string().trim().email() });

/**
 * "Esqueci meu usuário": manda para o e-mail informado os usuários ATIVOS
 * ligados a ele — um e-mail só, com todos, porque a mesma pessoa pode ter um
 * usuário por grupo. Devolve `{ ok: true }` exista conta ou não; o trabalho
 * roda depois da resposta, como no "Esqueci minha senha".
 */
export async function solicitarLembreteDeUsuario(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = lembreteSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { ok: false, error: "Informe um e-mail válido." };
  const email = parsed.data.email.toLowerCase();

  // Balde próprio por texto (errar aqui não bloqueia pedir a senha) e o balde
  // por IP, comum aos dois pedidos.
  const ip = ipDaRequisicao(await headers());
  if (await pedidoBarrado(`lembrete:${email}`, ip)) {
    return { ok: false, error: MENSAGEM_BARRADO };
  }

  const local = await ondeDestaRequisicao(await headers());
  if (local.bloqueado) return { ok: true };
  const baseUrl = local.baseUrl;
  after(() =>
    enviarLembreteDeUsuario(email, baseUrl, local.onde).catch((e) => console.error("[lembrete-usuario] pedido falhou:", e)),
  );
  return { ok: true };
}

/** O trabalho do "Esqueci meu usuário", depois da resposta. */
async function enviarLembreteDeUsuario(email: string, baseUrl: string, onde: OndeProcurar): Promise<void> {
  const contas = await usuariosPorEmail(email, undefined, onde);
  if (contas.length === 0) return;
  if (await tetoDoDiaAtingido(email)) return;

  const itens = contas.map((c) => {
    const usuario = escaparHtml(c.username);
    if (c.role === "MASTER") {
      return {
        html: `<li><b>${usuario}</b> (conta de administrador da FASTMAI — entra em <a href="${baseUrl}/admin/login">${enderecoDoAdmin(baseUrl)}</a>)</li>`,
        texto: `${c.username} (administrador da FASTMAI: ${baseUrl}/admin/login)`,
      };
    }
    const grupo = c.grupo?.nome ?? "sem grupo";
    return { html: `<li><b>${usuario}</b> (${escaparHtml(grupo)})</li>`, texto: `${c.username} (${grupo})` };
  });
  const varios = contas.length > 1;

  const html = `
      <p>Olá, ${escaparHtml(contas[0].nome)},</p>
      <p>${varios ? "Estes são os usuários de acesso ligados a este e-mail" : "Este é o seu usuário de acesso"} no sistema de RH:</p>
      <ul>${itens.map((i) => i.html).join("")}</ul>${
        varios
          ? `
      <p>Cada usuário entra nas empresas dele — use o da empresa em que vai trabalhar. A senha pode ser a mesma em todos.</p>`
          : ""
      }
      <p>No login, digite o usuário (não o e-mail): <a href="${baseUrl}/login">${baseUrl.replace(/^https?:\/\//, "")}/login</a>. Se também esqueceu a senha, use "Esqueci minha senha" na tela de login.</p>
      <p>Se você não pediu isso, pode ignorar este e-mail.</p>
    `.trim();

  const envio = await sendEmail({
    to: contas[0].email ?? email,
    subject: varios ? "Seus usuários de acesso — Sistema de RH" : "Seu usuário de acesso — Sistema de RH",
    html,
    text: `${varios ? "Seus usuários de acesso" : "Seu usuário de acesso"}: ${itens.map((i) => i.texto).join("; ")}. No login, digite o usuário (não o e-mail): ${baseUrl}/login.`,
  });
  if (!envio.ok) {
    console.error(`[lembrete-usuario] envio falhou (${contas.length} conta(s)): ${envio.error}`);
    return;
  }

  await contarEnvioNoDia(email);
  await Promise.all(
    contas.map((c) =>
      registrarAuditoria({
        acao: "LEMBRETE_USUARIO",
        entidade: "User",
        entidadeId: c.id,
        resumo: `Pediu o lembrete do usuário ${c.username} (enviado ao e-mail cadastrado)`,
      }),
    ),
  ).catch(() => {});
}

const redefinirSchema = z.object({
  token: z.string().trim().min(10),
  senha: z.string().min(8, "A senha deve ter pelo menos 8 caracteres."),
});

/**
 * Além do resultado, diz para onde a tela leva a pessoa depois: a conta de
 * administrador (MASTER) vai para o login DA ÁREA DE ADMIN — sem isso, quem
 * estivesse logado no mesmo navegador com a conta do dia a dia caía na home do
 * RH ao abrir /login, e precisava lembrar o endereço do admin.
 */
export async function redefinirSenhaComToken(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult & { destino?: string }> {
  const parsed = redefinirSchema.safeParse({
    token: formData.get("token"),
    senha: formData.get("senha"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const tokenHash = hashToken(parsed.data.token);

  const user = await prisma.user.findFirst({
    where: { recuperacaoSenhaTokenHash: tokenHash },
    select: { id: true, nome: true, role: true, recuperacaoSenhaExpiraEm: true },
  });
  if (!user) return { ok: false, error: "Link inválido ou já utilizado." };
  if (!user.recuperacaoSenhaExpiraEm || user.recuperacaoSenhaExpiraEm < new Date()) {
    return { ok: false, error: "Link expirado. Peça a redefinição de novo." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.senha, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      recuperacaoSenhaTokenHash: null,
      recuperacaoSenhaExpiraEm: null,
    },
  });

  await registrarAuditoria({
    acao: "RESET_SENHA",
    entidade: "User",
    entidadeId: user.id,
    resumo: `${user.nome} redefiniu a própria senha pelo link de e-mail`,
  });

  return { ok: true, destino: user.role === "MASTER" ? "/admin/login" : "/login" };
}
