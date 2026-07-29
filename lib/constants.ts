export type ActionResult = { ok: true } | { ok: false; error: string };

export const CARGOS = [
  { value: "VENDEDOR_EXTERNO", label: "Vendedor Externo" },
  { value: "ATENDIMENTO_ADM", label: "Atendimento/Administrativo" },
  { value: "SUPERVISOR", label: "Supervisor" },
  { value: "OUTRO_SETOR", label: "Outro Setor" },
] as const;

// Papéis de acesso ao sistema (coluna User.role).
export const ROLES = [
  { value: "ADMIN", label: "Administrativo/Financeiro" },
  { value: "DIRETORIA", label: "Diretoria/Gestão" },
  { value: "RH_MANAGER", label: "Gestor(a) de RH" },
  { value: "GESTOR_SETOR", label: "Gestor(a) de Setor" },
] as const;

export const ROLE_LABEL: Record<string, string> = Object.fromEntries(
  ROLES.map((r) => [r.value, r.label]),
);
