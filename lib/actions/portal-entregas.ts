"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { lerSessaoPortal } from "@/lib/portal-auth";
import { registrarAuditoria } from "@/lib/audit";
import type { ActionResult } from "@/lib/constants";

/**
 * O colaborador confirma que recebeu — cartão, notebook, uniforme.
 *
 * POR QUE A CONFIRMAÇÃO É DAQUI, e não de um botão na tela do RH: o cartão de
 * benefícios recebe comissão e premiação. A confirmação deixa de ser
 * burocracia e vira controle financeiro — prova de que a pessoa recebeu o
 * cartão onde o dinheiro dela cai. RH marcando "entreguei" sozinho prova o
 * que o RH diz; isto prova o que a pessoa reconhece ter recebido.
 *
 * Nada de `colaboradorId` por parâmetro: sai da sessão, sempre. Como todo
 * arquivo "use server", esta função é endpoint público — aceitar o id de fora
 * deixaria qualquer pessoa logada confirmar a entrega de outra, que é
 * exatamente a assinatura falsa que o recurso existe para impedir.
 */
export async function confirmarRecebimento(entregaId: string): Promise<ActionResult> {
  const sessao = await lerSessaoPortal();
  if (!sessao) return { ok: false, error: "Sua sessão expirou. Peça /portal ao bot novamente." };

  const entrega = await prisma.entregaAoColaborador.findFirst({
    // O filtro por colaboradorId da SESSÃO é o que garante que ninguém
    // confirme o que não é seu — e não uma checagem depois de buscar.
    where: { id: entregaId, colaboradorId: sessao.colaboradorId },
    select: {
      id: true, tipo: true, descricao: true, empresaId: true, confirmadoEm: true, devolvidoEm: true,
      colaborador: { select: { nome: true } },
    },
  });
  if (!entrega) return { ok: false, error: "Entrega não encontrada." };
  if (entrega.confirmadoEm) return { ok: true }; // já confirmou: repetir não é erro
  if (entrega.devolvidoEm) {
    return { ok: false, error: "Este item já consta como devolvido. Procure o RH." };
  }

  // O IP é evidência de onde veio a confirmação, mesma ideia do ponto. Não
  // identifica sozinho, mas é o que sobra para reconstruir um caso duvidoso.
  const cabecalhos = await headers();
  const ip =
    cabecalhos.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    cabecalhos.get("x-real-ip") ||
    null;

  await prisma.entregaAoColaborador.update({
    where: { id: entrega.id },
    data: { confirmadoEm: new Date(), confirmadoIp: ip },
  });

  await registrarAuditoria({
    empresaId: entrega.empresaId,
    acao: "ATUALIZAR",
    entidade: "EntregaAoColaborador",
    entidadeId: entrega.id,
    resumo: `${entrega.colaborador.nome} confirmou o recebimento de ${entrega.tipo}${entrega.descricao ? ` (${entrega.descricao})` : ""} pelo portal.`,
  });

  revalidatePath("/portal");
  return { ok: true };
}
