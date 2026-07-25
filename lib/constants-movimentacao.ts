export const TIPOS_MOVIMENTACAO = [
  { value: "PROMOCAO", label: "Promoção" },
  { value: "TRANSFERENCIA_SETOR", label: "Transferência de setor" },
  { value: "MUDANCA_SUPERVISOR", label: "Mudança de líder" },
  { value: "MUDANCA_CARGO", label: "Mudança de cargo (lateral)" },
  { value: "OUTRO", label: "Outro" },
] as const;

export const tipoMovimentacaoLabel = (v: string) =>
  TIPOS_MOVIMENTACAO.find((t) => t.value === v)?.label ?? v;
