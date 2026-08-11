"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { CATEGORIAS_CATALOGO, ehCategoriaCatalogo } from "@/lib/catalogos";
import type { ActionResult } from "@/lib/constants";

// Uma action genérica pros 9 catálogos aditivos — ver model CatalogoItem no
// schema.prisma. Mesmo padrão de lib/actions/rh-tipos-beneficio.ts, só que
// parametrizado por categoria em vez de um arquivo por catálogo.

const HEX_COR = /^#[0-9a-fA-F]{6}$/;

const itemSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome"),
  cor: z.string().trim().optional(),
  validadeMeses: z.string().trim().optional(),
});

function validarCategoria(categoria: string): { ok: true } | { ok: false; error: string } {
  if (!ehCategoriaCatalogo(categoria)) return { ok: false, error: "Catálogo desconhecido." };
  return { ok: true };
}

export async function createCatalogoItem(
  empresaId: string,
  categoria: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const cat = validarCategoria(categoria);
  if (!cat.ok) return cat;

  const parsed = itemSchema.safeParse({
    nome: formData.get("nome"),
    cor: formData.get("cor"),
    validadeMeses: formData.get("validadeMeses"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const meta = CATEGORIAS_CATALOGO[categoria as keyof typeof CATEGORIAS_CATALOGO];
  const cor = "temCor" in meta && meta.temCor && parsed.data.cor ? parsed.data.cor : null;
  if (cor && !HEX_COR.test(cor)) return { ok: false, error: "Cor inválida — use o seletor." };

  let validadeMeses: number | null = null;
  if ("temValidade" in meta && meta.temValidade && parsed.data.validadeMeses) {
    const n = Number.parseInt(parsed.data.validadeMeses, 10);
    if (!Number.isInteger(n) || n <= 0) return { ok: false, error: "Validade inválida — use meses inteiros." };
    validadeMeses = n;
  }

  try {
    await prisma.catalogoItem.create({
      data: { empresaId, categoria, nome: parsed.data.nome, cor, validadeMeses },
    });
  } catch {
    return { ok: false, error: `Já existe um item "${parsed.data.nome}" nesse catálogo.` };
  }
  revalidatePath(`/rh/${empresaId}/catalogos`);
  return { ok: true };
}

export async function toggleCatalogoItemAtivo(
  empresaId: string,
  id: string,
  ativo: boolean,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  await prisma.catalogoItem.update({ where: { id, empresaId }, data: { ativo } });
  revalidatePath(`/rh/${empresaId}/catalogos`);
  return { ok: true };
}

export async function deleteCatalogoItem(empresaId: string, id: string): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  // Sem checar "em uso": ao contrário de TipoBeneficio (uma FK implícita
  // clara em BeneficioColaborador.tipo), estes 9 catálogos são consumidos em
  // 9 tabelas diferentes — checar todas aqui duplicaria muita lógica de
  // negócio específica de cada módulo. Desativar (toggle) é o caminho
  // recomendado; excluir é para corrigir cadastro errado, igual aos outros
  // catálogos do sistema.
  await prisma.catalogoItem.delete({ where: { id, empresaId } });
  revalidatePath(`/rh/${empresaId}/catalogos`);
  return { ok: true };
}
