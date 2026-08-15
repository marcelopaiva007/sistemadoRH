import type { StatusBadgeMap } from "@/components/status-badge";

// Coisas que a empresa entrega ao colaborador e quer confirmação de quem
// recebeu — ver model EntregaAoColaborador no schema.prisma.
//
// LISTA ADITIVA, não fechada: entra no catálogo por empresa
// (CatalogoItem, categoria TIPO_ENTREGA), então o RH cadastra "chip de
// celular" ou "cadeira ergonômica" sem precisar de deploy. Estes são só os
// padrões que já vêm prontos.
//
// Pode ser aditiva porque nenhum código compara o valor exato para decidir
// comportamento — é rótulo puro, o critério que o comentário do CatalogoItem
// usa para separar o que é seguro configurar do que não é.
export const TIPOS_ENTREGA = [
  { value: "CARTAO_BENEFICIOS", label: "Cartão de benefícios" },
  { value: "NOTEBOOK", label: "Notebook" },
  { value: "UNIFORME", label: "Uniforme" },
  { value: "CRACHA", label: "Crachá" },
  { value: "CELULAR", label: "Celular / chip" },
  { value: "FERRAMENTA", label: "Ferramenta de trabalho" },
  { value: "OUTRO", label: "Outro" },
] as const;

export const tipoEntregaLabel = (v: string) =>
  TIPOS_ENTREGA.find((t) => t.value === v)?.label ?? v;

/**
 * O que a pessoa tem HOJE: entregue e ainda não devolvido.
 *
 * Cartão e uniforme nunca voltam, então `devolvidoEm` fica nulo para sempre
 * neles — o que torna "não devolvido" o estado normal, e não uma pendência.
 * Quem separa um caso do outro é o tipo, na leitura de quem olha, não uma
 * regra aqui: marcar uniforme como "a devolver" encheria o desligamento de
 * cobrança que ninguém vai fazer.
 */
export function estaEmPoderDoColaborador(entrega: { devolvidoEm: Date | null }): boolean {
  return entrega.devolvidoEm === null;
}

/**
 * Falta a pessoa confirmar que recebeu?
 *
 * Item já devolvido não é cobrado: cobrar confirmação de recebimento de um
 * notebook que já voltou é pedir para a pessoa assinar o passado. O que
 * interessa é o que está com ela agora e ela nunca confirmou.
 */
export function aguardandoConfirmacao(entrega: {
  confirmadoEm: Date | null;
  devolvidoEm: Date | null;
}): boolean {
  return entrega.confirmadoEm === null && entrega.devolvidoEm === null;
}

export type SituacaoEntrega = "AGUARDANDO" | "CONFIRMADA" | "DEVOLVIDA";

/**
 * Uma entrega só pode estar em UM destes três estados na tela.
 *
 * A ordem importa: devolvido ganha de confirmado. Um notebook que a pessoa
 * confirmou ter recebido e depois devolveu não é "confirmado" — está fora das
 * mãos dela, e é isso que quem abre a tela precisa ler. Manter os dois selos
 * ao mesmo tempo faria a coluna "quem tem o quê" mentir no desligamento, que
 * é justamente quando ela é usada.
 */
export function situacaoDaEntrega(entrega: {
  confirmadoEm: Date | null;
  devolvidoEm: Date | null;
}): SituacaoEntrega {
  if (entrega.devolvidoEm) return "DEVOLVIDA";
  if (entrega.confirmadoEm) return "CONFIRMADA";
  return "AGUARDANDO";
}

/**
 * O texto que chega no Telegram da pessoa na hora do registro.
 *
 * Vive aqui (e não no arquivo "use server" que o envia) por dois motivos: todo
 * export de arquivo "use server" precisa ser função async, e o teste precisa
 * ler o contrato desta mensagem — o /portal tem que estar nela (é o único
 * caminho até o botão "Recebi"), e a ressalva "ainda não recebeu? fale com o
 * RH" também: sem ela a mensagem vira ordem de confirmar, e confirmação sob
 * ordem não prova nada.
 */
export function mensagemDeEntrega(nome: string, tipo: string, descricao: string | null): string {
  const primeiro = nome.split(" ")[0];
  const item = `${tipoEntregaLabel(tipo)}${descricao ? ` — ${descricao}` : ""}`;
  return (
    `Oi, ${primeiro}! 👋\n\n` +
    `O RH registrou uma entrega em seu nome:\n\n• ${item}\n\n` +
    `Se o item já está com você, envie /portal aqui neste chat e toque em ` +
    `"Recebi" no aviso do topo — essa é a sua confirmação de recebimento.\n\n` +
    `Ainda não recebeu? Fale com o RH antes de confirmar.`
  );
}

export const SITUACAO_ENTREGA_BADGE: StatusBadgeMap<SituacaoEntrega> = {
  // `destructive` de propósito: falta de confirmação não é neutra. É o cartão
  // onde cai comissão sem ninguém ter dito que recebeu — o vermelho é o que
  // faz a linha ser cobrada em vez de rolar junto com as outras.
  AGUARDANDO: { label: "Aguardando confirmação", variant: "destructive" },
  CONFIRMADA: { label: "Confirmada pelo colaborador", variant: "default" },
  DEVOLVIDA: { label: "Devolvida", variant: "secondary" },
};
