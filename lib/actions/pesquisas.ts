"use server";

import crypto from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { sendTelegramMessage } from "@/lib/telegram";
import type { ActionResult } from "@/lib/constants";

const STATUSES = ["DRAFT", "ACTIVE", "FINISHED", "ARCHIVED"] as const;
const TIPOS_PERGUNTA = ["LIKERT_5", "NPS_10", "MULTIPLE_CHOICE", "TEXT"] as const;
const DIMENSOES_GPTW = [
  "CREDIBILIDADE",
  "RESPEITO",
  "IMPARCIALIDADE",
  "ORGULHO",
  "CAMARADAGEM",
  "GERAL",
] as const;

const pesquisaSchema = z.object({
  titulo: z.string().trim().min(3, "Informe o título da pesquisa"),
  descricao: z.string().trim().optional(),
  anonima: z.coerce.boolean().default(true),
});

export async function createPesquisa(
  empresaId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireEmpresaAccess(empresaId);
  const parsed = pesquisaSchema.safeParse({
    titulo: formData.get("titulo"),
    descricao: formData.get("descricao") || undefined,
    anonima: formData.get("anonima") === "on" || formData.get("anonima") === "true",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const pesquisa = await prisma.pesquisa.create({
    data: {
      empresaId,
      titulo: parsed.data.titulo,
      descricao: parsed.data.descricao || null,
      anonima: parsed.data.anonima,
      criadoPorId: user?.id ?? null,
    },
  });

  revalidatePath(`/rh/${empresaId}/pesquisas`);
  redirect(`/rh/${empresaId}/pesquisas/${pesquisa.id}`);
}

export async function updatePesquisa(
  empresaId: string,
  id: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  const parsed = pesquisaSchema.safeParse({
    titulo: formData.get("titulo"),
    descricao: formData.get("descricao") || undefined,
    anonima: formData.get("anonima") === "on" || formData.get("anonima") === "true",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  await prisma.pesquisa.update({
    where: { id, empresaId },
    data: {
      titulo: parsed.data.titulo,
      descricao: parsed.data.descricao || null,
      anonima: parsed.data.anonima,
    },
  });

  revalidatePath(`/rh/${empresaId}/pesquisas`);
  revalidatePath(`/rh/${empresaId}/pesquisas/${id}`);
  return { ok: true };
}

export async function alterarStatusPesquisa(
  empresaId: string,
  id: string,
  novoStatus: (typeof STATUSES)[number]
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  if (!STATUSES.includes(novoStatus)) return { ok: false, error: "Status inválido." };

  const pesquisa = await prisma.pesquisa.findFirst({ where: { id, empresaId } });
  if (!pesquisa) return { ok: false, error: "Pesquisa não encontrada." };

  if (novoStatus === "ACTIVE") {
    const perguntas = await prisma.pergunta.count({ where: { pesquisaId: id } });
    if (perguntas === 0) {
      return { ok: false, error: "Adicione pelo menos uma pergunta antes de ativar a pesquisa." };
    }
  }

  await prisma.pesquisa.update({
    where: { id, empresaId },
    data: {
      status: novoStatus,
      iniciadaEm: novoStatus === "ACTIVE" && !pesquisa.iniciadaEm ? new Date() : pesquisa.iniciadaEm,
      encerradaEm: novoStatus === "FINISHED" ? new Date() : pesquisa.encerradaEm,
    },
  });

  revalidatePath(`/rh/${empresaId}/pesquisas`);
  revalidatePath(`/rh/${empresaId}/pesquisas/${id}`);
  return { ok: true };
}

const opcaoSchema = z.object({
  texto: z.string().trim().min(1, "Informe o texto da opção"),
});

const perguntaSchema = z.object({
  enunciado: z.string().trim().min(3, "Informe o enunciado da pergunta"),
  tipo: z.enum(TIPOS_PERGUNTA),
  dimensaoGPTW: z.enum(DIMENSOES_GPTW).optional().nullable(),
  obrigatoria: z.boolean().default(true),
  opcoes: z.array(opcaoSchema).default([]),
});

const perguntasArraySchema = z.array(perguntaSchema).min(1, "Adicione pelo menos uma pergunta");

// Substitui o conjunto inteiro de perguntas+opções de uma pesquisa DRAFT —
// mais simples que reconciliar diffs linha a linha (mesmo espírito do
// tratamento do config JSON de RegraBonificacao).
export async function salvarPerguntas(
  empresaId: string,
  pesquisaId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const pesquisa = await prisma.pesquisa.findFirst({ where: { id: pesquisaId, empresaId } });
  if (!pesquisa) return { ok: false, error: "Pesquisa não encontrada." };
  if (pesquisa.status !== "DRAFT") {
    return { ok: false, error: "Só é possível editar perguntas enquanto a pesquisa está em rascunho." };
  }

  let perguntasRaw: unknown;
  try {
    perguntasRaw = JSON.parse(String(formData.get("perguntasJson") ?? "[]"));
  } catch {
    return { ok: false, error: "Perguntas inválidas (JSON malformado)." };
  }
  const parsed = perguntasArraySchema.safeParse(perguntasRaw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  await prisma.$transaction(async (tx) => {
    await tx.pergunta.deleteMany({ where: { pesquisaId } });
    for (const [index, pergunta] of parsed.data.entries()) {
      await tx.pergunta.create({
        data: {
          pesquisaId,
          ordem: index,
          enunciado: pergunta.enunciado,
          tipo: pergunta.tipo,
          dimensaoGPTW: pergunta.dimensaoGPTW ?? null,
          obrigatoria: pergunta.obrigatoria,
          opcoes:
            pergunta.tipo === "MULTIPLE_CHOICE"
              ? { create: pergunta.opcoes.map((o, i) => ({ ordem: i, texto: o.texto })) }
              : undefined,
        },
      });
    }
  });

  revalidatePath(`/rh/${empresaId}/pesquisas/${pesquisaId}`);
  return { ok: true };
}

export async function gerarConvites(empresaId: string, pesquisaId: string): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const pesquisa = await prisma.pesquisa.findFirst({ where: { id: pesquisaId, empresaId } });
  if (!pesquisa) return { ok: false, error: "Pesquisa não encontrada." };

  const colaboradores = await prisma.colaborador.findMany({
    where: { empresaId, ativo: true },
    select: { id: true },
  });

  await prisma.surveyToken.createMany({
    data: colaboradores.map((c) => ({
      pesquisaId,
      colaboradorId: c.id,
      token: crypto.randomBytes(24).toString("base64url"),
    })),
    skipDuplicates: true,
  });

  revalidatePath(`/rh/${empresaId}/pesquisas/${pesquisaId}`);
  return { ok: true };
}

export async function enviarConviteToken(empresaId: string, tokenId: string): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const token = await prisma.surveyToken.findFirst({
    where: { id: tokenId, pesquisa: { empresaId } },
    include: { colaborador: true, pesquisa: true },
  });
  if (!token) return { ok: false, error: "Convite não encontrado." };

  if (!token.colaborador.telegramChatId) {
    await prisma.surveyToken.update({
      where: { id: tokenId },
      data: { status: "FAILED", erro: "Colaborador sem chat_id do Telegram cadastrado." },
    });
    return { ok: false, error: "Colaborador sem chat_id do Telegram cadastrado." };
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const link = `${baseUrl}/responder/${token.token}`;
  const texto = `Olá, ${token.colaborador.nome}! Você foi convidado a responder a pesquisa "${token.pesquisa.titulo}". Acesse: ${link}`;

  const resultado = await sendTelegramMessage(token.colaborador.telegramChatId, texto);
  await prisma.surveyToken.update({
    where: { id: tokenId },
    data: resultado.ok
      ? { status: "SENT", enviadoEm: new Date(), erro: null }
      : { status: "FAILED", erro: resultado.error },
  });

  revalidatePath(`/rh/${empresaId}/pesquisas/${token.pesquisaId}`);
  return resultado.ok ? { ok: true } : { ok: false, error: resultado.error };
}

export async function enviarConvites(empresaId: string, pesquisaId: string): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const tokens = await prisma.surveyToken.findMany({
    where: { pesquisaId, pesquisa: { empresaId }, status: { in: ["PENDING", "FAILED"] } },
    select: { id: true },
  });

  let falhas = 0;
  for (const t of tokens) {
    const resultado = await enviarConviteToken(empresaId, t.id);
    if (!resultado.ok) falhas++;
  }

  revalidatePath(`/rh/${empresaId}/pesquisas/${pesquisaId}`);
  if (falhas > 0) {
    return { ok: false, error: `${falhas} de ${tokens.length} convite(s) não puderam ser enviados.` };
  }
  return { ok: true };
}
