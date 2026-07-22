"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import type { ActionResult } from "@/lib/constants";

const colaboradorSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do colaborador"),
  cpf: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v === "" || v.length === 11, "CPF deve ter 11 dígitos")
    .optional(),
  email: z.string().trim().email("E-mail inválido").optional().or(z.literal("")),
  setorId: z.string().trim().min(1, "Selecione o setor"),
  posicaoId: z.string().trim().min(1, "Selecione a posição"),
  telegramChatId: z.string().trim().optional(),
  ativo: z.coerce.boolean().default(true),
});

async function validarSetorEPosicaoDaEmpresa(empresaId: string, setorId: string, posicaoId: string) {
  const [setor, posicao] = await Promise.all([
    prisma.setor.findFirst({ where: { id: setorId, empresaId } }),
    prisma.posicao.findFirst({ where: { id: posicaoId, empresaId } }),
  ]);
  if (!setor) return "Setor inválido para essa empresa.";
  if (!posicao) return "Posição inválida para essa empresa.";
  return null;
}

export async function createColaborador(
  empresaId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  const raw = {
    nome: formData.get("nome"),
    cpf: formData.get("cpf") || undefined,
    email: formData.get("email") || undefined,
    setorId: formData.get("setorId"),
    posicaoId: formData.get("posicaoId"),
    telegramChatId: formData.get("telegramChatId") || undefined,
    ativo: formData.get("ativo") === "on" || formData.get("ativo") === "true",
  };
  const parsed = colaboradorSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const erroEscopo = await validarSetorEPosicaoDaEmpresa(empresaId, parsed.data.setorId, parsed.data.posicaoId);
  if (erroEscopo) return { ok: false, error: erroEscopo };

  try {
    await prisma.colaborador.create({
      data: {
        empresaId,
        nome: parsed.data.nome,
        cpf: parsed.data.cpf || null,
        email: parsed.data.email || null,
        setorId: parsed.data.setorId,
        posicaoId: parsed.data.posicaoId,
        telegramChatId: parsed.data.telegramChatId || null,
        ativo: parsed.data.ativo,
      },
    });
  } catch {
    return { ok: false, error: "Já existe um colaborador com esse CPF ou chat_id do Telegram." };
  }
  revalidatePath(`/rh/${empresaId}/colaboradores`);
  return { ok: true };
}

export async function updateColaborador(
  empresaId: string,
  id: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  const raw = {
    nome: formData.get("nome"),
    cpf: formData.get("cpf") || undefined,
    email: formData.get("email") || undefined,
    setorId: formData.get("setorId"),
    posicaoId: formData.get("posicaoId"),
    telegramChatId: formData.get("telegramChatId") || undefined,
    ativo: formData.get("ativo") === "on" || formData.get("ativo") === "true",
  };
  const parsed = colaboradorSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const erroEscopo = await validarSetorEPosicaoDaEmpresa(empresaId, parsed.data.setorId, parsed.data.posicaoId);
  if (erroEscopo) return { ok: false, error: erroEscopo };

  try {
    await prisma.colaborador.update({
      where: { id, empresaId },
      data: {
        nome: parsed.data.nome,
        cpf: parsed.data.cpf || null,
        email: parsed.data.email || null,
        setorId: parsed.data.setorId,
        posicaoId: parsed.data.posicaoId,
        telegramChatId: parsed.data.telegramChatId || null,
        ativo: parsed.data.ativo,
      },
    });
  } catch {
    return { ok: false, error: "Já existe um colaborador com esse CPF ou chat_id do Telegram." };
  }
  revalidatePath(`/rh/${empresaId}/colaboradores`);
  return { ok: true };
}

export async function toggleColaboradorAtivo(empresaId: string, id: string, ativo: boolean): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  await prisma.colaborador.update({ where: { id, empresaId }, data: { ativo } });
  revalidatePath(`/rh/${empresaId}/colaboradores`);
  return { ok: true };
}

export async function deleteColaborador(empresaId: string, id: string): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  const [tokens, respostas] = await Promise.all([
    prisma.surveyToken.count({ where: { colaboradorId: id } }),
    prisma.resposta.count({ where: { colaboradorId: id } }),
  ]);
  if (tokens > 0 || respostas > 0) {
    return {
      ok: false,
      error: "Não é possível excluir: há convites ou respostas de pesquisa associados. Desative o colaborador em vez de excluir.",
    };
  }
  await prisma.colaborador.delete({ where: { id, empresaId } });
  revalidatePath(`/rh/${empresaId}/colaboradores`);
  return { ok: true };
}
