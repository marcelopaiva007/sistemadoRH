/**
 * Constantes do módulo de Ponto compartilhadas entre servidor e telas.
 *
 * Os rótulos de tipo de tratamento viviam em TRÊS cópias (aba Tratamento,
 * Central de Aprovações e o Set de validação em app/actions/rh-ponto.ts), e o
 * tipo novo ABONO_FOLGA teria que ser lembrado nos três. Uma lista só, com a
 * mesma prova de origem dos outros catálogos (lib/constants-dp.ts): o value é
 * o que o banco guarda, o label é o que a pessoa lê.
 */

export const TIPOS_TRATAMENTO_PONTO = [
  { value: "INCLUSAO_MANUAL", label: "Inclusão Manual (Esquecimento)" },
  { value: "ABONO_ATESTADO", label: "Abono por Atestado Médico" },
  { value: "JUSTIFICATIVA", label: "Justificativa de Falta/Atraso" },
  { value: "CORRECAO", label: "Correção de Marcação" },
  // Pedido pelo colaborador que estava de folga e precisa regularizar algo do
  // ponto daquele dia (21/08/2026). Sempre nasce PENDENTE e quem decide é o RH.
  { value: "ABONO_FOLGA", label: "Abono em Dia de Folga" },
] as const;

export type TipoTratamentoPonto = (typeof TIPOS_TRATAMENTO_PONTO)[number]["value"];

export const TIPOS_TRATAMENTO_VALIDOS: ReadonlySet<string> = new Set(
  TIPOS_TRATAMENTO_PONTO.map((t) => t.value),
);

export function tipoTratamentoLabel(tipo: string): string {
  return TIPOS_TRATAMENTO_PONTO.find((t) => t.value === tipo)?.label ?? tipo;
}

/** As 4 marcações do dia, na ordem em que acontecem — mesmo rótulo dos botões. */
export const TIPOS_MARCACAO_PONTO = [
  { value: "ENTRADA_1", label: "1ª Entrada" },
  { value: "SAIDA_1", label: "1ª Saída (Almoço)" },
  { value: "ENTRADA_2", label: "2ª Entrada (Retorno)" },
  { value: "SAIDA_2", label: "2ª Saída (Fim de Turno)" },
] as const;

export type TipoMarcacaoPonto = (typeof TIPOS_MARCACAO_PONTO)[number]["value"];

export const TIPOS_MARCACAO_VALIDOS: ReadonlySet<string> = new Set(
  TIPOS_MARCACAO_PONTO.map((t) => t.value),
);

export function tipoMarcacaoLabel(tipo: string): string {
  return TIPOS_MARCACAO_PONTO.find((t) => t.value === tipo)?.label ?? tipo;
}
