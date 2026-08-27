// As regras de contrato que o módulo precisa saber de cor — mesmo padrão de
// lib/processos/ctb.ts: cada constante carrega o artigo que a sustenta, e
// VALOR de nada mora aqui. Preço regulado (compartilhamento de poste) muda
// por norma; um número fixo no código envelhece sozinho e ninguém percebe.

import { somarDiasUTC, somarMesesUTC } from "@/lib/datas";

/**
 * Periodicidade mínima de reajuste — Lei 10.192/2001, art. 2º, §1º.
 *
 * Cláusula de reajuste com intervalo menor que este é NULA DE PLENO DIREITO.
 * O §3º alcança artifício de efeito equivalente (reajustes fracionados que
 * somados batem o mesmo resultado antes do prazo) — por isso a validação é
 * sobre o CAMPO periodicidadeReajusteMeses, não sobre "quantas vezes já
 * reajustou este ano": um contrato pode simplesmente não ter reajuste
 * configurado (SEM_REAJUSTE), e aí a regra nem se aplica.
 */
export const MESES_MINIMOS_ENTRE_REAJUSTES = 12;

/**
 * A janela da ação renovatória de locação NÃO RESIDENCIAL — Lei 8.245/1991,
 * art. 51, §5º.
 *
 * Abre 12 meses antes do fim do contrato e fecha 6 meses antes — quem perder
 * essa janela perde o DIREITO à renovatória por decadência: o prazo não se
 * suspende nem se interrompe por nenhum motivo (férias, negociação em curso,
 * o que for). Só vale para locação NÃO residencial (`locacaoNaoResidencial`);
 * aplicar a um contrato que não é locação é o tipo de alerta que nunca
 * deveria ter disparado.
 */
export const MESES_JANELA_RENOVATORIA_INICIO = 12;
export const MESES_JANELA_RENOVATORIA_FIM = 6;

/**
 * A data-limite para comunicar que o contrato NÃO será renovado.
 *
 * Só existe quando há aviso prévio configurado — contrato sem
 * `avisoPrevioNaoRenovacaoDias` não tem essa data, e "sem prazo" não é o
 * mesmo que "prazo zero": um `?? 0` aqui inventaria uma data-limite no
 * próprio dia do fim do contrato para todo contrato que não tem essa
 * cláusula, o que é uma mentira, não um padrão seguro.
 *
 * E a data tem que cair DENTRO da vigência. Aviso prévio maior que a duração
 * do contrato (210 dias num contrato de 6 meses) produzia uma data-limite
 * ANTERIOR ao próprio início — e a pendência nascia vencida e crítica no dia
 * do cadastro, cobrando uma decisão que era impossível tomar a tempo. Alerta
 * que nasce impossível é como a Central ensina a ser ignorada.
 */
export function dataLimiteDenuncia(
  dataFim: Date | null,
  avisoPrevioDias: number | null,
  dataInicio: Date | null = null,
): Date | null {
  if (!dataFim || !avisoPrevioDias) return null;
  const limite = somarDiasUTC(dataFim, -avisoPrevioDias);
  if (dataInicio && limite < dataInicio) return null;
  return limite;
}

/**
 * A janela da ação renovatória — null se não for locação não residencial, ou
 * se o contrato for curto demais para ter uma.
 *
 * O corte por duração não é detalhe: a janela é contada para TRÁS a partir do
 * fim, então numa locação de 6 meses ela abria seis meses ANTES de o contrato
 * existir e fechava no próprio dia de início — a pendência nascia vencida,
 * crítica e impossível, no dia do cadastro.
 *
 * O corte também é o que a lei diz. A renovatória compulsória exige contrato
 * escrito e por prazo determinado de no mínimo cinco anos (Lei 8.245/1991,
 * art. 51, II) — somando contratos sucessivos, soma que este módulo ainda não
 * faz. Exigir aqui que a janela INTEIRA caiba dentro da vigência é o piso
 * mínimo honesto: não afirma que o direito existe, apenas se recusa a
 * inventar uma janela que o calendário do próprio contrato desmente.
 */
export function janelaRenovatoria(
  dataFim: Date | null,
  locacaoNaoResidencial: boolean,
  dataInicio: Date | null = null,
): { inicio: Date; fim: Date } | null {
  if (!dataFim || !locacaoNaoResidencial) return null;
  const inicio = somarMesesUTC(dataFim, -MESES_JANELA_RENOVATORIA_INICIO);
  const fim = somarMesesUTC(dataFim, -MESES_JANELA_RENOVATORIA_FIM);
  if (dataInicio && inicio < dataInicio) return null;
  return { inicio, fim };
}

/**
 * O próximo reajuste, a partir do mês-base e da periodicidade.
 *
 * Sempre no FUTURO em relação a `hoje`, e ancorado em `dataInicio` — não no
 * ano corrente. Para periodicidade anual as duas âncoras dão no mesmo lugar
 * (todo ano tem uma ocorrência do mês-base), mas para bienal, trienal etc.
 * elas divergem: um "mês de 1 a 12" sozinho não diz a que ANO o ciclo
 * pertence. Ancorar em "o ano em que rodou a função" faria a data do próximo
 * reajuste de um contrato bienal MUDAR conforme o dia em que alguém abriu a
 * tela — o mesmo contrato, a mesma pergunta, respostas diferentes. Ancorado
 * em `dataInicio`, o ciclo é uma propriedade do CONTRATO, não do relógio.
 */
