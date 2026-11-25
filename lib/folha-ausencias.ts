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
import { diferencaEmDiasUTC, inicioDoDiaUTC, somarDiasUTC } from "@/lib/datas";

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

/** Segunda-feira (meia-noite UTC) da semana do dia — a semana da grade vai de segunda a domingo. */
function segundaDaSemana(dia: Date): number {
  const diaDaSemana = dia.getUTCDay(); // 0 = domingo
  const voltar = diaDaSemana === 0 ? 6 : diaDaSemana - 1;
  return somarDiasUTC(dia, -voltar).getTime();
}

/**
 * DSR perdidos por colaborador na competência (26/11/2026).
 *
 * Lei 605/49, art. 6º: quem falta sem justificativa na semana não tem direito
 * à remuneração do repouso semanal daquela semana. Uma semana com falta
 * injustificada = 1 DSR perdido, tenha a semana 1 ou 5 faltas.
 *
 * Semana de segunda a domingo. A semana entra na competência em que cai a
 * PRIMEIRA falta dela: semana de 27/01 a 02/02 com falta em 30/01 e 02/02 é 1
 * DSR perdido em janeiro, nenhum em fevereiro — nunca a mesma semana contada
 * nos dois meses. Por isso quem chama precisa trazer as ausências desde 6 dias
 * antes do início do mês (a semana que começou no mês anterior).
 *
 * Fora daqui, de propósito: feriado da semana (a perda alcança também o
 * feriado, art. 6º §1º, mas o sistema não tem calendário de feriados) e o
 * valor em dinheiro — o escritório calcula; o sistema informa a quantidade.
 */
export function dsrPerdidosPorColaboradorNaCompetencia(
  ausencias: readonly (Pick<AusenciaParaCompetencia, "dataInicio" | "dataFim"> & { colaboradorId: string })[],
  referencia: Date,
): Map<string, number> {
  const { primeiro, ultimo } = diasDaCompetencia(referencia);
  const janelaInicio = somarDiasUTC(primeiro, -6);

  // colaborador -> semana (segunda, em ms) -> primeira falta da semana (ms)
  const primeiraFaltaDaSemana = new Map<string, Map<number, number>>();
  for (const a of ausencias) {
    const inicio = inicioDoDiaUTC(a.dataInicio);
    const fim = inicioDoDiaUTC(a.dataFim);
    if (fim < inicio) continue;
    const de = inicio > janelaInicio ? inicio : janelaInicio;
    const ate = fim < ultimo ? fim : ultimo;
    if (ate < de) continue;
    const semanas = primeiraFaltaDaSemana.get(a.colaboradorId) ?? new Map<number, number>();
    for (let dia = de; dia <= ate; dia = somarDiasUTC(dia, 1)) {
      const semana = segundaDaSemana(dia);
      const atual = semanas.get(semana);
      if (atual === undefined || dia.getTime() < atual) semanas.set(semana, dia.getTime());
    }
    primeiraFaltaDaSemana.set(a.colaboradorId, semanas);
  }

  const porColaborador = new Map<string, number>();
  for (const [colaboradorId, semanas] of primeiraFaltaDaSemana) {
    let perdidos = 0;
    for (const primeiraFalta of semanas.values()) {
      if (primeiraFalta >= primeiro.getTime() && primeiraFalta <= ultimo.getTime()) perdidos++;
    }
    if (perdidos > 0) porColaborador.set(colaboradorId, perdidos);
  }
  return porColaborador;
}
