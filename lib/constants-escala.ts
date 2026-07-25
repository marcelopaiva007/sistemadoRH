export const TIPOS_TURNO = [
  { value: "MANHA", label: "Manhã", cor: "#fbbf24" },
  { value: "TARDE", label: "Tarde", cor: "#fb923c" },
  { value: "NOITE", label: "Noite", cor: "#6366f1" },
  { value: "INTEGRAL", label: "Integral", cor: "#2563eb" },
  { value: "PLANTAO", label: "Plantão", cor: "#dc2626" },
  { value: "FOLGA", label: "Folga", cor: "#94a3b8" },
  { value: "OUTRO", label: "Outro", cor: "#a78bfa" },
] as const;

export const tipoTurnoLabel = (v: string | null) =>
  v ? TIPOS_TURNO.find((t) => t.value === v)?.label ?? v : "—";

export const corDoTurno = (v: string | null) =>
  TIPOS_TURNO.find((t) => t.value === v)?.cor ?? "#cbd5e1";
