// As regras do Código de Trânsito Brasileiro que o módulo precisa saber de cor.
//
// Vive num arquivo só, e não espalhado pelas telas, porque é o tipo de regra
// que erra CALADO: um prazo somado errado não dá erro em lugar nenhum, só
// aparece meses depois na forma de uma multa que triplicou. Cada constante aqui
// carrega o artigo que a sustenta — quem for mexer confere na fonte antes.
//
// O que NÃO mora aqui, de propósito: VALOR de multa. Valores são reajustados e
// há infrações com fator multiplicador; um número fixo no código envelhece
// sozinho e ninguém percebe. O valor vem do auto de infração, digitado.

import { somarDiasUTC } from "@/lib/datas";

/**
 * Prazo para a empresa indicar quem estava dirigindo — CTB, art. 257, §7º.
 *
 * É o prazo mais caro do módulo inteiro. Não indicar não "perde o desconto":
 * gera uma multa NOVA no valor do DOBRO da original, que se soma a ela
 * (art. 257, §8º). A conta final é 3× — e acontece em toda multa não tratada.
 */
export const DIAS_INDICACAO_CONDUTOR = 30;

/**
 * A ficção do SNE — CTB, art. 282-A, §2º.
 *
 * No Sistema de Notificação Eletrônica o proprietário é considerado notificado
 * 30 dias depois da INCLUSÃO da notificação no sistema. Não é a data do e-mail,
 * não é a data em que alguém leu. Contar do e-mail encurta o prazo real e faz o
 * sistema alarmar antes da hora; contar da leitura o alonga, e aí perde o prazo.
 */
export const DIAS_NOTIFICACAO_FICTA_SNE = 30;

/** Novo CRV depois de comprar — CTB, art. 123, §1º. */
export const DIAS_NOVO_CRV = 30;

/**
 * Comunicação de venda — CTB, art. 134.
 *
 * A janela é composta e quase todo mundo erra: são 60 dias contados do FIM dos
 * 30 dias que o comprador tem. Ou seja, do 30º ao 90º dia depois do negócio.
 * Somar 60 direto da venda encerra o prazo um mês antes do que a lei manda.
 *
 * Não comunicar deixa o vendedor SOLIDARIAMENTE responsável pelas penalidades
 * até a data da comunicação — é assim que chega multa de carro vendido há dois
 * anos, e é uma das poucas coisas neste módulo que ainda cobra dinheiro de
 * veículo que a empresa nem tem mais.
 */
export const DIAS_COMUNICACAO_VENDA = DIAS_NOVO_CRV + 60;

/**
 * Infrações que NÃO pontuam, por exclusão expressa do art. 259, §4º, II.
 *
 * Existe porque a tentação é derivar ponto da gravidade — "gravíssima são 7
 * pontos" — e isso está errado para estes sete dispositivos. O art. 233, por
 * exemplo, é infração MÉDIA, com remoção do veículo, e SEM pontuação: um motor
 * que deriva da natureza lançaria 4 pontos na CNH de alguém que não os tem.
 *
 * O dano de errar aqui não é contábil, é humano: o sistema acusaria um
 * colaborador de estar perto da suspensão sem estar.
 */
export const ARTIGOS_SEM_PONTUACAO = ["221", "230-VII", "230-XXI", "232", "233", "233-A", "240", "241"];

/** Pontos por natureza — só vale quando a infração de fato pontua. */
export const PONTOS_POR_NATUREZA: Record<string, number> = {
  LEVE: 3,
  MEDIA: 4,
  GRAVE: 5,
  GRAVISSIMA: 7,
};

/**
 * Limite de pontos que suspende o direito de dirigir — CTB, art. 261.
 *
 * Quem exerce atividade remunerada (EAR) tem limite fixo de 40, independente da
 * natureza das infrações (§5º). Quem não tem EAR varia conforme quantas
 * gravíssimas acumulou em 12 meses: 20 com duas ou mais, 30 com uma, 40 com
 * nenhuma. O limite não é uma constante — é uma conta, e é por isso que esta é
 * função e não número.
 */
export function limiteDePontos(possuiEAR: boolean, gravissimasEm12Meses: number): number {
  if (possuiEAR) return 40;
  if (gravissimasEm12Meses >= 2) return 20;
  if (gravissimasEm12Meses === 1) return 30;
  return 40;
}

/**
 * A partir de quantos pontos o condutor com EAR pode fazer o curso preventivo
 * de reciclagem, que ZERA a contagem — CTB, art. 261, §§5º a 7º.
 *
 * É a única saída antes da suspensão, e é a informação que o RH nunca tem na
 * hora certa: aos 30 dá tempo, aos 40 não dá mais. Há bloqueio de 12 meses
 * entre um curso e outro, por isso a data do último importa.
 */
export const PONTOS_PARA_CURSO_PREVENTIVO = 30;
export const MESES_BLOQUEIO_ENTRE_CURSOS = 12;

/**
 * Status processuais da multa. Só um deles trava o licenciamento.
 *
 * A multa NÃO impede licenciar enquanto o recurso está de pé: o art. 284, §3º
 * condiciona a exigência ao encerramento da instância administrativa. Sistemas
 * que travam desde a autuação cobram o que ainda não é devido — e fazem a
 * empresa pagar multa que ela ia derrubar no recurso.
 */
export const STATUS_PROCESSUAL = [
  { value: "AUTUADA", label: "Autuada" },
  { value: "EM_DEFESA", label: "Em defesa prévia" },
  { value: "PENALIZADA", label: "Penalidade aplicada" },
  { value: "RECURSO_JARI", label: "Recurso na JARI" },
  { value: "RECURSO_CETRAN", label: "Recurso no CETRAN" },
  { value: "INSTANCIA_ENCERRADA", label: "Instância encerrada" },
  { value: "ARQUIVADA", label: "Arquivada" },
  { value: "PAGA", label: "Paga" },
  { value: "CANCELADA", label: "Cancelada" },
] as const;

