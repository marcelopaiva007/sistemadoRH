export type ActionResult = { ok: true } | { ok: false; error: string };

export const CARGOS = [
  { value: "VENDEDOR_EXTERNO", label: "Vendedor Externo" },
  { value: "ATENDIMENTO_ADM", label: "Atendimento/Administrativo" },
  { value: "SUPERVISOR", label: "Supervisor" },
  { value: "OUTRO_SETOR", label: "Outro Setor" },
] as const;
