import { TITULO_MAXIMO } from "@/lib/delegacoes/estados";
import { formatarDataHoraBrasilia } from "@/lib/datas";

// REUNIÕES nas Delegações, em código PURO (sem banco, sem sessão) — mesma
// divisão de lib/delegacoes/estados.ts: aqui mora a decisão (o que uma
// reunião precisa para existir, como ela vira a demanda de cada convocado),
// na action mora a execução. scripts/test-delegacoes-reunioes.ts prova isto
// sem banco.
//
// O DESENHO (pedido da Direção em 31/08/2026): a reunião é o AGRUPADOR.
// Cada convocado recebe UMA demanda própria — a regra 1 (responsável único)
// fica intacta, e é de propósito que reunião NÃO é uma demanda com N
// responsáveis: esse caminho foi pedido e RETIRADO pelo próprio CEO em
// 29/08/2026 (reverteria as regras 1 e 3). Aceitar a demanda é confirmar
// presença; a régua de cobrança existente faz o lembrete; depois da reunião,
// quem convocou encerra cada demanda — aceitando a participação entregue ou
// dando a baixa direta de quem compareceu.

export type DadosReuniao = {
  titulo: string;
  /** Instante da reunião — já convertido (prazoDoFormulario), nunca texto. */
  dataHora: Date | null;
  /** Quantos convocados a tela mandou (a action valida cada um por si). */
  qtdConvocados: number;
};

export type VeredictoReuniao = { ok: true } | { ok: false; erro: string };

/**
 * O que uma reunião precisa para EXISTIR. Espelho de validarCriacao da
 * demanda: título dentro do limite, instante válido, pelo menos um convocado.
 * Reunião no passado é recusada — marcar reunião para ontem só gera demanda
 * já vencida e cobrança automática indevida no primeiro cron.
 */
export function validarReuniao(dados: DadosReuniao, agora: Date): VeredictoReuniao {
  const titulo = dados.titulo.trim();
  if (!titulo) return { ok: false, erro: "A reunião precisa de um assunto." };
  if (titulo.length > TITULO_MAXIMO) {
    return {
      ok: false,
      erro: `O assunto passa de ${TITULO_MAXIMO} caracteres (${titulo.length}).`,
    };
  }
  if (!dados.dataHora || Number.isNaN(dados.dataHora.getTime())) {
    return { ok: false, erro: "A reunião precisa de data e hora — nunca texto livre." };
  }
  if (dados.dataHora.getTime() <= agora.getTime()) {
    return { ok: false, erro: "A reunião precisa estar no futuro — essa data/hora já passou." };
  }
  if (dados.qtdConvocados < 1) {
    return { ok: false, erro: "Convoque pelo menos uma pessoa." };
  }
  return { ok: true };
}

/**
 * A demanda que CADA convocado recebe — os campos derivados da reunião, no
 * formato que criarDemanda espera. Uma função só, para as N demandas nascerem
 * idênticas (mesmo título, mesmo critério, mesmo prazo) e a tela de Reuniões
 * poder agrupá-las sem adivinhar.
 *
 * As escolhas, ditas:
 *  - prazo = o instante da reunião: atrasou, a cobrança dispara.
 *  - critério de aceite = comparecer; o ACEITE da demanda é a confirmação de
 *    presença (um clique no Telegram).
 *  - evidência TEXTO: o que a pessoa levou/decidiu — ou quem convocou dá a
 *    baixa direta em quem compareceu, sem burocracia de entrega.
 *  - retorno SO_ATRASO: reunião não precisa de reporte diário no digest; o
 *    lembrete de véspera já vem da régua normal de cobrança.
 */
export function demandaDaReuniao(reuniao: {
  titulo: string;
  pauta?: string | null;
  local?: string | null;
  dataHora: Date;
}): {
  titulo: string;
  descricao: string | null;
  criterioAceite: string;
  evidenciaExigida: "TEXTO";
  periodicidadeRetorno: "SO_ATRASO";
} {
  const prefixo = "Reunião: ";
  // O título da demanda respeita o limite da regra da demanda — o assunto é
  // truncado com reticências, nunca recusado (a validação do assunto em si já
  // aconteceu em validarReuniao, contra o limite do campo da reunião).
  const espaco = TITULO_MAXIMO - prefixo.length;
  const assunto = reuniao.titulo.trim();
  const titulo =
    prefixo + (assunto.length > espaco ? `${assunto.slice(0, espaco - 1)}…` : assunto);

  const quando = formatarDataHoraBrasilia(reuniao.dataHora);
  const partes = [
    `Reunião marcada para ${quando}${reuniao.local?.trim() ? `, em ${reuniao.local.trim()}` : ""}.`,
  ];
  if (reuniao.pauta?.trim()) partes.push(`Pauta: ${reuniao.pauta.trim()}`);

  return {
    titulo,
    descricao: partes.join("\n\n"),
    criterioAceite:
      `Comparecer à reunião de ${quando}. ` +
      "Aceitar esta demanda confirma a presença; depois da reunião, a participação " +
      "(o que você levou ou ficou de fazer) entra como entrega — ou quem convocou dá a baixa.",
    evidenciaExigida: "TEXTO",
    periodicidadeRetorno: "SO_ATRASO",
  };
}
