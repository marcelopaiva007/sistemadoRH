// O DIGEST (spec §6.1/§9.1): "monta e envia digest por e-mail respeitando
// `periodicidade_retorno` de cada demanda". Módulo PURO — decide QUAIS
// demandas entram em QUAL rodada; quem lê o banco e manda o e-mail é
// lib/delegacoes/enviar-digest.ts.
//
// O cron roda 2x/dia (7h e 18h de Brasília — spec §6.1). Em vez de cada
// periodicidade aparecer nas DUAS rodadas (o que faria DIARIO chegar duas
// vezes no mesmo dia — o oposto de "diário"), a manhã é A rodada do digest:
// é nela que DIARIO/SEMANAL/DUAS_POR_SEMANA disparam. A tarde existe só para
// SO_ATRASO — um segundo pulso, no mesmo dia, só do que virou atraso.

export type PeriodoDigest = "MANHA" | "TARDE";

/** 1 = segunda … 7 = domingo (ISO), a partir de "aaaa-mm-dd". */
export function diaSemanaIso(diaBrasiliaTexto: string): number {
  const dow = new Date(`${diaBrasiliaTexto}T12:00:00Z`).getUTCDay(); // 0=domingo..6=sábado
  return dow === 0 ? 7 : dow;
}

const SEGUNDA = 1;
const QUINTA = 4;

/**
 * A pergunta central: esta demanda entra na rodada de agora? Nunca olha
 * `emRisco` nem classificação — isso é DESTAQUE dentro do digest (spec:
 * "digest destacado"), não critério de inclusão. Inclusão é só a
 * periodicidade que o solicitante escolheu, mais o filtro de atraso da
 * SO_ATRASO.
 */
export function demandaEntraNoDigest(params: {
  periodicidadeRetorno: string;
  diasParaPrazo: number;
  periodo: PeriodoDigest;
  diaSemanaIso: number;
}): boolean {
  switch (params.periodicidadeRetorno) {
    case "SO_ENTREGA":
      // A entrega já notifica por conta própria (Telegram/e-mail no
      // ENTREGAR) — o digest periódico não é o canal dela.
      return false;
    case "SO_ATRASO":
      return params.diasParaPrazo < 0;
    case "DIARIO":
      return params.periodo === "MANHA";
    case "SEMANAL":
      return params.periodo === "MANHA" && params.diaSemanaIso === SEGUNDA;
    case "DUAS_POR_SEMANA":
      return params.periodo === "MANHA" && (params.diaSemanaIso === SEGUNDA || params.diaSemanaIso === QUINTA);
    default:
      return false;
  }
}
