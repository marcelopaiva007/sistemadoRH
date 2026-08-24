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
 */
export function dataLimiteDenuncia(dataFim: Date | null, avisoPrevioDias: number | null): Date | null {
  if (!dataFim || !avisoPrevioDias) return null;
  return somarDiasUTC(dataFim, -avisoPrevioDias);
}

/** A janela da ação renovatória — null se não for locação não residencial. */
export function janelaRenovatoria(
  dataFim: Date | null,
  locacaoNaoResidencial: boolean,
): { inicio: Date; fim: Date } | null {
  if (!dataFim || !locacaoNaoResidencial) return null;
  return {
    inicio: somarMesesUTC(dataFim, -MESES_JANELA_RENOVATORIA_INICIO),
    fim: somarMesesUTC(dataFim, -MESES_JANELA_RENOVATORIA_FIM),
  };
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
): Date | null {
  if (!dataInicio || !mesBase || !periodicidadeMeses || periodicidadeMeses < MESES_MINIMOS_ENTRE_REAJUSTES) {
    return null;
  }
  // A primeira ocorrência do mês-base a partir do início do contrato — se o
  // mês-base já tinha passado no ano de início, o ciclo começa no ano
  // seguinte.
  let candidato = new Date(Date.UTC(dataInicio.getUTCFullYear(), mesBase - 1, 1));
  if (candidato < dataInicio) candidato = somarMesesUTC(candidato, periodicidadeMeses);
  // Anda em passos de `periodicidadeMeses` até ultrapassar hoje.
  while (candidato <= hoje) candidato = somarMesesUTC(candidato, periodicidadeMeses);
  return candidato;
}

export const TIPOS_CONTRATO = [
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
