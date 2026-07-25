// Trilha de integração do novo colaborador. Espelho do catálogo de
// offboarding (lib/constants-offboarding.ts): o que é entregue/liberado na
// entrada é o mesmo que é devolvido/revogado na saída.
//
// `responsavelPadrao` é sugestão, não regra — o RH troca no formulário. Serve
// para a trilha já nascer sabendo quem faz o quê, já que integração é
// distribuída entre áreas.
export const ITENS_ONBOARDING = [
  { value: "CRACHA", label: "Entrega do crachá", responsavelPadrao: "RH" },
  { value: "UNIFORME", label: "Entrega do uniforme", responsavelPadrao: "Almoxarifado" },
  { value: "EPI", label: "Entrega dos EPIs da função", responsavelPadrao: "Almoxarifado" },
  { value: "NOTEBOOK", label: "Entrega do notebook", responsavelPadrao: "TI" },
  { value: "CELULAR_CORPORATIVO", label: "Entrega do celular/chip corporativo", responsavelPadrao: "TI" },
  { value: "FERRAMENTAS", label: "Entrega de ferramentas/equipamentos", responsavelPadrao: "Almoxarifado" },
  { value: "VEICULO", label: "Entrega de veículo", responsavelPadrao: "Frota" },
  { value: "ACESSO_SISTEMA", label: "Criação de acesso aos sistemas", responsavelPadrao: "TI" },
  { value: "ACESSO_FISICO", label: "Liberação de acesso físico (portão/catraca)", responsavelPadrao: "TI" },
  { value: "APRESENTACAO_EQUIPE", label: "Apresentação à equipe e ao gestor", responsavelPadrao: "Gestor" },
  { value: "TREINAMENTO_INTEGRACAO", label: "Treinamento de integração", responsavelPadrao: "RH" },
  { value: "TREINAMENTO_NR", label: "Treinamento das NRs exigidas pela função", responsavelPadrao: "SST" },
  { value: "OUTRO", label: "Outro", responsavelPadrao: null },
] as const;

export const itemOnboardingLabel = (v: string) =>
  ITENS_ONBOARDING.find((i) => i.value === v)?.label ?? v;

export const responsavelPadraoDoItem = (v: string) =>
  ITENS_ONBOARDING.find((i) => i.value === v)?.responsavelPadrao ?? null;
