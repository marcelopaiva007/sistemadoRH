// RD-001 — Regra de Vínculo Ativo nas Pesquisas de RH (02/08/2026).
//
// Afastamento aprovado e vigente — INSS, licença-maternidade, suspensão —
// tira a pessoa de QUALQUER pesquisa de medição enquanto durar, mesmo com o
// cadastro `ativo`: aprovar/criar uma Ausencia nunca mexe em
// Colaborador.ativo (são registros independentes), então sem este filtro
// alguém afastado pelo INSS continuaria entrando normalmente em qualquer
// pesquisa. Essa exclusão é universal — nenhum tipo do catálogo
// (lib/pesquisas-catalogo.ts) inclui esses três estados na própria
// elegibilidade, então ela fica fora do catálogo, aplicada sempre.
//
// O resto da elegibilidade é por tipo: cada pesquisa do catálogo declara
// quais estados de vínculo aceita (`elegibilidadeVinculo`) — CLIMA/NR01
// aceitam ativo+experiência+férias (RD-001, matriz "Clima/NR-1"); um tipo
// futuro como P08 (Stay Interview) aceita só "ativo" puro, sem férias nem
// experiência; P09/P10 (desligamento) invertem a regra e só aceitam quem
// JÁ SAIU. `estadoVinculo()` classifica cada colaborador num único estado
// (prioridade: desligado > férias > experiência > ativo) e o catálogo decide
// se aquele estado entra ou não.
//
// "aviso_previo" existe no vocabulário do seed mas não tem campo nenhum no
// schema — só existe `dataDesligamento` única, sem separar aviso da data
// efetiva. Nenhum colaborador cai nesse estado hoje; é limitação conhecida,
// documentada no próprio RD-001, não um bug deste módulo.
import type { Cliente } from "@/lib/prisma";
import { definicaoPesquisa, type ElegibilidadeVinculo } from "@/lib/pesquisas-catalogo";

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

/** Ids, dentre os passados, com férias aprovada e vigente na data de referência. */
export async function idsComFeriasVigente(
  cliente: Cliente,
  colaboradorIds: string[],
  hoje: Date = new Date(),
): Promise<Set<string>> {
  if (colaboradorIds.length === 0) return new Set();
  const ferias = await cliente.solicitacaoFerias.findMany({
    where: {
      colaboradorId: { in: colaboradorIds },
      status: "APROVADA",
      dataInicio: { lte: hoje },
      dataFim: { gte: hoje },
    },
    select: { colaboradorId: true },
  });
  return new Set(ferias.map((f) => f.colaboradorId));
}

/** Um único estado por colaborador — nunca mais de um, mesmo que vários se apliquem. */
function estadoVinculo(
  colaborador: { id: string; ativo: boolean; tipoContrato: string | null },
  idsDeFerias: Set<string>,
): ElegibilidadeVinculo {
  if (!colaborador.ativo) return "desligado";
  if (idsDeFerias.has(colaborador.id)) return "ferias";
  if (colaborador.tipoContrato === "EXPERIENCIA") return "experiencia";
  return "ativo";
}

/**
 * População elegível para um tipo de pesquisa (`modelo`, chave no catálogo —
 * ver lib/pesquisas-catalogo.ts) dentro de uma marca.
 *
 * Central porque `gerarConvites` e `rodadaEnvioAutomatico` mantinham cada um
 * o próprio filtro `ativo: true` — bastava um afastamento (que não mexe em
 * `ativo`) para os dois ficarem desatualizados juntos, sem nenhum lugar único
 * para corrigir. Generalizado por tipo (em vez de ativo/experiência/férias
 * fixo) para suportar tipos futuros do catálogo com elegibilidade diferente
 * (ex.: P08 só ativo puro, P09/P10 só quem já saiu) sem reescrever esta
 * função de novo a cada tipo novo.
 */
export async function filtrarElegiveisPorVinculo(
  cliente: Cliente,
  marcaId: string,
  modelo: string,
  hoje: Date = new Date(),
): Promise<{ id: string }[]> {
  const permitido = new Set(definicaoPesquisa(modelo).elegibilidadeVinculo);

  const candidatos = await cliente.colaborador.findMany({
    where: { empresa: { marcaId } },
    select: { id: true, ativo: true, tipoContrato: true },
  });
  if (candidatos.length === 0) return [];

  const ids = candidatos.map((c) => c.id);
  const [afastados, deFerias] = await Promise.all([
    idsComAfastamentoVigente(cliente, ids, hoje),
    idsComFeriasVigente(cliente, ids, hoje),
  ]);

  return candidatos
    .filter((c) => !afastados.has(c.id))
    .filter((c) => permitido.has(estadoVinculo(c, deFerias)))
    .map((c) => ({ id: c.id }));
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
