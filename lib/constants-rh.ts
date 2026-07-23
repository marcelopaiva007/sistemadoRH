export const STATUS_PESQUISA = [
  { value: "DRAFT", label: "Rascunho" },
  { value: "ACTIVE", label: "Ativa" },
  { value: "FINISHED", label: "Encerrada" },
  { value: "ARCHIVED", label: "Arquivada" },
] as const;

export const TIPOS_PERGUNTA = [
  { value: "LIKERT_5", label: "Escala 1 a 5" },
  { value: "FREQ_0_4", label: "Frequência 0 a 4 (NR-01)" },
  { value: "NPS_10", label: "Escala 0 a 10 (NPS)" },
  { value: "MULTIPLE_CHOICE", label: "Múltipla escolha" },
  { value: "TEXT", label: "Texto livre" },
] as const;

export const DIMENSOES_GPTW = [
  { value: "CREDIBILIDADE", label: "Credibilidade" },
  { value: "RESPEITO", label: "Respeito" },
  { value: "IMPARCIALIDADE", label: "Imparcialidade" },
  { value: "ORGULHO", label: "Orgulho" },
  { value: "CAMARADAGEM", label: "Camaradagem" },
  { value: "GERAL", label: "Geral" },
] as const;

export const STATUS_TOKEN = [
  { value: "PENDING", label: "Pendente" },
  { value: "SENT", label: "Enviado" },
  { value: "DELIVERED", label: "Entregue" },
  { value: "FAILED", label: "Falhou" },
  { value: "RESPONDED", label: "Respondido" },
] as const;

export const statusPesquisaLabel = (v: string) => STATUS_PESQUISA.find((s) => s.value === v)?.label ?? v;
export const tipoPerguntaLabel = (v: string) => TIPOS_PERGUNTA.find((t) => t.value === v)?.label ?? v;
export const dimensaoGPTWLabel = (v: string) => DIMENSOES_GPTW.find((d) => d.value === v)?.label ?? v;
export const statusTokenLabel = (v: string) => STATUS_TOKEN.find((s) => s.value === v)?.label ?? v;

export const AMOSTRA_MINIMA_ANONIMATO = 3;
