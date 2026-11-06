"use server";

import { randomBytes, createHash } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { usuarioPorLogin, usuariosPorEmail } from "@/lib/usuario-por-identificador";
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
// resposta é a mesma com ou sem conta. As exceções não dependem disso — o
// balde de 15 min (conta todo pedido) e a falha operacional de envio.

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

function urlBase(): string {
  return process.env.NEXTAUTH_URL ?? process.env.APP_URL ?? "http://localhost:3000";
}

/** "rh.assinelm.com/admin" — o endereço da área de administração, para o e-mail. */
function enderecoDoAdmin(baseUrl: string): string {
  return `${baseUrl.replace(/^https?:\/\//, "")}/admin`;
}

const solicitarSchema = z.object({ usuario: z.string().trim().min(1).max(200) });

/**
 * "Esqueci minha senha", pelo USUÁRIO. O link vai para o e-mail CADASTRADO na
 * conta — quem pede não escolhe para onde ele vai. Devolve `{ ok: true }`
 * exista o usuário ou não, tenha e-mail ou não (a tela diz o que fazer se
 * nada chegar).
 */
export async function solicitarRecuperacaoSenha(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = solicitarSchema.safeParse({ usuario: formData.get("usuario") });
  if (!parsed.success) return { ok: false, error: "Informe o seu usuário." };
  const digitado = parsed.data.usuario;

  // Rate limit por (usuário digitado, IP), reaproveitando o balde do login
  // (5 em 15 min). Falha ABERTA se o banco reclamar — mesmo critério do login.
  //
  // O balde conta TODO pedido, exista o usuário ou não, e é gravado antes da
  // busca (janela de um roundtrip, como no login): por isso pode responder com
  // uma mensagem honesta quando bloqueia — o estado dele não depende de o
  // usuário existir, então não revela nada. Já os tetos diários contam só
  // e-mails que SAÍRAM (só existem para conta real), e por isso, quando
  // barram, devolvem o mesmo `{ ok: true }` de sempre.
  const ip = ipDaRequisicao(await headers());
  const chaveLimite = `reset:${normalizarUsuario(digitado)}`;
  const limite = await estadoDoLogin(chaveLimite, ip).catch(() => null);
  if (limite?.bloqueado) {
    return { ok: false, error: "Muitos pedidos seguidos. Aguarde alguns minutos e tente de novo." };
  }
  await registrarFalha(chaveLimite, ip).catch(() => {});

  // A mesma regra do login (sem diferença de maiúsculas, texto exato vence).
  // Acesso de portal (funcionário sem login) não ganha senha por aqui: é a
  // trava de lib/delegacoes/acesso-colaborador.ts, além do e-mail nulo.
  const user = await usuarioPorLogin(digitado);
  if (!user || !user.ativo || user.role === PAPEL_PORTAL || !user.email) return { ok: true };

  const emailDestino = user.email.trim().toLowerCase();
  if (await tetoDoDiaAtingido(emailDestino)) return { ok: true };

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

  const baseUrl = urlBase();
  const link = `${baseUrl}/redefinir-senha/${token}`;
  // Com um usuário por grupo, o mesmo endereço pode receber links de contas
  // diferentes: o e-mail diz de qual usuário (e grupo) é este.
  const grupo = user.grupoId
    ? await prisma.grupo.findUnique({ where: { id: user.grupoId }, select: { nome: true } })
    : null;
  const deQualConta = grupo ? ` (${grupo.nome})` : "";
  // A conta de administrador (MASTER) entra por outra porta desde a v1.188.0:
  // o e-mail já diz qual, para o endereço não depender de memória.
  const ehContaAdmin = user.role === "MASTER";

  const html = `
      <p>Olá, ${user.nome},</p>
      <p>Recebemos um pedido para redefinir a senha do usuário <b>${user.username}</b>${deQualConta} no sistema de RH.</p>
      <p>No login, digite o usuário <b>${user.username}</b> — o acesso é pelo nome de usuário, não pelo e-mail.</p>${
        ehContaAdmin
          ? `
      <p>Esta é a conta de <b>administrador do sistema</b>. Depois de criar a senha, entre pela área de administração: <a href="${baseUrl}/admin/login">${enderecoDoAdmin(baseUrl)}</a>.</p>`
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
      ehContaAdmin ? ` Esta é a conta de administrador do sistema: depois de criar a senha, entre por ${baseUrl}/admin/login.` : ""
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
    // Não revelamos se o usuário existe, mas uma falha operacional precisa
    // aparecer para quem fez o pedido; caso contrário o fluxo parece concluído
    // quando o envio está desligado ou indisponível.
    return { ok: false, error: "Não foi possível enviar o link agora. Tente novamente em alguns minutos." };
  }

  // Os tetos diários contam só o que SAIU: falha de envio não consome cota de
  // ninguém. (O balde de 15 min, esse já foi gravado lá em cima.)
  await contarEnvioNoDia(emailDestino);
  await registrarAuditoria({
    acao: "RESET_SENHA",
    entidade: "User",
    entidadeId: user.id,
    resumo: `Solicitou redefinição de senha do usuário ${user.username} (link enviado ao e-mail cadastrado)`,
  });
  return { ok: true };
}

const lembreteSchema = z.object({ email: z.string().trim().email() });

/**
 * "Esqueci meu usuário": manda para o e-mail informado os usuários ATIVOS
 * ligados a ele — um e-mail só, com todos, porque a mesma pessoa pode ter um
 * usuário por grupo. Devolve `{ ok: true }` exista conta ou não.
 */
export async function solicitarLembreteDeUsuario(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = lembreteSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { ok: false, error: "Informe um e-mail válido." };
  const email = parsed.data.email.toLowerCase();

  // Mesmo balde e mesmos tetos do "Esqueci minha senha" (ver lá em cima). O
  // balde tem prefixo próprio: errar aqui não bloqueia pedir a senha.
  const ip = ipDaRequisicao(await headers());
  const chaveLimite = `lembrete:${email}`;
  const limite = await estadoDoLogin(chaveLimite, ip).catch(() => null);
  if (limite?.bloqueado) {
    return { ok: false, error: "Muitos pedidos seguidos. Aguarde alguns minutos e tente de novo." };
  }
  await registrarFalha(chaveLimite, ip).catch(() => {});

  const contas = await usuariosPorEmail(email);
  if (contas.length === 0) return { ok: true };
  if (await tetoDoDiaAtingido(email)) return { ok: true };

  const baseUrl = urlBase();
  const itens = contas.map((c) => {
    const onde =
      c.role === "MASTER"
        ? `conta de administrador — entra em <a href="${baseUrl}/admin/login">${enderecoDoAdmin(baseUrl)}</a>`
        : c.grupo?.nome ?? "sem grupo";
    return { html: `<li><b>${c.username}</b> (${onde})</li>`, texto: `${c.username} (${c.role === "MASTER" ? `administrador: ${baseUrl}/admin/login` : (c.grupo?.nome ?? "sem grupo")})` };
  });
  const varios = contas.length > 1;

  const html = `
      <p>Olá, ${contas[0].nome},</p>
      <p>${varios ? "Estes são os usuários de acesso ligados a este e-mail" : "Este é o seu usuário de acesso"} no sistema de RH:</p>
      <ul>${itens.map((i) => i.html).join("")}</ul>${
        varios
          ? `
      <p>Cada usuário entra em um grupo de empresas. Use o do grupo em que vai trabalhar — a senha pode ser a mesma nos dois.</p>`
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
    return { ok: false, error: "Não foi possível enviar agora. Tente novamente em alguns minutos." };
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
  return { ok: true };
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
