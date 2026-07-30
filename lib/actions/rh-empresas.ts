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
    const newEmpresa = await prisma.empresa.create({ data: parsed.data });

    // Replicate setors and positions from the default company (RSM TELECOM LTDA)
    const defaultCompanyId = "cms6u3mln0003si10dsp1fey5";
    const [setoresDefault, posicoesFefault] = await Promise.all([
      prisma.setor.findMany({ where: { empresaId: defaultCompanyId } }),
      prisma.posicao.findMany({ where: { empresaId: defaultCompanyId } }),
    ]);

    if (setoresDefault.length > 0 || posicoesFefault.length > 0) {
      await Promise.all([
        ...(setoresDefault.length > 0
          ? [
              prisma.setor.createMany({
                data: setoresDefault.map((s) => ({
                  empresaId: newEmpresa.id,
                  nome: s.nome,
                  ativo: s.ativo,
                })),
              }),
            ]
          : []),
        ...(posicoesFefault.length > 0
          ? [
              prisma.posicao.createMany({
                data: posicoesFefault.map((p) => ({
                  empresaId: newEmpresa.id,
                  nome: p.nome,
                  ativo: p.ativo,
                })),
              }),
            ]
          : []),
      ]);
    }
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