export function travaLicenciamento(statusProcessual: string): boolean {
  return statusProcessual === "INSTANCIA_ENCERRADA";
}

export const STATUS_INDICACAO = [
  { value: "PENDENTE", label: "A indicar" },
  { value: "INDICADO", label: "Indicado" },
  { value: "ACEITA", label: "Indicação aceita" },
  { value: "RECUSADA", label: "Indicação recusada" },
  { value: "PERDIDO", label: "Prazo perdido" },
] as const;

export const NATUREZAS = [
  { value: "LEVE", label: "Leve" },
  { value: "MEDIA", label: "Média" },
  { value: "GRAVE", label: "Grave" },
  { value: "GRAVISSIMA", label: "Gravíssima" },
] as const;

export const TIPOS_DOCUMENTO_VEICULO = [
  { value: "CRLV", label: "CRLV-e" },
  { value: "LICENCIAMENTO", label: "Licenciamento anual" },
  { value: "IPVA", label: "IPVA" },
  { value: "SEGURO_CASCO", label: "Seguro — casco" },
  { value: "SEGURO_RCFV", label: "Seguro — RCF-V (danos a terceiros)" },
  { value: "VISTORIA", label: "Vistoria" },
  { value: "CRONOTACOGRAFO", label: "Aferição do cronotacógrafo" },
  { value: "ATPV", label: "ATPV-e" },
  { value: "NOTA_FISCAL", label: "Nota fiscal" },
  { value: "CONTRATO_LOCACAO", label: "Contrato de locação" },
  { value: "OUTRO", label: "Outro" },
] as const;
// Não existe DPVAT nem SPVAT nesta lista, e não é esquecimento: os dois foram
// revogados e não há seguro obrigatório público sendo cobrado. Um tipo aqui
// viraria alerta que nunca resolve — e falso positivo eterno faz o time parar
// de confiar na lista inteira, não só naquele item.

export const MOTORIZACAO_VEICULO = [
  { value: "COMBUSTAO", label: "Combustão" },
  { value: "ELETRICO", label: "Elétrico" },
  { value: "HIBRIDO", label: "Híbrido" },
] as const;

export const COMBUSTIVEIS = [
  { value: "GASOLINA", label: "Gasolina" },
  { value: "ETANOL", label: "Etanol" },
  { value: "DIESEL", label: "Diesel" },
  { value: "GNV", label: "GNV" },
  { value: "ELETRICIDADE", label: "Eletricidade (kWh)" },
] as const;

export const TIPOS_MANUTENCAO = [
  { value: "PREVENTIVA", label: "Preventiva" },
  { value: "REVISAO", label: "Revisão programada" },
  { value: "CORRETIVA", label: "Corretiva (quebrou)" },
  { value: "PNEUS", label: "Pneus" },
  { value: "SINISTRO", label: "Sinistro / funilaria" },
  { value: "OUTRA", label: "Outra" },
] as const;

export const PROPRIEDADE_VEICULO = [
  { value: "PROPRIO", label: "Próprio" },
  { value: "ALUGADO", label: "Alugado" },
  { value: "COMODATO", label: "Comodato" },
  { value: "LEASING", label: "Leasing" },
] as const;

export const SITUACAO_VEICULO = [
  { value: "ATIVO", label: "Ativo" },
  { value: "EM_MANUTENCAO", label: "Em manutenção" },
  { value: "VENDIDO", label: "Vendido" },
  { value: "BAIXADO", label: "Baixado" },
] as const;

export function rotulo(lista: readonly { value: string; label: string }[], valor: string | null | undefined): string {
  if (!valor) return "—";
  return lista.find((i) => i.value === valor)?.label ?? valor;
}

/**
 * Placa em MAIÚSCULAS e sem separador — "abc-1234" e "abc1d23" viram
 * "ABC1234" e "ABC1D23". Mesma regra do CNPJ da Empresa: o banco guarda só o
 * conteúdo, a máscara é da tela. Sem isto a mesma placa entra duas vezes e o
 * `@unique` não impede nada.
 */
export function normalizarPlaca(bruto: string): string {
  return (bruto ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Placa antiga (ABC1234) ou Mercosul (ABC1D23) — as duas convivem na frota. */
export function placaValida(placa: string): boolean {
  return /^[A-Z]{3}\d{4}$/.test(placa) || /^[A-Z]{3}\d[A-Z]\d{2}$/.test(placa);
}

export function formatarPlaca(placa: string): string {
  if (placa.length !== 7) return placa;
  return `${placa.slice(0, 3)}-${placa.slice(3)}`;
}

/**
 * A data em que a notificação passa a valer, já com a ficção do SNE aplicada.
 *
 * Fora do SNE, vale a data de expedição informada no auto. Dentro do SNE, vale
 * a inclusão + 30 dias. É desta data que TODOS os outros prazos da multa
 * descem, e é por isso que ela é materializada: mudou a regra amanhã, os
 * alertas antigos continuam explicando por que dispararam quando dispararam.
 */
export function notificacaoFicta(dataExpedicao: Date, viaSne: boolean): Date {
  return viaSne ? somarDiasUTC(dataExpedicao, DIAS_NOTIFICACAO_FICTA_SNE) : dataExpedicao;
}

/** O relógio de 30 dias para indicar o condutor, a partir da notificação. */
export function prazoIndicacao(notificacao: Date): Date {
  return somarDiasUTC(notificacao, DIAS_INDICACAO_CONDUTOR);
}
