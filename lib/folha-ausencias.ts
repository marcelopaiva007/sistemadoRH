// Faltas de uma ausência que caem DENTRO de uma competência da folha.
//
// Criado em 26/11/2026. Até então `importarEventosDerivados`
// (lib/actions/rh-folha.ts) buscava toda ausência que TOCAVA o mês e somava o
// `dias` inteiro dela: uma falta de 28/01 a 05/02 (9 dias) virava 9 faltas em
// janeiro E 9 em fevereiro — 18 descontos para 9 dias. Agora cada ausência é
// recortada ao mês: 4 em janeiro (28 a 31), 5 em fevereiro (01 a 05).
//
// Sem Prisma e sem "use server": função pura, testada em
// scripts/test-folha-ausencia-competencia.ts.
//
// Datas são de calendário (meia-noite UTC — ver lib/datas.ts). O recorte usa
// `inicioDoDiaUTC` nas duas pontas, então uma data gravada com hora (ex.:
// 03:00Z vindo de um fuso Brasília convertido) continua caindo no dia certo e
// não escorrega para o mês vizinho.
import { diferencaEmDiasUTC, inicioDoDiaUTC } from "@/lib/datas";

export type AusenciaParaCompetencia = {
  dataInicio: Date;
  dataFim: Date;
  /** Dias gravados na ausência — corridos, contando as duas pontas. */
  dias: number;
};

/** Primeiro e último dia (meia-noite UTC) do mês da competência. */
export function diasDaCompetencia(referencia: Date): { primeiro: Date; ultimo: Date } {
  const ano = referencia.getUTCFullYear();
  const mes = referencia.getUTCMonth();
  return {
    primeiro: new Date(Date.UTC(ano, mes, 1)),
    ultimo: new Date(Date.UTC(ano, mes + 1, 0)),
  };
}

/**
 * Quantos dias da ausência caem no mês da competência.
 *
 * Ausência inteira dentro do mês devolve o `dias` gravado, sem recalcular — é
 * o número que o RH viu e aprovou. Ausência que atravessa a virada de mês (ou
 * de ano) conta só os dias corridos dentro do mês, nunca mais que o `dias`
 * gravado. Fora do mês, ou com datas invertidas, devolve 0.
 */
export function diasDaAusenciaNaCompetencia(a: AusenciaParaCompetencia, referencia: Date): number {
  const { primeiro, ultimo } = diasDaCompetencia(referencia);
  return diasDaAusenciaNoIntervalo(a, primeiro, ultimo);
}

/**
 * Quantos dias da ausência caem no intervalo [primeiro, ultimo] — as duas
 * pontas contam. É o recorte da competência generalizado (26/11/2026) para o
 * absenteísmo (lib/bi.ts, lib/dashboard.ts), que recorta à janela
 * [hoje − 30, hoje]: lá o `dias` inteiro somava dias que ainda não aconteceram
 * e dias de antes da janela. Mesma regra da folha: ausência inteira dentro
 * devolve o `dias` gravado; a que atravessa uma ponta conta só os dias
 * corridos dentro, nunca mais que o `dias` gravado; fora (ou datas
 * invertidas) devolve 0.
 */
export function diasDaAusenciaNoIntervalo(a: AusenciaParaCompetencia, primeiroDia: Date, ultimoDia: Date): number {
  const primeiro = inicioDoDiaUTC(primeiroDia);
  const ultimo = inicioDoDiaUTC(ultimoDia);
  const inicio = inicioDoDiaUTC(a.dataInicio);
  const fim = inicioDoDiaUTC(a.dataFim);
  if (ultimo < primeiro) return 0;
  if (fim < inicio || fim < primeiro || inicio > ultimo) return 0;
  if (inicio >= primeiro && fim <= ultimo) return Math.max(0, a.dias);

  const de = inicio > primeiro ? inicio : primeiro;
  const ate = fim < ultimo ? fim : ultimo;
  const dentro = diferencaEmDiasUTC(ate, de) + 1;
  return Math.max(0, Math.min(dentro, a.dias));
}

/** Faltas por colaborador na competência, já recortadas ao mês. Quem fica com 0 não entra. */
export function faltasPorColaboradorNaCompetencia(
  ausencias: readonly (AusenciaParaCompetencia & { colaboradorId: string })[],
  referencia: Date,
): Map<string, number> {
  const porColaborador = new Map<string, number>();
  for (const a of ausencias) {
    const dias = diasDaAusenciaNaCompetencia(a, referencia);
    if (dias <= 0) continue;
    porColaborador.set(a.colaboradorId, (porColaborador.get(a.colaboradorId) ?? 0) + dias);
  }
  return porColaborador;
}
