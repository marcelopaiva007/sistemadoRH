"use server";

import Anthropic from "@anthropic-ai/sdk";
import nodemailer from "nodemailer";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { cifrar, dicaDe } from "@/lib/cripto";
import {
  CHAVE_ANTHROPIC,
  CHAVE_EMAIL_FROM,
  CHAVE_SMTP_HOST,
  CHAVE_SMTP_PASS,
  CHAVE_SMTP_PORT,
  CHAVE_SMTP_USER,
  CHAVE_TELEGRAM,
  gravarSegredo,
  PAPEIS_QUE_CONFIGURAM,
} from "@/lib/segredos";
import type { ActionResult } from "@/lib/constants";

/**
 * Cadastro da chave da Anthropic pela tela.
 *
 * ADMIN e DIRETORIA, os mesmos dois papéis da gestão de usuários — e pelo
 * mesmo motivo que está em `requireGestaoUsuarios`: a diretoria já pode criar
 * um ADMIN e com isso se promover, então exigir ADMIN aqui não seria uma
 * barreira, só um desvio. Na primeira versão desta tela era só ADMIN, e o
 * efeito prático foi deixar o dono do sistema — que é DIRETORIA — sem
 * conseguir ligar o recurso que pediu.
 *
 * O que a restrição de fato guarda: quem grava a chave passa a poder gastar na
 * conta da Anthropic do grupo. RH_MANAGER e GESTOR_SETOR ficam de fora.
 *
 * Guarda própria em vez de `requireGestaoUsuarios` para a tela receber a
 * recusa como mensagem, em vez de um redirect silencioso no meio do
 * formulário.
 *
 * A chave entra, nunca sai: nenhuma action deste arquivo devolve o valor, e o
 * banco guarda a versão cifrada (lib/cripto.ts).
 */
async function exigirPapel(): Promise<
  { ok: true; user: { id: string; nome?: string | null } } | { ok: false; error: string }
> {
  const user = await requireUser();
  if (!PAPEIS_QUE_CONFIGURAM.includes(user.role as string)) {
    return { ok: false, error: "Só a administração ou a diretoria pode alterar a chave da API." };
  }
  return { ok: true, user };
}

export async function salvarChaveAnthropic(empresaId: string, chave: string): Promise<ActionResult> {
  const permissao = await exigirPapel();
  if (!permissao.ok) return permissao;

  // Colar de um e-mail ou do console traz espaço e quebra de linha junto, e o
  // erro apareceria só na primeira pergunta, como "chave recusada".
  const valor = chave.trim();
  if (!valor) return { ok: false, error: "Cole a chave." };
  if (/\s/.test(valor)) return { ok: false, error: "A chave não pode conter espaços — verifique o que foi colado." };

  // Vale mais testar contra a API do que conferir o formato: o formato da
  // chave é da Anthropic e pode mudar, e uma chave revogada passa em qualquer
  // validação de prefixo. Esta chamada é de listagem, não consome tokens.
  try {
    await new Anthropic({ apiKey: valor }).models.list({ limit: 1 });
  } catch (e) {
    const status = (e as { status?: number })?.status;
    if (status === 401 || status === 403) {
      return { ok: false, error: "A Anthropic recusou essa chave. Confira se copiou inteira e se ela ainda está ativa." };
    }
    console.error("[segredos] falha ao validar a chave da Anthropic:", e);
    return { ok: false, error: "Não consegui falar com a Anthropic para conferir a chave. Tente de novo em instantes." };
  }

  const dica = dicaDe(valor);
  await prisma.segredoApp.upsert({
    where: { chave: CHAVE_ANTHROPIC },
    create: {
      chave: CHAVE_ANTHROPIC,
      valor: cifrar(valor),
      dica,
      atualizadoPor: permissao.user.nome ?? permissao.user.id,
    },
    update: {
      valor: cifrar(valor),
      dica,
      atualizadoPor: permissao.user.nome ?? permissao.user.id,
    },
  });

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "SegredoApp",
    entidadeId: CHAVE_ANTHROPIC,
    // A dica entra na trilha, a chave não. Serve para reconhecer QUAL chave
    // passou a valer sem que a trilha vire um lugar onde se lê credencial.
    resumo: `Chave da API da Anthropic cadastrada (final ${dica}). O assistente de RH passou a funcionar.`,
  });

  revalidatePath(`/rh/${empresaId}/assistente`);
  return { ok: true };
}

/**
 * Cadastro do token do bot do Telegram pela tela (Canais de envio). Mesmo
 * padrão da chave da Anthropic acima: testa contra a API antes de gravar,
 * cifra, nunca devolve o valor. Diferença: aqui a variável de ambiente
 * TELEGRAM_BOT_TOKEN — se existir na Vercel — continua tendo prioridade (ver
 * lib/segredos.ts `segredo()`), então cadastrar aqui não desliga um bot já
 * ativo via env var; só passa a valer se um dia a variável sair do projeto.
 */
export async function salvarTelegramToken(empresaId: string, token: string): Promise<ActionResult> {
  const permissao = await exigirPapel();
  if (!permissao.ok) return permissao;

  const valor = token.trim();
  if (!valor) return { ok: false, error: "Cole o token." };
  if (/\s/.test(valor)) return { ok: false, error: "O token não pode conter espaços — verifique o que foi colado." };

  let nomeDoBot: string;
  try {
    const res = await fetch(`https://api.telegram.org/bot${valor}/getMe`);
    const body = (await res.json()) as { ok: boolean; result?: { username?: string }; description?: string };
    if (!body.ok) {
      return { ok: false, error: `O Telegram recusou esse token: ${body.description ?? "verifique se copiou inteiro"}.` };
    }
    nomeDoBot = body.result?.username ? `@${body.result.username}` : "bot";
  } catch {
    return { ok: false, error: "Não consegui falar com o Telegram para conferir o token. Tente de novo em instantes." };
  }

  const dica = dicaDe(valor);
  await gravarSegredo(CHAVE_TELEGRAM, valor, dica, permissao.user.nome ?? permissao.user.id);

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "SegredoApp",
    entidadeId: CHAVE_TELEGRAM,
    resumo: `Token do bot do Telegram cadastrado (${nomeDoBot}, final ${dica}). Convites e portal por Telegram passaram a funcionar.`,
  });

  revalidatePath(`/rh/${empresaId}/canais`);
  return { ok: true };
}

