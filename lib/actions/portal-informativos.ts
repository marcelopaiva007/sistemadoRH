"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ERRO_CPF_NAO_CONFIRMADO, lerSessaoPortal } from "@/lib/portal-auth";
import type { ActionResult } from "@/lib/constants";

/**
 * "Li e estou ciente" pelo portal — para quem recebeu por e-mail, ou não
 * recebeu por canal nenhum e encontrou o informativo aqui.
 *
 * Nada de `colaboradorId` por parâmetro: sai da sessão, como em
 * portal-entregas.ts. O filtro pelo colaborador da SESSÃO é o que impede dar
 * ciência em nome de outra pessoa.
 */
export async function darCienciaInformativo(destinatarioId: string): Promise<ActionResult> {
  const sessao = await lerSessaoPortal();
  if (!sessao) return { ok: false, error: "Sua sessão expirou. Peça /portal ao bot novamente." };
  if (!sessao.verificado) return { ok: false, error: ERRO_CPF_NAO_CONFIRMADO };

  const d = await prisma.informativoDestinatario.findFirst({
    where: { id: destinatarioId, colaboradorId: sessao.colaboradorId },
    select: { id: true, cienteEm: true },
  });
  if (!d) return { ok: false, error: "Informativo não encontrado." };
  if (d.cienteEm) return { ok: true }; // já deu ciência: repetir não é erro

  await prisma.informativoDestinatario.update({
    where: { id: d.id },
    data: { cienteEm: new Date(), cientePor: "PORTAL" },
  });
  revalidatePath("/portal");
  return { ok: true };
}
