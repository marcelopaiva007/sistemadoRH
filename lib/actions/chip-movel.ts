"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guard";
import {
  previewChipMovel,
  syncChipMovel,
  type LinhaChipMovel,
  type ResultadoSyncChip,
} from "@/lib/chip-movel";

export type { LinhaChipMovel };

// Dados da tela de conferência (/importar/chip) — snapshot já sincronizado.
// Retorna o erro real como dado (não lança): em produção o Next redige a
// mensagem de exceções de server action, mascarando a causa — devolvendo
// { ok:false, error } a tela consegue mostrar o motivo verdadeiro.
export async function previsualizarChipMovel(periodo: string): Promise<
  | {
      ok: true;
      linhas: LinhaChipMovel[];
      totalVendas: number;
      ultimaSync: Date | null;
    }
  | { ok: false; error: string }
> {
  await requireAdmin();
  try {
    const r = await previewChipMovel(periodo);
    return { ok: true, ...r };
  } catch (e) {
    console.error("[chip] previsualizarChipMovel falhou:", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Botão "Sincronizar agora": mesma rotina do cron diário, sob demanda.
export async function sincronizarChipMovelAgora(
  periodo: string,
): Promise<{ ok: true; resultado: ResultadoSyncChip } | { ok: false; error: string }> {
  await requireAdmin();
  const [ano, mes] = periodo.split("-").map(Number);
  if (!ano || !mes || mes < 1 || mes > 12) {
    return { ok: false, error: "Período inválido." };
  }
  try {
    const resultado = await syncChipMovel(ano, mes);
    revalidatePath("/lancamentos");
    revalidatePath("/fechamento");
    revalidatePath("/importar/chip");
    return { ok: true, resultado };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