export async function removerTelegramToken(empresaId: string): Promise<ActionResult> {
  const permissao = await exigirPapel();
  if (!permissao.ok) return permissao;

  const existente = await prisma.segredoApp.findUnique({
    where: { chave: CHAVE_TELEGRAM },
    select: { dica: true },
  });
  if (!existente) return { ok: false, error: "Não há token cadastrado para remover." };

  await prisma.segredoApp.delete({ where: { chave: CHAVE_TELEGRAM } });

  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "SegredoApp",
    entidadeId: CHAVE_TELEGRAM,
    resumo: `Token do bot do Telegram removido (final ${existente.dica}). Convites e portal por Telegram pararam de funcionar.`,
  });

  revalidatePath(`/rh/${empresaId}/canais`);
  return { ok: true };
}

/**
 * Cadastro do SMTP pela tela. Testa a conexão com `transporter.verify()`
 * (handshake + autenticação, sem mandar e-mail nenhum) antes de gravar as
 * cinco chaves — mesma filosofia de "testar contra o provedor real" da chave
 * da Anthropic e do token do Telegram acima.
 */
export async function salvarSmtp(
  empresaId: string,
  dados: { host: string; port: string; user: string; pass: string; from: string },
): Promise<ActionResult> {
  const permissao = await exigirPapel();
  if (!permissao.ok) return permissao;

  const host = dados.host.trim();
  const user = dados.user.trim();
  const pass = dados.pass; // senha pode legitimamente ter espaço
  const from = dados.from.trim();
  const portNum = Number(dados.port.trim() || 587);

  if (!host || !user || !pass) {
    return { ok: false, error: "Preencha host, usuário e senha." };
  }
  if (!Number.isInteger(portNum) || portNum <= 0 || portNum > 65535) {
    return { ok: false, error: "Porta inválida — use 587 (STARTTLS) ou 465 (TLS)." };
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port: portNum,
      secure: portNum === 465,
      auth: { user, pass },
      connectionTimeout: 10_000,
    });
    await transporter.verify();
  } catch (e) {
    console.error("[segredos] falha ao validar SMTP:", e);
    return {
      ok: false,
      error: "Não consegui autenticar nesse servidor SMTP. Confira host, porta, usuário e senha.",
    };
  }

  const quem = permissao.user.nome ?? permissao.user.id;
  await Promise.all([
    gravarSegredo(CHAVE_SMTP_HOST, host, host, quem),
    gravarSegredo(CHAVE_SMTP_PORT, String(portNum), String(portNum), quem),
    gravarSegredo(CHAVE_SMTP_USER, user, user, quem),
    gravarSegredo(CHAVE_SMTP_PASS, pass, dicaDe(pass), quem),
    // Remetente é opcional — se vazio, lib/email.ts cai no próprio SMTP_USER.
    // Ainda assim grava (mesmo que vazio) para não deixar um valor de EMAIL_FROM
    // de uma configuração anterior "vazando" por trás.
    gravarSegredo(CHAVE_EMAIL_FROM, from, from || "(igual ao usuário)", quem),
  ]);

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "SegredoApp",
    entidadeId: "SMTP",
    resumo: `Configuração de SMTP cadastrada (${host}, usuário ${user}). E-mails de convite e lembrete passaram a poder ser enviados.`,
  });

  revalidatePath(`/rh/${empresaId}/canais`);
  return { ok: true };
}

export async function removerSmtp(empresaId: string): Promise<ActionResult> {
  const permissao = await exigirPapel();
  if (!permissao.ok) return permissao;

  const existente = await prisma.segredoApp.findUnique({
    where: { chave: CHAVE_SMTP_HOST },
    select: { dica: true },
  });
  if (!existente) return { ok: false, error: "Não há SMTP cadastrado para remover." };

  await prisma.segredoApp.deleteMany({
    where: { chave: { in: [CHAVE_SMTP_HOST, CHAVE_SMTP_PORT, CHAVE_SMTP_USER, CHAVE_SMTP_PASS, CHAVE_EMAIL_FROM] } },
  });

  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "SegredoApp",
    entidadeId: "SMTP",
    resumo: `Configuração de SMTP removida (era ${existente.dica}). Envio de e-mail de convite e lembrete parou de funcionar.`,
  });

  revalidatePath(`/rh/${empresaId}/canais`);
  return { ok: true };
}

export async function removerChaveAnthropic(empresaId: string): Promise<ActionResult> {
  const permissao = await exigirPapel();
  if (!permissao.ok) return permissao;

  const existente = await prisma.segredoApp.findUnique({
    where: { chave: CHAVE_ANTHROPIC },
    select: { dica: true },
  });
  if (!existente) return { ok: false, error: "Não há chave cadastrada para remover." };

  await prisma.segredoApp.delete({ where: { chave: CHAVE_ANTHROPIC } });

  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "SegredoApp",
    entidadeId: CHAVE_ANTHROPIC,
    resumo: `Chave da API da Anthropic removida (final ${existente.dica}). O assistente de RH voltou a ficar desligado.`,
  });

  revalidatePath(`/rh/${empresaId}/assistente`);
  return { ok: true };
}
