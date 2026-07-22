"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import type { ActionResult } from "@/lib/constants";

const setorSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do setor"),
});

export async function createSetor(empresaId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  const parsed = setorSchema.safeParse({ nome: formData.get("nome") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await prisma.setor.create({ data: { empresaId, nome: parsed.data.nome } });
  } catch {
    return { ok: false, error: "Já existe um setor com esse nome nessa empresa." };
  }
  revalidatePath(`/rh/${empresaId}/setores`);
  return { ok: true };
}

export async function updateSetor(
  empresaId: string,
  id: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  const parsed = setorSchema.safeParse({ nome: formData.get("nome") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await prisma.setor.update({ where: { id, empresaId }, data: { nome: parsed.data.nome } });
  } catch {
    return { ok: false, error: "Já existe um setor com esse nome nessa empresa." };
  }
  revalidatePath(`/rh/${empresaId}/setores`);
  return { ok: true };
}

export async function toggleSetorAtivo(empresaId: string, id: string, ativo: boolean): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  await prisma.setor.update({ where: { id, empresaId }, data: { ativo } });
  revalidatePath(`/rh/${empresaId}/setores`);
  return { ok: true };
}

export async function deleteSetor(empresaId: string, id: string): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  const emUso = await prisma.colaborador.count({ where: { setorId: id, empresaId } });
  if (emUso > 0) {
    return { ok: false, error: `Não é possível excluir: ${emUso} colaborador(es) vinculado(s) a esse setor.` };
  }
  await prisma.setor.delete({ where: { id, empresaId } });
  revalidatePath(`/rh/${empresaId}/setores`);
  return { ok: true };
}
