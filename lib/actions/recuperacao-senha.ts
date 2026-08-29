"use server";

import { randomBytes, createHash } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { registrarAuditoria } from "@/lib/audit";
import { estadoDoLogin, ipDaRequisicao, registrarFalha } from "@/lib/login-tentativas";
import type { ActionResult } from "@/lib/constants";

const RECUPERACAO_EXPIRA_EM_HORAS = 1;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const solicitarSchema = z.object({ email: z.string().trim().email() });

/**
 * Sempre devolve `{ ok: true }`, exista o e-mail ou não — a tela de "esqueci
 * minha senha" não pode confirmar para quem não está logado se um endereço
 * tem conta no sistema.
 */
export async function solicitarRecuperacaoSenha(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = solicitarSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { ok: false, error: "Informe um e-mail válido." };
  const email = parsed.data.email.toLowerCase();

  // Rate limit por (e-mail, IP), reaproveitando o balde do login (5 em 15 min).
  // Sem isso, cada pedido dispara um e-mail: dá para bombardear um endereço
  // conhecido e ESGOTAR a cota diária de envio compartilhada — convites,
  // pesquisas e lembretes ficariam sem sair. Bloqueado, devolve o mesmo
  // `{ ok: true }` genérico (não revela se o e-mail existe) e não envia nada.
  const ip = ipDaRequisicao(await headers());
  const chaveLimite = `reset:${email}`;
  const limite = await estadoDoLogin(chaveLimite, ip).catch(() => null);
  if (limite?.bloqueado) return { ok: true };
  await registrarFalha(chaveLimite, ip).catch(() => {});

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      nome: true,
      ativo: true,
      recuperacaoSenhaTokenHash: true,
      recuperacaoSenhaExpiraEm: true,
    },
  });

  if (user && user.ativo) {
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    const expiraEm = new Date(Date.now() + RECUPERACAO_EXPIRA_EM_HORAS * 60 * 60 * 1000);

    // O token é salvo antes do envio para que o link seja utilizável assim que
    // a mensagem chegar. Se o SMTP falhar, o estado anterior é restaurado
    // abaixo: pedir recuperação não pode invalidar um link que ainda funciona
    // sem conseguir entregar o substituto.
    await prisma.user.update({
      where: { id: user.id },
      data: { recuperacaoSenhaTokenHash: tokenHash, recuperacaoSenhaExpiraEm: expiraEm },
    });

    const baseUrl = process.env.NEXTAUTH_URL ?? process.env.APP_URL ?? "http://localhost:3000";
    const link = `${baseUrl}/redefinir-senha/${token}`;

    const html = `
      <p>Olá, ${user.nome},</p>
      <p>Recebemos um pedido para redefinir sua senha no sistema de RH.</p>
      <p>Para criar uma senha nova, clique abaixo. O link expira em ${RECUPERACAO_EXPIRA_EM_HORAS} hora.</p>
      <p style="margin:24px 0">
        <a href="${link}" style="background:#0f172a;color:white;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">Redefinir senha</a>
      </p>
      <p>Ou cole este link no navegador:</p>
      <p style="word-break:break-all;color:#475569">${link}</p>
      <p>Se você não pediu isso, pode ignorar este e-mail — sua senha continua a mesma.</p>
    `.trim();

    // A chave inclui o hash deste token. Um novo pedido invalida o anterior,
    // portanto deduplicar apenas por e-mail deixaria o usuário com o token novo
    // salvo no banco, mas sem receber um e-mail contendo esse token.
    const envio = await sendEmail({
      to: email,
      subject: "Redefinição de senha — Sistema de RH",
      html,
      text: `Acesse ${link} para redefinir sua senha. O link expira em ${RECUPERACAO_EXPIRA_EM_HORAS} hora.`,
      chave: `recuperacao-senha:${tokenHash}`,
    });

    if (envio.ok) {
      await registrarAuditoria({
        acao: "RESET_SENHA",
        entidade: "User",
        entidadeId: user.id,
        resumo: `Solicitou redefinição de senha por e-mail (${email})`,
      });
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          recuperacaoSenhaTokenHash: user.recuperacaoSenhaTokenHash,
          recuperacaoSenhaExpiraEm: user.recuperacaoSenhaExpiraEm,
        },
      });
      // Não revelamos se o endereço existe, mas uma falha operacional precisa
      // aparecer para quem fez o pedido; caso contrário o fluxo parece concluído
      // quando o SMTP está desligado ou indisponível.
      return { ok: false, error: "Não foi possível enviar o link agora. Tente novamente em alguns minutos." };
    }
  }

  return { ok: true };
}

const redefinirSchema = z.object({
  token: z.string().trim().min(10),
  senha: z.string().min(8, "A senha deve ter pelo menos 8 caracteres."),
});

export async function redefinirSenhaComToken(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = redefinirSchema.safeParse({
    token: formData.get("token"),
    senha: formData.get("senha"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const tokenHash = hashToken(parsed.data.token);

  const user = await prisma.user.findFirst({
    where: { recuperacaoSenhaTokenHash: tokenHash },
    select: { id: true, nome: true, recuperacaoSenhaExpiraEm: true },
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

  return { ok: true };
}
