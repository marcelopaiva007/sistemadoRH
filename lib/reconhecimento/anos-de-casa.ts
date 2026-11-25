import { anosCompletos, diaBrasilia, diferencaEmDiasUTC, somarAnosUTC } from "@/lib/datas";

// ANOS DE CASA — a conta do Reconhecimento, sem banco (26/11/2026).
//
// O defeito que a auditoria pegou: a tela listava os aniversários de admissão
// do mês com `anosCompletos(admissao, hoje)` — os anos completos ATÉ HOJE.
// Admitido em 28/11/2016, olhando em 25/11/2026, a tela dizia "9 anos": o 10º
// ainda não tinha chegado, então nem aparecia como marco redondo. Só que a
// linha existe justamente para o aniversário que VEM — é o 10º que se
// comemora no dia 28, e o RH prepara os parabéns antes.
//
// Duas perguntas diferentes, duas respostas separadas:
//
// - `anosHoje`: anos completos até HOJE, no calendário de Brasília. É o que
//   a pessoa TEM de casa agora.
// - `anos` (do aniversário deste ano): quantos anos ela COMPLETA no
//   aniversário de admissão deste ano. É esse que decide marco redondo e o
//   texto dos parabéns ("você completa 10 anos").
//
// "Hoje" é o dia de Brasília (`diaBrasilia`), não o dia UTC: de 21h à
// meia-noite o dia UTC já é amanhã, e a conta virava de ano três horas antes.

/** Marcos que ganham destaque no tempo de casa — os demais anos aparecem sem realce. */
export const MARCOS_REDONDOS: ReadonlySet<number> = new Set([1, 3, 5, 10, 15, 20, 25, 30]);

/** O dia de HOJE em Brasília, como meia-noite UTC desse dia (o formato das datas de ficha). */
export function hojeBrasiliaUTC(agora: Date = new Date()): Date {
  return new Date(`${diaBrasilia(agora)}T00:00:00Z`);
}

export type MarcoDeCasa = {
  /** Anos completos até hoje. */
  anosHoje: number;
  /** Anos que a pessoa completa no aniversário de admissão DESTE ano. */
  anos: number;
  /** O aniversário de admissão deste ano (29/02 cai em 28/02 nos anos comuns). */
  data: Date;
  /** Dias de hoje até `data`: 0 = hoje, negativo = já passou neste ano. */
  diasAte: number;
  /** `anos` é um dos MARCOS_REDONDOS. */
  redondo: boolean;
};

/**
 * O aniversário de admissão deste ano, visto de `hoje` (meia-noite UTC do dia
 * de Brasília — use `hojeBrasiliaUTC`). `admissao` é data de ficha (meia-noite
 * UTC do dia digitado).
 */
export function marcoDoAno(admissao: Date, hoje: Date): MarcoDeCasa {
  const anos = hoje.getUTCFullYear() - admissao.getUTCFullYear();
  const data = somarAnosUTC(admissao, anos);
  return {
    anosHoje: anosCompletos(admissao, hoje),
    anos,
    data,
    diasAte: diferencaEmDiasUTC(data, hoje),
    redondo: MARCOS_REDONDOS.has(anos),
  };
}
