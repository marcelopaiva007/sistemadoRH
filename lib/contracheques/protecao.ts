// Envio de contracheques — a prova de recebimento não se apaga por tabela.
//
// O recibo sai em cascata com o documento e com a ficha. Se a pessoa já
// confirmou (com foto) ou possui histórico de assinatura invalidada preservado,
// apagar qualquer um dos dois levaria a prova de auditoria junto — então quem
// apaga pergunta aqui ANTES, dentro da própria transação, com os registros
// travados (FOR UPDATE): uma confirmação que chegue no meio espera, e depois
// não acha mais o recibo (e diz à pessoa que não registrou).
import type { Prisma } from "@/app/generated/prisma/client";

export const MSG_PROVA_DE_RECEBIMENTO =
  "Há contracheque com confirmação ou histórico de assinatura invalidada preservado — a prova de recebimento não pode ser apagada.";

/**
 * Recibos confirmados ou invalidados do documento (ou da ficha), com todos os
 * registros travados (FOR UPDATE).
 */
export async function recibosConfirmadosTravando(
  tx: Prisma.TransactionClient,
  alvo: { documentoId: string } | { colaboradorId: string },
): Promise<number> {
  const isDoc = "documentoId" in alvo;

  const [recibos, invalidados] = await Promise.all([
    isDoc
      ? tx.$queryRaw<{ confirmadoEm: Date | null }[]>`SELECT "confirmadoEm" FROM rh."ReciboContracheque" WHERE "documentoId" = ${alvo.documentoId} FOR UPDATE`
      : tx.$queryRaw<{ confirmadoEm: Date | null }[]>`SELECT "confirmadoEm" FROM rh."ReciboContracheque" WHERE "colaboradorId" = ${alvo.colaboradorId} FOR UPDATE`,
    isDoc
      ? tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM rh."ReciboContrachequeInvalidado" WHERE "documentoId" = ${alvo.documentoId} FOR UPDATE`
      : tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM rh."ReciboContrachequeInvalidado" WHERE "colaboradorId" = ${alvo.colaboradorId} FOR UPDATE`,
  ]);

  const confirmadosAtivos = recibos.filter((l) => l.confirmadoEm !== null).length;
  return confirmadosAtivos + invalidados.length;
}
