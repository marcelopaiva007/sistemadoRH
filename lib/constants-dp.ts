// Listas do Departamento Pessoal (Fase 1). Como no resto do schema, os "enums"
// são colunas TEXT — estas listas são a fonte de verdade dos valores aceitos e
// dos rótulos exibidos.

export const TIPOS_DOCUMENTO = [
  { value: "RG", label: "RG" },
  { value: "CPF", label: "CPF" },
  { value: "CTPS", label: "CTPS" },
  { value: "CNH", label: "CNH" },
  { value: "TITULO_ELEITOR", label: "Título de eleitor" },
  { value: "COMPROVANTE_RESIDENCIA", label: "Comprovante de residência" },
  { value: "CONTRATO", label: "Contrato de trabalho" },
  { value: "ASO", label: "ASO (exame ocupacional)" },
  { value: "CERTIFICADO_NR", label: "Certificado de NR" },
  { value: "CNH_CATEGORIA", label: "CNH — categoria/validade" },
  { value: "DIPLOMA", label: "Diploma / certificado" },
  { value: "ATESTADO", label: "Atestado médico" },
  { value: "OUTRO", label: "Outro" },
] as const;

// Documentos que fazem sentido ter validade — usados para sugerir o campo
// "válido até" e alimentar o painel de vencimentos.
export const TIPOS_DOCUMENTO_COM_VALIDADE = [
  "ASO",
  "CERTIFICADO_NR",
  "CNH",
  "CNH_CATEGORIA",
  "CONTRATO",
] as const;

export const TIPOS_AUSENCIA = [
  { value: "ATESTADO", label: "Atestado médico", abonadaPorPadrao: true },
  { value: "FALTA_JUSTIFICADA", label: "Falta justificada", abonadaPorPadrao: true },
  { value: "FALTA_INJUSTIFICADA", label: "Falta injustificada", abonadaPorPadrao: false },
  { value: "LICENCA_MATERNIDADE", label: "Licença-maternidade", abonadaPorPadrao: true },
  { value: "LICENCA_PATERNIDADE", label: "Licença-paternidade", abonadaPorPadrao: true },
  { value: "LICENCA_NOJO", label: "Licença-nojo (falecimento)", abonadaPorPadrao: true },
  { value: "LICENCA_GALA", label: "Licença-gala (casamento)", abonadaPorPadrao: true },
  { value: "AFASTAMENTO_INSS", label: "Afastamento INSS", abonadaPorPadrao: true },
  { value: "ACIDENTE_TRABALHO", label: "Acidente de trabalho", abonadaPorPadrao: true },
  { value: "SUSPENSAO", label: "Suspensão disciplinar", abonadaPorPadrao: false },
  { value: "OUTRO", label: "Outro", abonadaPorPadrao: false },
] as const;

export const TIPOS_CONTRATO = [
  { value: "CLT", label: "CLT" },
  { value: "EXPERIENCIA", label: "Contrato de experiência" },
  { value: "TEMPORARIO", label: "Temporário" },
  { value: "APRENDIZ", label: "Jovem aprendiz" },
  { value: "ESTAGIO", label: "Estágio" },
  { value: "PJ", label: "PJ / prestador" },
  { value: "OUTRO", label: "Outro" },
] as const;

// Só quem é CLT entra no controle de férias da CLT (art. 129 e seguintes).
export const CONTRATOS_COM_FERIAS_CLT = ["CLT", "EXPERIENCIA", "APRENDIZ"] as const;

export const ESTADOS_CIVIS = [
  { value: "SOLTEIRO", label: "Solteiro(a)" },
  { value: "CASADO", label: "Casado(a)" },
  { value: "UNIAO_ESTAVEL", label: "União estável" },
  { value: "DIVORCIADO", label: "Divorciado(a)" },
  { value: "VIUVO", label: "Viúvo(a)" },
] as const;

export const ESCOLARIDADES = [
  { value: "FUNDAMENTAL_INCOMPLETO", label: "Fundamental incompleto" },
  { value: "FUNDAMENTAL", label: "Fundamental completo" },
  { value: "MEDIO_INCOMPLETO", label: "Médio incompleto" },
  { value: "MEDIO", label: "Médio completo" },
  { value: "TECNICO", label: "Técnico" },
  { value: "SUPERIOR_INCOMPLETO", label: "Superior incompleto" },
  { value: "SUPERIOR", label: "Superior completo" },
  { value: "POS_GRADUACAO", label: "Pós-graduação" },
] as const;

export const PARENTESCOS = [
  { value: "FILHO", label: "Filho(a)" },
  { value: "CONJUGE", label: "Cônjuge / companheiro(a)" },
  { value: "ENTEADO", label: "Enteado(a)" },
  { value: "PAI_MAE", label: "Pai / mãe" },
  { value: "TUTELADO", label: "Tutelado(a)" },
  { value: "OUTRO", label: "Outro" },
] as const;

export const TIPOS_CONTA_BANCARIA = [
  { value: "CORRENTE", label: "Conta corrente" },
  { value: "POUPANCA", label: "Poupança" },
  { value: "SALARIO", label: "Conta salário" },
  { value: "PAGAMENTO", label: "Conta de pagamento" },
] as const;

export const STATUS_SOLICITACAO = [
  { value: "PENDENTE", label: "Pendente" },
  { value: "APROVADA", label: "Aprovada" },
  { value: "REPROVADA", label: "Reprovada" },
  { value: "CANCELADA", label: "Cancelada" },
] as const;

export const MOTIVOS_DESLIGAMENTO = [
  { value: "PEDIDO_DEMISSAO", label: "Pedido de demissão" },
  { value: "SEM_JUSTA_CAUSA", label: "Dispensa sem justa causa" },
  { value: "JUSTA_CAUSA", label: "Dispensa por justa causa" },
  { value: "FIM_CONTRATO", label: "Fim de contrato" },
  { value: "ACORDO", label: "Acordo (art. 484-A)" },
  { value: "APOSENTADORIA", label: "Aposentadoria" },
  { value: "FALECIMENTO", label: "Falecimento" },
] as const;

const rotulo = <T extends readonly { value: string; label: string }[]>(lista: T) =>
  (v: string | null | undefined) => (v ? lista.find((i) => i.value === v)?.label ?? v : "—");

export const tipoDocumentoLabel = rotulo(TIPOS_DOCUMENTO);
export const tipoAusenciaLabel = rotulo(TIPOS_AUSENCIA);
export const tipoContratoLabel = rotulo(TIPOS_CONTRATO);
export const estadoCivilLabel = rotulo(ESTADOS_CIVIS);
export const escolaridadeLabel = rotulo(ESCOLARIDADES);
export const parentescoLabel = rotulo(PARENTESCOS);
export const tipoContaLabel = rotulo(TIPOS_CONTA_BANCARIA);
export const statusSolicitacaoLabel = rotulo(STATUS_SOLICITACAO);
export const motivoDesligamentoLabel = rotulo(MOTIVOS_DESLIGAMENTO);

// Tamanho máximo de anexo. Vercel limita o corpo de uma requisição de função a
// 4,5 MB — 4 MB deixa margem para o resto do formulário.
export const TAMANHO_MAXIMO_ANEXO = 4 * 1024 * 1024;

export const MIMES_ANEXO_ACEITOS = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
] as const;

// Janela em que um documento/férias já aparece como "vencendo" no painel.
export const DIAS_ALERTA_VENCIMENTO = 60;