export function proximoReajuste(
  dataInicio: Date | null,
  mesBase: number | null,
  periodicidadeMeses: number | null,
  hoje: Date,
  /** Quando o último reajuste foi APLICADO — os ciclos até ele já se foram. */
  ultimoReajusteEm: Date | null = null,
): Date | null {
  if (!dataInicio || !mesBase || !periodicidadeMeses || periodicidadeMeses < MESES_MINIMOS_ENTRE_REAJUSTES) {
    return null;
  }

  // O PRIMEIRO reajuste é o mês-base que cai em ou depois de uma periodicidade
  // inteira contada do início. Sem esse piso, um contrato que começa em junho
  // com mês-base setembro reajustava em TRÊS meses — a cláusula nula de pleno
  // direito que a própria action recusa na entrada (Lei 10.192/2001, art. 2º,
  // §1º). O mês-base diz o MÊS do ciclo; não autoriza encurtá-lo.
  const piso = somarMesesUTC(dataInicio, periodicidadeMeses);
  let candidato = new Date(Date.UTC(piso.getUTCFullYear(), mesBase - 1, 1));
  if (candidato < piso) candidato = new Date(Date.UTC(piso.getUTCFullYear() + 1, mesBase - 1, 1));

  // Os ciclos já reajustados saem da fila. Note que a conta anda em passos de
  // `periodicidadeMeses` a partir do PRIMEIRO ciclo, e não a partir da data de
  // aplicação: um reajuste aplicado com cinco dias de atraso pertence ao ciclo
  // que venceu, não abre um ciclo novo — ancorar na data de aplicação pulava
  // um ano inteiro a cada atraso.
  if (ultimoReajusteEm) {
    while (candidato <= ultimoReajusteEm) candidato = somarMesesUTC(candidato, periodicidadeMeses);
  }
  // E o resultado está sempre no futuro em relação a hoje.
  while (candidato <= hoje) candidato = somarMesesUTC(candidato, periodicidadeMeses);
  return candidato;
}

export const TIPOS_CONTRATO = [
  // "Locação de imóvel" é o tipo do ALUGUEL A RECEBER (imóvel do grupo
  // alugado a terceiro) — cadastrado na tela de Aluguéis, não na de Contratos.
  { value: "LOCACAO_IMOVEL", label: "Locação de imóvel (receita)" },
  { value: "LOCACAO_TORRE", label: "Locação de torre" },
  { value: "LOCACAO_TERRENO", label: "Locação de terreno" },
  { value: "COMPARTILHAMENTO_POSTE", label: "Compartilhamento de poste" },
  { value: "PREFEITURA_USO_SOLO", label: "Prefeitura — uso do solo" },
  { value: "CONDOMINIO", label: "Condomínio" },
  { value: "FORNECEDOR", label: "Fornecedor" },
  { value: "PRESTADOR_PJ", label: "Prestador PJ" },
  { value: "CLIENTE_B2B", label: "Cliente B2B" },
  { value: "OUTRO", label: "Outro" },
] as const;

export const CATEGORIAS_CONTRATO = [
  { value: "DESPESA", label: "Despesa" },
  { value: "RECEITA", label: "Receita" },
  { value: "SEM_VALOR", label: "Sem valor (comodato, cessão)" },
] as const;

export const STATUS_CONTRATO = [
  { value: "RASCUNHO", label: "Rascunho" },
  { value: "VIGENTE", label: "Vigente" },
  { value: "SUSPENSO", label: "Suspenso" },
  { value: "EM_RENOVACAO", label: "Em renovação" },
  { value: "ENCERRADO", label: "Encerrado" },
  { value: "CANCELADO", label: "Cancelado" },
] as const;

export const INDICES_REAJUSTE = [
  { value: "IPCA", label: "IPCA" },
  { value: "IPCA_E", label: "IPCA-E" },
  { value: "IGPM", label: "IGP-M" },
  { value: "IGPDI", label: "IGP-DI" },
  { value: "INPC", label: "INPC" },
  { value: "CONTRATUAL", label: "Índice contratual próprio" },
  { value: "SEM_REAJUSTE", label: "Sem reajuste" },
] as const;

export const TIPOS_PESSOA = [
  { value: "JURIDICA", label: "Pessoa jurídica" },
  { value: "FISICA", label: "Pessoa física" },
] as const;

export const PAPEIS_CONTRAPARTE = [
  { value: "FORNECEDOR", label: "Fornecedor" },
  { value: "CLIENTE", label: "Cliente" },
  { value: "LOCADOR", label: "Locador" },
  { value: "LOCATARIO", label: "Locatário" },
  { value: "PREFEITURA", label: "Prefeitura" },
  { value: "CONDOMINIO", label: "Condomínio" },
  { value: "PRESTADOR_PJ", label: "Prestador PJ" },
  { value: "CONCESSIONARIA", label: "Concessionária" },
  { value: "OUTRO", label: "Outro" },
] as const;

export function rotulo(lista: readonly { value: string; label: string }[], valor: string | null | undefined): string {
  if (!valor) return "—";
  return lista.find((i) => i.value === valor)?.label ?? valor;
}

/** "FORNECEDOR,PRESTADOR_PJ" → ["FORNECEDOR", "PRESTADOR_PJ"]. */
export function papeisDaContraparte(csv: string): string[] {
  return csv.split(",").map((p) => p.trim()).filter(Boolean);
}
