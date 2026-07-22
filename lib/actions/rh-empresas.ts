"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import type { ActionResult } from "@/lib/constants";

const empresaSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da empresa"),
});

export async function createEmpresa(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = empresaSchema.safeParse({ nome: formData.get("nome") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await prisma.empresa.create({ data: parsed.data });
  } catch {
    return { ok: false, error: "Já existe uma empresa com esse nome." };
  }
  revalidatePath("/rh/empresas");
  return { ok: true };
}

export async function updateEmpresa(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = empresaSchema.safeParse({ nome: formData.get("nome") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await prisma.empresa.update({ where: { id }, data: parsed.data });
  } catch {
    return { ok: false, error: "Já existe uma empresa com esse nome." };
  }
  revalidatePath("/rh/empresas");
  return { ok: true };
}

export async function toggleEmpresaAtiva(id: string, ativo: boolean): Promise<ActionResult> {
  await requireAdmin();
  await prisma.empresa.update({ where: { id }, data: { ativo } });
  revalidatePath("/rh/empresas");
  return { ok: true };
}

export async function deleteEmpresa(id: string): Promise<ActionResult> {
  await requireAdmin();
  const [setores, colaboradores, pesquisas] = await Promise.all([
    prisma.setor.count({ where: { empresaId: id } }),
    prisma.colaborador.count({ where: { empresaId: id } }),
    prisma.pesquisa.count({ where: { empresaId: id } }),
  ]);
  if (setores > 0 || colaboradores > 0 || pesquisas > 0) {
    return {
      ok: false,
      error: "Não é possível excluir: há setores, colaboradores ou pesquisas vinculados a essa empresa.",
    };
  }
  await prisma.empresa.delete({ where: { id } });
  revalidatePath("/rh/empresas");
  return { ok: true };
}
