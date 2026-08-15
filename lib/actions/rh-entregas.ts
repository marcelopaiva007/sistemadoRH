"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { empresasVisiveis } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { dataDoFormulario } from "@/lib/datas";
import type { ActionResult } from "@/lib/constants";

// Entregas ao colaborador — cartão de benefícios, notebook, uniforme, crachá.
// Ver o model EntregaAoColaborador no schema.prisma para o porquê de não ser
// o EntregaEPI nem o checklist de admissão.
//
// A CONFIRMAÇÃO NÃO ESTÁ AQUI. Quem confirma é o colaborador, pelo portal
// (lib/actions/portal-entregas.ts) — o RH registra que entregou, e a prova de
// recebimento vem de quem recebeu. Um botão de "marcar como confirmado" nesta
// tela transformaria a prova em declaração do próprio RH, que é exatamente o
// que a confirmação existe para evitar.

const TETO_POR_LOTE = 500;

/**
 * Registra a mesma entrega para várias pessoas de uma vez.
 *
 * EM LOTE porque o caso real é esse: 171 cartões de benefício entregues no
 * mesmo dia. Uma tela que só aceita um por vez transforma a entrega em 171
 * formulários, e ninguém faz — a informação simplesmente não é registrada.
 */
export async function registrarEntregas(input: {
  empresaId: string;
  colaboradorIds: string[];
  tipo: string;
  descricao?: string | null;
  dataEntrega?: string | null;
  observacoes?: string | null;
}): Promise<ActionResult & { criadas?: number }> {
  const usuario = await requireEmpresaAccess(input.empresaId);

  const tipo = (input.tipo ?? "").trim();
  if (!tipo) return { ok: false, error: "Escolha o tipo de entrega." };

  const ids = [...new Set((input.colaboradorIds ?? []).filter(Boolean))];
  if (ids.length === 0) return { ok: false, error: "Selecione ao menos um colaborador." };
  if (ids.length > TETO_POR_LOTE) {
    return { ok: false, error: `Máximo de ${TETO_POR_LOTE} pessoas por vez.` };
  }

  // Os ids vêm do cliente, e action "use server" é endpoint público: sem este
  // filtro, um POST à mão registraria entrega para colaborador de outra
  // empresa. O escopo é recalculado no servidor, nunca aceito de fora.
  const visiveis = await empresasVisiveis(usuario);
  const alvos = await prisma.colaborador.findMany({
    where: { id: { in: ids }, empresaId: { in: visiveis } },
    select: { id: true, empresaId: true },
  });
  if (alvos.length === 0) {
    return { ok: false, error: "Nenhum dos colaboradores selecionados está no seu acesso." };
  }

  const dataEntrega = dataDoFormulario(input.dataEntrega ?? null) ?? new Date();
  const descricao = (input.descricao ?? "").trim().slice(0, 200) || null;
  const observacoes = (input.observacoes ?? "").trim().slice(0, 500) || null;

  // `empresaId` sai da ficha de cada pessoa, não do parâmetro: a lista pode
  // misturar CNPJs da mesma marca, e gravar todos com a empresa da rota
  // colocaria a entrega no CNPJ errado.
  await prisma.entregaAoColaborador.createMany({
    data: alvos.map((c) => ({
      empresaId: c.empresaId,
      colaboradorId: c.id,
      tipo,
      descricao,
      quantidade: 1,
      dataEntrega,
      observacoes,
      entreguePorId: usuario?.id ?? null,
      entreguePorNome: usuario?.name ?? null,
    })),
  });

  await registrarAuditoria({
    empresaId: input.empresaId,
    acao: "CRIAR",
    entidade: "EntregaAoColaborador",
    entidadeId: input.empresaId,
    resumo: `Registrou entrega de ${tipo}${descricao ? ` (${descricao})` : ""} para ${alvos.length} colaborador(es).`,
    detalhes: { tipo, descricao, quantidade: alvos.length },
  });

  revalidatePath(`/rh/${input.empresaId}/entregas`);
  return { ok: true, criadas: alvos.length };
}

/**
 * Marca a devolução de um item — notebook, crachá.
 *
 * Cartão e uniforme não voltam, e a tela não obriga ninguém a devolver nada:
 * o botão existe para quando de fato volta, e é o que faz "o que esta pessoa
 * tem hoje" continuar verdadeiro depois do desligamento.
 */
export async function registrarDevolucao(
  empresaId: string,
  entregaId: string,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);

  const entrega = await prisma.entregaAoColaborador.findFirst({
    where: { id: entregaId, empresaId },
    select: { id: true, tipo: true, devolvidoEm: true, colaborador: { select: { nome: true } } },
  });
  if (!entrega) return { ok: false, error: "Entrega não encontrada." };
  if (entrega.devolvidoEm) return { ok: false, error: "Esta entrega já está marcada como devolvida." };

  await prisma.entregaAoColaborador.update({
    where: { id: entregaId },
    data: { devolvidoEm: new Date() },
  });

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "EntregaAoColaborador",
    entidadeId: entregaId,
    resumo: `Devolução de ${entrega.tipo} registrada para ${entrega.colaborador.nome} por ${usuario?.name ?? "RH"}.`,
  });

  revalidatePath(`/rh/${empresaId}/entregas`);
  return { ok: true };
}

/** Apaga uma entrega registrada por engano. Confirmada não se apaga. */
export async function excluirEntrega(empresaId: string, entregaId: string): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const entrega = await prisma.entregaAoColaborador.findFirst({
    where: { id: entregaId, empresaId },
    select: { id: true, tipo: true, confirmadoEm: true, colaborador: { select: { nome: true } } },
  });
  if (!entrega) return { ok: false, error: "Entrega não encontrada." };
  // Confirmação é declaração do colaborador. Apagá-la seria apagar a prova de
  // que ele recebeu — se a entrega foi errada, o caminho é registrar a
  // devolução, que deixa rastro dos dois lados.
  if (entrega.confirmadoEm) {
    return {
      ok: false,
      error: "Esta entrega já foi confirmada pelo colaborador e não pode ser apagada. Registre a devolução.",
    };
  }

  await prisma.entregaAoColaborador.delete({ where: { id: entregaId } });

  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "EntregaAoColaborador",
    entidadeId: entregaId,
    resumo: `Entrega de ${entrega.tipo} para ${entrega.colaborador.nome} apagada (ainda não confirmada).`,
  });

  revalidatePath(`/rh/${empresaId}/entregas`);
  return { ok: true };
}
