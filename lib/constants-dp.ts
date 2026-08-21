// Listas do Departamento Pessoal (Fase 1). Como no resto do schema, os "enums"
// são colunas TEXT — estas listas são a fonte de verdade dos valores aceitos e
// dos rótulos exibidos.
import type { BadgeVariant, StatusBadgeMap } from "@/components/status-badge";

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

// Contratos que acabam numa data — os que alimentam `dataFimContrato` e a
// pendência de vencimento. PJ fica de fora de propósito: o contrato existe e
// tem prazo, mas quem controla é o contrato civil, não o DP.
//
// Por que isto é a pendência mais cara do RH: passado o termo sem rescindir ou
// renovar, o contrato de experiência vira por prazo indeterminado (CLT art.
// 445 e 451) e a empresa herda aviso prévio, multa de 40% do FGTS e todo o
// custo de uma demissão que ela achava que não teria. O prazo não avisa —
// simplesmente passa.
export const CONTRATOS_POR_PRAZO = ["EXPERIENCIA", "TEMPORARIO", "ESTAGIO"] as const;

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

/**
 * Ao lado de STATUS_SOLICITACAO para os dois nunca divergirem — consumido por
 * StatusBadge (components/status-badge.tsx). Substitui VariantePorStatus
 * (ferias-card.tsx) e varianteStatus (portal-inicio.tsx), que reimplementavam
 * a mesma tradução com nomes diferentes.
 *
 * O label vem do próprio catálogo acima, não de uma cópia: renomear "Pendente"
 * lá muda o badge junto.
 */
const VARIANTE_SOLICITACAO: Record<(typeof STATUS_SOLICITACAO)[number]["value"], BadgeVariant> = {
  PENDENTE: "secondary",
  APROVADA: "default",
  REPROVADA: "destructive",
  CANCELADA: "destructive",
};

export const STATUS_SOLICITACAO_BADGE = Object.fromEntries(
  STATUS_SOLICITACAO.map((s) => [s.value, { label: s.label, variant: VARIANTE_SOLICITACAO[s.value] }]),
) as StatusBadgeMap<(typeof STATUS_SOLICITACAO)[number]["value"]>;

export const MOTIVOS_DESLIGAMENTO = [
  { value: "PEDIDO_DEMISSAO", label: "Pedido de demissão" },
  { value: "SEM_JUSTA_CAUSA", label: "Dispensa sem justa causa" },
  { value: "JUSTA_CAUSA", label: "Dispensa por justa causa" },
  { value: "FIM_CONTRATO", label: "Fim de contrato" },
  { value: "ACORDO", label: "Acordo (art. 484-A)" },
  { value: "APOSENTADORIA", label: "Aposentadoria" },
  { value: "FALECIMENTO", label: "Falecimento" },
  { value: "ABANDONO", label: "Abandono de emprego" },
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

/**
 * Primeira data de desligamento cujo offboarding é COBRADO como pendência
 * (checklist de saída, entrevista, item em aberto).
 *
 * Decisão do CEO em 20/08/2026: desligamento até 15/08/2026 (inclusive) é
 * anterior ao início do uso do sistema de RH — a base veio de importação, e
 * cobrar checklist e entrevista de quem saiu antes de o processo existir
 * enchia a tela de Pendências com 80+ itens que ninguém tem como fechar
 * (era exatamente o número que motivou a decisão). De 16/08/2026 em diante,
 * a saída acontece já dentro do sistema e o offboarding é cobrado normal.
 *
 * O corte NÃO apaga nada: o desligamento antigo continua na tela de
 * Desligamentos e na ficha, com o estado real do checklist — só deixa de
 * somar nos contadores de pendência e no e-mail diário. A dispensa individual
 * (`checklistDispensado`, botão na ficha) continua valendo para os dois lados:
 * dispensar um caso novo e reverter a dispensa de um antigo que o RH decida
 * cobrar mesmo assim.
 *
 * Vale nos DOIS lugares que contam a mesma coisa — lib/pendencias.ts e o
 * resumo da tela /desligamentos — para o cartão e a tela nunca divergirem.
 */
export const PRIMEIRO_DESLIGAMENTO_COBRADO = new Date(Date.UTC(2026, 7, 16));
