"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import type { ActionResult } from "@/lib/constants";

const produtoSchema = z.object({
  internet: z.coerce.number().default(0),
  chip: z.coerce.number().default(0),
  gps: z.coerce.number().default(0),
  streaming: z.coerce.number().default(0),
  telefoniaFixa: z.coerce.number().default(0),
});

const supervisorTierSchema = z.object({
  meta: z.coerce.number().default(0),
  valor: z.coerce.number().default(0),
});

const regraSchema = z.object({
  cargo: z.enum(["VENDEDOR_EXTERNO", "ATENDIMENTO_ADM", "SUPERVISOR", "OUTRO_SETOR"]),
  vigenciaInicio: z.string().min(1, "Informe a data de início da vigência"),
  metaQtd: z.coerce.number().optional(),
  valorMeta: z.coerce.number().optional(),
  superMetaQtd: z.coerce.number().optional(),
  valorSuperMeta: z.coerce.number().optional(),
  percentualTaxaAtivacao: z.coerce.number().optional(),
  observacoes: z.string().trim().optional(),
});

export async function createRegraBonificacao(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const raw = {
    cargo: formData.get("cargo"),
    vigenciaInicio: formData.get("vigenciaInicio"),
    metaQtd: formData.get("metaQtd") || undefined,
    valorMeta: formData.get("valorMeta") || undefined,
    superMetaQtd: formData.get("superMetaQtd") || undefined,
    valorSuperMeta: formData.get("valorSuperMeta") || undefined,
    percentualTaxaAtivacao: formData.get("percentualTaxaAtivacao") || undefined,
    observacoes: formData.get("observacoes") || undefined,
  };
  const parsed = regraSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const valoresPorProduto = produtoSchema.parse({
    internet: formData.get("produto_internet") || 0,
    chip: formData.get("produto_chip") || 0,
    gps: formData.get("produto_gps") || 0,
    streaming: formData.get("produto_streaming") || 0,
    telefoniaFixa: formData.get("produto_telefoniaFixa") || 0,
  });

  const regraSupervisor = {
    tier3: supervisorTierSchema.parse({
      meta: formData.get("supervisor_tier3_meta") || 0,
      valor: formData.get("supervisor_tier3_valor") || 0,
    }),
    tier5: supervisorTierSchema.parse({
      meta: formData.get("supervisor_tier5_meta") || 0,
      valor: formData.get("supervisor_tier5_valor") || 0,
    }),
  };

  const [ano, mes, dia] = parsed.data.vigenciaInicio.split("-").map(Number);
  const vigenciaInicio = new Date(Date.UTC(ano, mes - 1, dia));
  if (Number.isNaN(vigenciaInicio.getTime())) {
    return { ok: false, error: "Data de início inválida." };
  }

  const diaAnterior = new Date(vigenciaInicio);
  diaAnterior.setUTCDate(diaAnterior.getUTCDate() - 1);

  await prisma.$transaction(async (tx) => {
    await tx.regraBonificacao.updateMany({
      where: { cargo: parsed.data.cargo, vigenciaFim: null },
      data: { vigenciaFim: diaAnterior },
    });

    await tx.regraBonificacao.create({
      data: {
        cargo: parsed.data.cargo,
        vigenciaInicio,
        vigenciaFim: null,
        metaQtd: parsed.data.metaQtd ?? null,
        valorMeta: parsed.data.valorMeta ?? null,
        superMetaQtd: parsed.data.superMetaQtd ?? null,
        valorSuperMeta: parsed.data.valorSuperMeta ?? null,
        percentualTaxaAtivacao: parsed.data.percentualTaxaAtivacao
          ? parsed.data.percentualTaxaAtivacao / 100
          : null,
        valoresPorProduto,
        regraSupervisor,
        observacoes: parsed.data.observacoes || null,
      },
    });
  });

  revalidatePath("/regras");
  return { ok: true };
}
