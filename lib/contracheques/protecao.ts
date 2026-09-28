// Envio de contracheques — a prova de recebimento não se apaga por tabela.
//
// O recibo sai em cascata com o documento e com a ficha. Se a pessoa já
// confirmou (com foto), apagar qualquer um dos dois levaria a prova junto —
// então quem apaga pergunta aqui ANTES, dentro da própria transação, com os
// recibos travados (FOR UPDATE): uma confirmação que chegue no meio espera, e
// depois não acha mais o recibo (e diz à pessoa que não registrou).
import type { Prisma } from "@/app/generated/prisma/client";

export const MSG_PROVA_DE_RECEBIMENTO =
  "Há contracheque já confirmado pelo colaborador (com foto) — a confirmação é a prova de recebimento e não pode ser apagada.";

/** Recibos confirmados do documento (ou da ficha), com todos os recibos dele travados. */
export async function recibosConfirmadosTravando(
  tx: Prisma.TransactionClient,
  alvo: { documentoId: string } | { colaboradorId: string },
): Promise<number> {
  const linhas =
    "documentoId" in alvo
      ? await tx.$queryRaw<{ confirmadoEm: Date | null }[]>`SELECT "confirmadoEm" FROM rh."ReciboContracheque" WHERE "documentoId" = ${alvo.documentoId} FOR UPDATE`
      : await tx.$queryRaw<{ confirmadoEm: Date | null }[]>`SELECT "confirmadoEm" FROM rh."ReciboContracheque" WHERE "colaboradorId" = ${alvo.colaboradorId} FOR UPDATE`;
  return linhas.filter((l) => l.confirmadoEm).length;
}
