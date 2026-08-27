"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess, requireRHAccess, usuarioAlcancaEmpresa } from "@/lib/rh-auth-guard";
import { violouUnique, registroNaoEncontrado } from "@/lib/prisma-erros";
import type { ActionResult } from "@/lib/constants";

// Catálogo ADITIVO de benefícios — ver comentário do model TipoBeneficio no
// schema.prisma. Mesmo padrão de lib/actions/rh-setores.ts.

const tipoBeneficioSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do tipo de benefício"),
});

/**
 * Resolve o alvo pela empresa DO TIPO, não a da URL — mesmo conserto (e mesmo
 * motivo) do de Setores na v1.124.2: a tela lista o grupo inteiro, e validar
 * pela empresa da rota fazia o Prisma não achar tipo de outro CNPJ (P2025),
 * com o catch mentindo "nome duplicado". Fora do alcance = inexistente.
 */
async function resolverTipoAlcancavel(
  id: string,
): Promise<{ ok: true; tipoEmpresaId: string } | { ok: false; error: string }> {
  const usuario = await requireRHAccess();
  const tipo = await prisma.tipoBeneficio.findUnique({ where: { id }, select: { empresaId: true } });
  if (!tipo || !(await usuarioAlcancaEmpresa(usuario, tipo.empresaId))) {
    return { ok: false, error: "Tipo de benefício não encontrado." };
  }
  return { ok: true, tipoEmpresaId: tipo.empresaId };
}

function revalidarTipos(empresaIdDaUrl: string, tipoEmpresaId: string) {
  for (const id of new Set([empresaIdDaUrl, tipoEmpresaId])) {
    revalidatePath(`/rh/${id}/tipos-beneficio`);
    revalidatePath(`/rh/${id}/beneficios`);
  }
}

export async function createTipoBeneficio(
  empresaId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const targetEmpresaId = (formData.get("empresaId") as string) || empresaId;
  await requireEmpresaAccess(targetEmpresaId);
  const parsed = tipoBeneficioSchema.safeParse({ nome: formData.get("nome") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await prisma.tipoBeneficio.create({ data: { empresaId: targetEmpresaId, nome: parsed.data.nome } });
  } catch (e) {
    if (violouUnique(e)) return { ok: false, error: "Já existe um tipo de benefício com esse nome nessa empresa." };
    throw e;
  }
  revalidarTipos(empresaId, targetEmpresaId);
  return { ok: true };
}

export async function updateTipoBeneficio(
  empresaId: string,
  id: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const alvo = await resolverTipoAlcancavel(id);
  if (!alvo.ok) return alvo;
  const parsed = tipoBeneficioSchema.safeParse({ nome: formData.get("nome") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await prisma.tipoBeneficio.update({
      where: { id, empresaId: alvo.tipoEmpresaId },
      data: { nome: parsed.data.nome },
    });
  } catch (e) {
    if (violouUnique(e)) return { ok: false, error: "Já existe um tipo de benefício com esse nome nessa empresa." };
    if (registroNaoEncontrado(e)) return { ok: false, error: "Tipo de benefício não encontrado." };
    throw e;
  }
  revalidarTipos(empresaId, alvo.tipoEmpresaId);
  return { ok: true };
}

export async function toggleTipoBeneficioAtivo(
  empresaId: string,
  id: string,
  ativo: boolean,
): Promise<ActionResult> {
  const alvo = await resolverTipoAlcancavel(id);
  if (!alvo.ok) return alvo;
  try {
    await prisma.tipoBeneficio.update({ where: { id, empresaId: alvo.tipoEmpresaId }, data: { ativo } });
  } catch (e) {
    if (registroNaoEncontrado(e)) return { ok: false, error: "Tipo de benefício não encontrado." };
    throw e;
  }
  revalidarTipos(empresaId, alvo.tipoEmpresaId);
  return { ok: true };
}

export async function deleteTipoBeneficio(empresaId: string, id: string): Promise<ActionResult> {
  const alvo = await resolverTipoAlcancavel(id);
  if (!alvo.ok) return alvo;

  const tipo = await prisma.tipoBeneficio.findFirst({
    where: { id, empresaId: alvo.tipoEmpresaId },
    select: { nome: true },
  });
  if (!tipo) return { ok: false, error: "Tipo de benefício não encontrado." };

  // "Em uso" aqui é por NOME, não por FK: BeneficioColaborador.tipo é string
  // livre (aceita tanto valor do catálogo fixo quanto nome cadastrado aqui).
  // A contagem olha a empresa DO TIPO — a da URL respondia 0 para tipo de
  // outro CNPJ e deixava a exclusão passar do aviso.
  const emUso = await prisma.beneficioColaborador.count({
    where: { empresaId: alvo.tipoEmpresaId, tipo: tipo.nome },
  });
  if (emUso > 0) {
    return {
      ok: false,
      error: `Não é possível excluir: ${emUso} concessão(ões) de benefício usam "${tipo.nome}". Desative em vez de excluir.`,
    };
  }

  try {
    await prisma.tipoBeneficio.delete({ where: { id, empresaId: alvo.tipoEmpresaId } });
  } catch (e) {
    if (registroNaoEncontrado(e)) return { ok: false, error: "Tipo de benefício não encontrado." };
    throw e;
  }
  revalidarTipos(empresaId, alvo.tipoEmpresaId);
  return { ok: true };
}

/**
 * Remove em lote os tipos cadastrados no CNPJ da URL que NENHUMA concessão usa
 * — mesmo padrão de `removerSetoresSemColaboradores`/`removerPosicoesSemColaboradores`.
 * "Em uso" aqui é por NOME (ver deleteTipoBeneficio): um tipo só é candidato se
 * não houver `BeneficioColaborador.tipo` igual ao nome dele, na mesma empresa.
 */
export async function removerTiposBeneficioSemUso(
  empresaId: string,
): Promise<{ ok: boolean; removidos: number; error?: string }> {
  await requireEmpresaAccess(empresaId);

  try {
    const tipos = await prisma.tipoBeneficio.findMany({
      where: { empresaId },
      select: { id: true, nome: true },
    });
    const semUso: string[] = [];
    for (const t of tipos) {
      const emUso = await prisma.beneficioColaborador.count({ where: { empresaId, tipo: t.nome } });
      if (emUso === 0) semUso.push(t.id);
    }
    if (semUso.length === 0) return { ok: true, removidos: 0 };

    await prisma.tipoBeneficio.deleteMany({ where: { id: { in: semUso } } });
    revalidarTipos(empresaId, empresaId);
    return { ok: true, removidos: semUso.length };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Erro ao remover tipos sem uso.";
    return { ok: false, removidos: 0, error: errorMsg };
  }
}
