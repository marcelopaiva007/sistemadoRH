// RD-001 — Regra de Vínculo Ativo nas Pesquisas de RH (02/08/2026).
//
// Pesquisa de medição (CLIMA/NR01) só vai para quem tem vínculo ativo.
// Afastamento aprovado e vigente — INSS, licença-maternidade, suspensão —
// tira a pessoa da medição enquanto durar, mesmo com o cadastro `ativo`:
// aprovar/criar uma Ausencia nunca mexe em Colaborador.ativo (são registros
// independentes), então sem este filtro alguém afastado pelo INSS continua
// entrando normalmente em qualquer pesquisa. Férias e contrato de experiência
// NÃO entram nessa exclusão — a matriz da decisão mantém as duas dentro da
// elegibilidade de Clima/NR-01.
//
// Este sistema não tem um campo de "data de aviso prévio" separado de
// `dataDesligamento` — só existe a data única de desligamento, e
// `Colaborador.ativo` já vira false só quando o RH registra o desligamento
// como efetivo. Não há, portanto, uma janela de "aviso" a filtrar aqui.
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";

type Cliente = typeof prisma | Prisma.TransactionClient;

const TIPOS_AFASTAMENTO_EXCLUEM_MEDICAO = ["AFASTAMENTO_INSS", "LICENCA_MATERNIDADE", "SUSPENSAO"] as const;

/** Ids, dentre os passados, com afastamento aprovado e vigente na data de referência. */
export async function idsComAfastamentoVigente(
  cliente: Cliente,
  colaboradorIds: string[],
  hoje: Date = new Date(),
): Promise<Set<string>> {
  if (colaboradorIds.length === 0) return new Set();
  const ausencias = await cliente.ausencia.findMany({
    where: {
      colaboradorId: { in: colaboradorIds },
      tipo: { in: [...TIPOS_AFASTAMENTO_EXCLUEM_MEDICAO] },
      status: "APROVADA",
      dataInicio: { lte: hoje },
      dataFim: { gte: hoje },
    },
    select: { colaboradorId: true },
  });
  return new Set(ausencias.map((a) => a.colaboradorId));
}

/**
 * População elegível para pesquisa de medição (CLIMA/NR01) de uma marca:
 * vínculo ativo e sem afastamento vigente.
 *
 * Central porque `gerarConvites` e `rodadaEnvioAutomatico` mantinham cada um
 * o próprio filtro `ativo: true` — bastava um afastamento (que não mexe em
 * `ativo`) para os dois ficarem desatualizados juntos, sem nenhum lugar único
 * para corrigir.
 */
export async function filtrarElegiveisPorVinculo(
  cliente: Cliente,
  marcaId: string,
  hoje: Date = new Date(),
): Promise<{ id: string }[]> {
  const candidatos = await cliente.colaborador.findMany({
    where: { empresa: { marcaId }, ativo: true },
    select: { id: true },
  });
  const afastados = await idsComAfastamentoVigente(
    cliente,
    candidatos.map((c) => c.id),
    hoje,
  );
  return candidatos.filter((c) => !afastados.has(c.id));
}

/**
 * Expira (EXCLUIDO) todo convite em aberto (PENDING/SENT/FAILED) de um
 * colaborador que acabou de ser desligado — RD-001: "convite pendente de quem
 * foi desligado na janela expira". Chamar sempre que `Colaborador.ativo`
 * transicionar de true para false.
 *
 * RESPONDED nunca é tocado: a resposta já é anônima e dissociada, apagar o
 * convite exigiria religar resposta a pessoa.
 */
export async function invalidarConvitesDeDesligados(cliente: Cliente, colaboradorId: string): Promise<number> {
  const { count } = await cliente.surveyToken.updateMany({
    where: { colaboradorId, status: { in: ["PENDING", "SENT", "FAILED"] } },
    data: { status: "EXCLUIDO", erro: "Convite expirado — colaborador desligado." },
  });
  return count;
}
