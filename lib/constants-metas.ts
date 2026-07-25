export const STATUS_META = [
  { value: "EM_ANDAMENTO", label: "Em andamento" },
  { value: "ATINGIDA", label: "Atingida" },
  { value: "NAO_ATINGIDA", label: "Não atingida" },
  { value: "CANCELADA", label: "Cancelada" },
] as const;

export const statusMetaLabel = (v: string) => STATUS_META.find((s) => s.value === v)?.label ?? v;
