// As duas áreas do módulo Processos & Ativos: FROTA e CONTRATOS.
//
// Desde a v1.204.0 cada uma tem sua própria tela — lateral, Pendências e Painel
// separados. Antes era um menu só, com a Central de Pendências misturando
// "completar cadastro do veículo" com "decidir renovação do aluguel": duas
// equipes diferentes cobradas na mesma lista.
//
// A área é decidida pelo TIPO da pendência, não pela origem gravada, porque o
// tipo é o que os detectores (lib/processos/pendencias.ts) já materializam e é
// por ele que a Central decide o botão da linha.

export type AreaProcessos = "frota" | "contratos";

/** Tipos de pendência que pertencem à área de Contratos. O resto é Frota. */
export const TIPOS_PENDENCIA_CONTRATOS = [
  "DENUNCIA_CONTRATO",
  "ACAO_RENOVATORIA",
  "REAJUSTE_CONTRATO",
  "ALUGUEL_ATRASADO",
];

/** Filtro Prisma de `Pendencia.tipo` para uma área. */
export function filtroTipoDaArea(area: AreaProcessos) {
  return area === "contratos"
    ? { in: TIPOS_PENDENCIA_CONTRATOS }
    : { notIn: TIPOS_PENDENCIA_CONTRATOS };
}

/**
 * Em que área está um caminho dentro de `/processos/<empresaId>`. `resto` é o
 * que vem depois do id ("", "painel", "frota/multas", "contratos/pendencias"…).
 */
export function areaDoCaminho(resto: string): AreaProcessos {
  return resto === "contratos" || resto.startsWith("contratos/") || resto === "alugueis" || resto.startsWith("alugueis/")
    ? "contratos"
    : "frota";
}
