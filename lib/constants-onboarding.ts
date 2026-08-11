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
  // Marcos de acompanhamento dos primeiros 90 dias. O risco de saída está
  // concentrado no primeiro ano (Vendas: mediana de 0,59 ano de casa, 64%
  // abaixo de 1 ano) — e para técnico instalador e vendedor externo a conversa
  // de 30 dias é a intervenção de retenção mais barata que existe. Hoje ela não
  // tem gatilho nenhum; entrando na trilha padrão, nasce com prazo e dono.
  { value: "CONVERSA_30", label: "Conversa de 30 dias", responsavelPadrao: "Gestor" },
  { value: "CONVERSA_60", label: "Conversa de 60 dias", responsavelPadrao: "Gestor" },
  { value: "CONVERSA_90", label: "Conversa de 90 dias", responsavelPadrao: "Gestor" },
  { value: "OUTRO", label: "Outro", responsavelPadrao: null },
] as const;

/**
 * Dias após a admissão em que cada marco de conversa deve acontecer. É daqui
 * que `gerarTrilhaPadrao` calcula o prazo do item — os demais itens do
 * catálogo continuam nascendo sem prazo, porque "entregar crachá" não tem uma
 * data certa derivável da admissão.
 */
export const DIAS_DO_MARCO: Record<string, number> = {
  CONVERSA_30: 30,
  CONVERSA_60: 60,
  CONVERSA_90: 90,
};

export const itemOnboardingLabel = (v: string) =>
  ITENS_ONBOARDING.find((i) => i.value === v)?.label ?? v;

export const responsavelPadraoDoItem = (v: string) =>
  ITENS_ONBOARDING.find((i) => i.value === v)?.responsavelPadrao ?? null;
