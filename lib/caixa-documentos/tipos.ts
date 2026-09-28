// Caixa de documentos — os tipos que a IA reconhece e para onde cada um vai.
//
// Puro (sem banco, sem IA): importado pela tela, pelo normalizador e pelos
// testes. A tabela DESTINO é a regra de negócio inteira em um lugar só — um
// tipo novo que não entra aqui não compila no roteador.

export const TIPOS_CAIXA = [
  { value: "ASO", label: "ASO (exame ocupacional)" },
  { value: "CONTRACHEQUE", label: "Contracheque (holerite)" },
  { value: "RECIBO_FERIAS", label: "Recibo de férias" },
  { value: "TRCT", label: "Termo de rescisão (TRCT)" },
  { value: "INFORME_RENDIMENTOS", label: "Informe de rendimentos" },
  { value: "ATESTADO", label: "Atestado médico" },
  { value: "CERTIFICADO_NR", label: "Certificado de NR" },
  { value: "RG", label: "RG" },
  { value: "CPF", label: "CPF" },
  { value: "CTPS", label: "CTPS" },
  { value: "CNH", label: "CNH" },
  { value: "TITULO_ELEITOR", label: "Título de eleitor" },
  { value: "COMPROVANTE_RESIDENCIA", label: "Comprovante de residência" },
  { value: "CONTRATO", label: "Contrato de trabalho" },
  { value: "DIPLOMA", label: "Diploma / certificado de curso" },
  // Documento de uma pessoa que não se encaixa acima (ficha de EPI, CAT,
  // advertência...): nunca é gravado sozinho — o RH escolhe o destino.
  { value: "OUTRO_DO_COLABORADOR", label: "Outro documento do colaborador" },
  // Guia de imposto, relatório geral, capa... Sugere descartar.
  { value: "NAO_E_DE_COLABORADOR", label: "Não é documento de colaborador" },
] as const;

export type TipoCaixa = (typeof TIPOS_CAIXA)[number]["value"];

export const VALORES_TIPO_CAIXA = TIPOS_CAIXA.map((t) => t.value) as TipoCaixa[];

export function tipoCaixaLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return TIPOS_CAIXA.find((t) => t.value === v)?.label ?? v;
}

/** Onde cada tipo é gravado. `null` = nunca automático (fila de conferência). */
export type Destino = "EXAME" | "AUSENCIA" | "CERTIFICADO_NR" | "DOSSIE" | null;

export const DESTINO: Record<TipoCaixa, Destino> = {
  ASO: "EXAME",
  CONTRACHEQUE: "DOSSIE",
  RECIBO_FERIAS: "DOSSIE",
  TRCT: "DOSSIE",
  INFORME_RENDIMENTOS: "DOSSIE",
  ATESTADO: "AUSENCIA",
  CERTIFICADO_NR: "CERTIFICADO_NR",
  RG: "DOSSIE",
  CPF: "DOSSIE",
  CTPS: "DOSSIE",
  CNH: "DOSSIE",
  TITULO_ELEITOR: "DOSSIE",
  COMPROVANTE_RESIDENCIA: "DOSSIE",
  CONTRATO: "DOSSIE",
  DIPLOMA: "DOSSIE",
  OUTRO_DO_COLABORADOR: null,
  NAO_E_DE_COLABORADOR: null,
};

/**
 * O destino de um tipo. Na gravação MANUAL, "outro documento do colaborador"
 * pode ir ao Dossiê como "Outro" — o RH olhou e decidiu; a leitura automática
 * nunca faz isso sozinha.
 */
export function destinoDoTipo(tipo: TipoCaixa, automatico: boolean): Destino {
  if (tipo === "OUTRO_DO_COLABORADOR" && !automatico) return "DOSSIE";
  return DESTINO[tipo];
}

/** Rótulo curto do lugar para onde foi — é o que a tela mostra em "Gravado em". */
export const DESTINO_LABEL: Record<Exclude<Destino, null>, string> = {
  EXAME: "Exames ocupacionais (SST)",
  AUSENCIA: "Ausências (vai para Aprovações)",
  CERTIFICADO_NR: "Treinamentos de NR (SST)",
  DOSSIE: "Dossiê",
};

/** Aba da ficha que mostra o destino — para o link "ver na ficha". */
export const ABA_DO_DESTINO: Record<Exclude<Destino, null>, string> = {
  EXAME: "seguranca",
  AUSENCIA: "ausencias",
  CERTIFICADO_NR: "seguranca",
  DOSSIE: "dossie",
};

/**
 * Tipos que aparecem NO PORTAL da pessoa assim que gravados (Dossiê e
 * Ausência). Errar a pessoa aqui mostra salário ou atestado de alguém a outra
 * pessoa — por isso a regra de gravação sozinha é mais dura para eles
 * (lib/caixa-documentos/decidir.ts).
 */
export function visivelNoPortal(tipo: TipoCaixa): boolean {
  const d = DESTINO[tipo];
  return d === "DOSSIE" || d === "AUSENCIA";
}

/**
 * Tipos que podem ser de quem JÁ SAIU da empresa — a rescisão, o último
 * contracheque, o ASO demissional. Para os demais, ficha desligada não é
 * candidata.
 */
export const TIPOS_DE_QUEM_SAIU: readonly TipoCaixa[] = [
  "TRCT",
  "CONTRACHEQUE",
  "RECIBO_FERIAS",
  "INFORME_RENDIMENTOS",
  "ASO",
];

/** Até quantos dias depois do desligamento um documento ainda casa com a ficha. */
export const DIAS_APOS_DESLIGAMENTO = 180;

/** Confiança mínima (0..1) que a IA precisa declarar para gravar sozinha. */
export const CONFIANCA_MINIMA = 0.8;

/** Páginas lidas por chamada à IA. */
export const PAGINAS_POR_BLOCO = 8;

/** Itens roteados por chamada do processamento (limita o tempo de cada uma). */
export const ITENS_POR_RODADA = 20;

/** Tamanho máximo de um arquivo enviado à Caixa. */
export const TAMANHO_MAXIMO_CAIXA = 20 * 1024 * 1024;

/** Formatos que a Caixa aceita — os que a IA consegue ler (HEIC não). */
export const MIMES_CAIXA = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;

export const STATUS_RECEBIDO = ["PENDENTE", "LENDO", "ROTEANDO", "CONCLUIDO", "ERRO", "DESCARTADO"] as const;
export type StatusRecebido = (typeof STATUS_RECEBIDO)[number];

export const STATUS_ITEM = ["PENDENTE", "GRAVADO", "CONFERIR", "DESCARTADO"] as const;
export type StatusItem = (typeof STATUS_ITEM)[number];

/**
 * Início do motivo do item descartado sozinho por ser de empresa que quem
 * enviou não acessa. O nome, CPF e campos lidos são apagados na hora; as
 * páginas dele continuam contando como "de outra pessoa" (decidir.ts).
 */
export const MOTIVO_FORA_DO_ESCOPO = "Documento de empresa que quem enviou não acessa";

/**
 * Quantas páginas antes e depois do item o RH pode ver e incluir na
 * conferência (acertar onde o documento começa ou termina). Mais que isso é
 * ver a folha dos outros.
 */
export const JANELA_PAGINAS = 5;
