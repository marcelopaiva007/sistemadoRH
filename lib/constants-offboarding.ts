// Catálogo padrão do checklist de saída. "Gerar checklist" cria uma linha por
// item para o colaborador desligado; o RH marca cada um como concluído
// conforme resolve.
export const ITENS_OFFBOARDING = [
  { value: "CRACHA", label: "Devolução do crachá" },
  { value: "NOTEBOOK", label: "Devolução do notebook" },
  { value: "CELULAR_CORPORATIVO", label: "Devolução do celular corporativo" },
  { value: "CHIP", label: "Devolução do chip/linha corporativa" },
  { value: "EPI", label: "Devolução de EPIs" },
  { value: "FERRAMENTAS", label: "Devolução de ferramentas/equipamentos" },
  { value: "VEICULO", label: "Devolução de veículo" },
  { value: "ACESSO_SISTEMA", label: "Revogação de acesso aos sistemas" },
  { value: "ACESSO_FISICO", label: "Revogação de acesso físico (portão/catraca)" },
  { value: "EXAME_DEMISSIONAL", label: "Exame demissional agendado/realizado" },
  { value: "ACERTO_RESCISORIO", label: "Acerto rescisório calculado" },
  { value: "OUTRO", label: "Outro" },
] as const;

export const itemOffboardingLabel = (v: string) =>
  ITENS_OFFBOARDING.find((i) => i.value === v)?.label ?? v;
