// EPIs de uma operação de telecom com equipe em campo — a lista cobre o que
// aparece de fato em obra/poste/torre, não um catálogo genérico de fábrica.

export const TIPOS_EPI = [
  { value: "CAPACETE", label: "Capacete de segurança", validadePadraoMeses: 60 },
  { value: "CINTO_SEGURANCA", label: "Cinto/talabarte de segurança (NR-35)", validadePadraoMeses: 24 },
  { value: "LUVA_ISOLANTE", label: "Luva isolante (NR-10)", validadePadraoMeses: 6 },
  { value: "LUVA_PROTECAO", label: "Luva de proteção geral", validadePadraoMeses: 6 },
  { value: "OCULOS_PROTECAO", label: "Óculos de proteção", validadePadraoMeses: 12 },
  { value: "PROTETOR_AURICULAR", label: "Protetor auricular", validadePadraoMeses: 6 },
  { value: "BOTINA", label: "Botina de segurança", validadePadraoMeses: 12 },
  { value: "COLETE_SINALIZACAO", label: "Colete de sinalização", validadePadraoMeses: 12 },
  { value: "CAPACETE_ISOLANTE", label: "Capacete com viseira isolante", validadePadraoMeses: 60 },
  { value: "MASCARA_RESPIRATORIA", label: "Máscara/respirador", validadePadraoMeses: 6 },
  { value: "PERNEIRA", label: "Perneira / manga de proteção", validadePadraoMeses: 12 },
  { value: "OUTRO", label: "Outro", validadePadraoMeses: null },
] as const;

export const MOTIVOS_ENTREGA_EPI = [
  { value: "PRIMEIRA_ENTREGA", label: "Primeira entrega" },
  { value: "TROCA_PERIODICA", label: "Troca periódica" },
  { value: "REPOSICAO_DANO", label: "Reposição por dano" },
  { value: "REPOSICAO_PERDA", label: "Reposição por perda" },
] as const;

const rotulo = <T extends readonly { value: string; label: string }[]>(lista: T) =>
  (v: string | null | undefined) => (v ? lista.find((i) => i.value === v)?.label ?? v : "—");

export const tipoEpiLabel = rotulo(TIPOS_EPI);
export const motivoEntregaEpiLabel = rotulo(MOTIVOS_ENTREGA_EPI);

export const validadePadraoDoEpi = (tipo: string) =>
  TIPOS_EPI.find((t) => t.value === tipo)?.validadePadraoMeses ?? null;
