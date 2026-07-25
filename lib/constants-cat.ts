export const TIPOS_ACIDENTE = [
  { value: "TIPICO", label: "Típico (no exercício do trabalho)" },
  { value: "TRAJETO", label: "De trajeto (percurso casa-trabalho)" },
  { value: "DOENCA_OCUPACIONAL", label: "Doença ocupacional" },
] as const;

export const SITUACOES_ACIDENTE = [
  { value: "EM_INVESTIGACAO", label: "Em investigação" },
  { value: "CONCLUIDO", label: "Concluído" },
] as const;

const rotulo = <T extends readonly { value: string; label: string }[]>(lista: T) =>
  (v: string | null | undefined) => (v ? lista.find((i) => i.value === v)?.label ?? v : "—");

export const tipoAcidenteLabel = rotulo(TIPOS_ACIDENTE);
export const situacaoAcidenteLabel = rotulo(SITUACOES_ACIDENTE);

// Prazo legal para emissão da CAT ao INSS: 1 dia útil (imediato se fatal).
// Simplificação de dias corridos aqui — é o número que orienta o alerta, não
// um cálculo de dia útil com calendário de feriados.
export const DIAS_PRAZO_CAT = 1;
