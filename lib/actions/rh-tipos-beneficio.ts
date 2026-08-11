"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import type { ActionResult } from "@/lib/constants";

// Catálogo ADITIVO de benefícios — ver comentário do model TipoBeneficio no
// schema.prisma. Mesmo padrão de lib/actions/rh-setores.ts.

const tipoBeneficioSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do tipo de benefício"),
});

export async function createTipoBeneficio(
  empresaId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  const parsed = tipoBeneficioSchema.safeParse({ nome: formData.get("nome") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await prisma.tipoBeneficio.create({ data: { empresaId, nome: parsed.data.nome } });
  } catch {
    return { ok: false, error: "Já existe um tipo de benefício com esse nome nessa empresa." };
  }
  revalidatePath(`/rh/${empresaId}/tipos-beneficio`);
  revalidatePath(`/rh/${empresaId}/beneficios`);
  return { ok: true };
}

export async function updateTipoBeneficio(
  empresaId: string,
  id: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  const parsed = tipoBeneficioSchema.safeParse({ nome: formData.get("nome") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await prisma.tipoBeneficio.update({ where: { id, empresaId }, data: { nome: parsed.data.nome } });
  } catch {
    return { ok: false, error: "Já existe um tipo de benefício com esse nome nessa empresa." };
  }
  revalidatePath(`/rh/${empresaId}/tipos-beneficio`);
  revalidatePath(`/rh/${empresaId}/beneficios`);
  return { ok: true };
}

export async function toggleTipoBeneficioAtivo(
  empresaId: string,
  id: string,
  ativo: boolean,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  await prisma.tipoBeneficio.update({ where: { id, empresaId }, data: { ativo } });
  revalidatePath(`/rh/${empresaId}/tipos-beneficio`);
  revalidatePath(`/rh/${empresaId}/beneficios`);
  return { ok: true };
}

export async function deleteTipoBeneficio(empresaId: string, id: string): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const tipo = await prisma.tipoBeneficio.findFirst({ where: { id, empresaId }, select: { nome: true } });
  if (!tipo) return { ok: false, error: "Tipo de benefício não encontrado." };

  // "Em uso" aqui é por NOME, não por FK: BeneficioColaborador.tipo é string
  // livre (aceita tanto valor do catálogo fixo quanto nome cadastrado aqui).
  const emUso = await prisma.beneficioColaborador.count({ where: { empresaId, tipo: tipo.nome } });
  if (emUso > 0) {
    return {
      ok: false,
      error: `Não é possível excluir: ${emUso} concessão(ões) de benefício usam "${tipo.nome}". Desative em vez de excluir.`,
    };
  }

  await prisma.tipoBeneficio.delete({ where: { id, empresaId } });
  revalidatePath(`/rh/${empresaId}/tipos-beneficio`);
  revalidatePath(`/rh/${empresaId}/beneficios`);
  return { ok: true };
}
