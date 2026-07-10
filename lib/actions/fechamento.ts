"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { recalcularFechamento } from "@/lib/bonificacao";
import type { ActionResult } from "@/lib/constants";

export async function fecharMes(periodo: string): Promise<ActionResult> {
  const user = await requireAdmin();

  await recalcularFechamento(periodo);

  await prisma.fechamentoMensal.update({
    where: { periodo },
    data: { status: "FECHADO", fechadoPorId: user.id, fechadoEm: new Date() },
  });

  revalidatePath("/fechamento");
  revalidatePath(`/fechamento/${periodo}`);
  return { ok: true };
}

export async function reabrirMes(periodo: string): Promise<ActionResult> {
  await requireAdmin();

  await prisma.fechamentoMensal.update({
    where: { periodo },
    data: { status: "ABERTO", fechadoPorId: null, fechadoEm: null },
  });

  await recalcularFechamento(periodo);

  revalidatePath("/fechamento");
  revalidatePath(`/fechamento/${periodo}`);
  return { ok: true };
}

export async function recalcular(periodo: string): Promise<ActionResult> {
  await requireAdmin();
  await recalcularFechamento(periodo);
  revalidatePath(`/fechamento/${periodo}`);
  return { ok: true };
}
