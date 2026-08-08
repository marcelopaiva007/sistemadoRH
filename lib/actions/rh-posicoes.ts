"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import type { ActionResult } from "@/lib/constants";

const posicaoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da posição"),
});

export async function createPosicao(
  empresaIdDefault: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const targetEmpresaId = (formData.get("empresaId") as string) || empresaIdDefault;
  await requireEmpresaAccess(targetEmpresaId);
  const parsed = posicaoSchema.safeParse({ nome: formData.get("nome") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await prisma.posicao.create({ data: { empresaId: targetEmpresaId, nome: parsed.data.nome } });
  } catch {
    return { ok: false, error: "Já existe uma posição com esse nome nessa empresa." };
  }
  revalidatePath(`/rh/${empresaIdDefault}/posicoes`);
  return { ok: true };
}

export async function updatePosicao(
  empresaId: string,
  id: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  const parsed = posicaoSchema.safeParse({ nome: formData.get("nome") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await prisma.posicao.update({ where: { id, empresaId }, data: { nome: parsed.data.nome } });
  } catch {
    return { ok: false, error: "Já existe uma posição com esse nome nessa empresa." };
  }
  revalidatePath(`/rh/${empresaId}/posicoes`);
  return { ok: true };
}

export async function togglePosicaoAtiva(empresaId: string, id: string, ativo: boolean): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  await prisma.posicao.update({ where: { id, empresaId }, data: { ativo } });
  revalidatePath(`/rh/${empresaId}/posicoes`);
  return { ok: true };
}

export async function deletePosicao(empresaId: string, id: string): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  const emUso = await prisma.colaborador.count({ where: { posicaoId: id, empresaId } });
  if (emUso > 0) {
    return { ok: false, error: `Não é possível excluir: ${emUso} colaborador(es) vinculado(s) a essa posição.` };
  }
  await prisma.posicao.delete({ where: { id, empresaId } });
  revalidatePath(`/rh/${empresaId}/posicoes`);
  return { ok: true };
}
