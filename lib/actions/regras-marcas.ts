"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMaster } from "@/lib/grupo-guard";
import { registrarAuditoria } from "@/lib/audit";
import { aplicarRegraDaMarca } from "@/lib/regras-marcas";
import type { ActionResult } from "@/lib/constants";

// A regra de uma marca na área de admin: "só ela" ou "junto com" as marcas de
// outro grupo. Só o MASTER. A regra em si (quem vai junto, o que se desativa)
// mora em lib/regras-marcas.ts.

const pedido = z.object({
  marcaId: z.string().min(1),
  destino: z.discriminatedUnion("tipo", [
    z.object({ tipo: z.literal("SO_ELA") }),
    z.object({ tipo: z.literal("JUNTO"), grupoId: z.string().min(1) }),
  ]),
  contasQueVaoJunto: z.array(z.string().min(1)).max(1000),
});

export async function definirRegraDaMarca(
  entrada: unknown,
): Promise<ActionResult & { resumo?: string }> {
  await requireMaster();
  const parsed = pedido.safeParse(entrada);
  if (!parsed.success) return { ok: false, error: "Pedido inválido. Recarregue a página." };

  const resultado = await aplicarRegraDaMarca(parsed.data);
  if (!resultado.ok) return resultado;

  await registrarAuditoria({
    acao: "ATUALIZAR",
    entidade: "Marca",
    entidadeId: parsed.data.marcaId,
    resumo: `Regra da marca: ${resultado.resumo}`,
  });
  // Muda o que cada conta enxerga no sistema inteiro.
  revalidatePath("/", "layout");
  return { ok: true, resumo: resultado.resumo };
}
