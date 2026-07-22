"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { recalcularFechamento } from "@/lib/bonificacao";
import type { ActionResult } from "@/lib/constants";

const linhaSchema = z.object({
  funcionarioId: z.string().min(1),
  quantidade: z.number().int().default(0),
  aprovado: z.number().int().default(0),
  cancelado: z.number().int().default(0),
  valorInstalado: z.number().default(0),
  valorDemaisServicos: z.number().default(0),
  qtdInternet: z.number().int().default(0),
  qtdChip: z.number().int().default(0),
  qtdGps: z.number().int().default(0),
  qtdTv: z.number().int().default(0),
  qtdStreaming: z.number().int().default(0),
  qtdTelefoniaFixa: z.number().int().default(0),
});

const importSchema = z.object({
  periodo: z.string().regex(/^\d{4}-\d{2}$/),
  arquivoNome: z.string().min(1),
  linhas: z.array(linhaSchema).min(1),
});

export async function confirmarImportacao(input: z.infer<typeof importSchema>): Promise<ActionResult> {
  const user = await requireAdmin();
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const fechamento = await prisma.fechamentoMensal.findUnique({
    where: { periodo: parsed.data.periodo },
  });
  if (fechamento?.status === "FECHADO") {
    return { ok: false, error: "Este mês já foi fechado e não pode mais ser alterado." };
  }

  await prisma.$transaction(async (tx) => {
    const lote = await tx.importLote.create({
      data: {
        arquivoNome: parsed.data.arquivoNome,
        usuarioId: user.id,
        linhasOk: parsed.data.linhas.length,
        linhasErro: 0,
      },
    });

    await tx.lancamentoVenda.createMany({
      data: parsed.data.linhas.map((linha) => ({
        ...linha,
        periodo: parsed.data.periodo,
        origem: "IMPORTADO",
        importLoteId: lote.id,
      })),
    });
  });

  await recalcularFechamento(parsed.data.periodo);
  revalidatePath("/lancamentos");
  revalidatePath("/fechamento");
  return { ok: true };
}
