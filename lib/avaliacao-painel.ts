// Cálculo puro do Painel de Avaliação — visão consolidada para RH/Diretoria,
// cruzando os ciclos de uma CAMPANHA (mesmo nome de ciclo, um por CNPJ; ver
// lib/actions/rh-avaliacao.ts) em todas as empresas que o usuário enxerga.
//
// Sem I/O de propósito: recebe as linhas já buscadas pela página (server) e
// devolve dados prontos para a tela e para o relatório em PDF, os dois
// consumindo o mesmo cálculo — o mesmo desenho de lib/clima.ts.
import { faixaDesempenho } from "@/lib/constants-avaliacao";

export type AvaliacaoPainelInput = {
  empresaId: string;
  tipoAvaliador: string;
  status: string;
  notaFinal: number | null;
  colaborador: { id: string; nome: string; setor: { nome: string } };
};

export type ParticipacaoLinha = {
  chave: string;
  total: number;
  concluidas: number;
  participacaoPct: number;
};

export type DestaqueColaborador = {
  colaboradorId: string;
  nome: string;
  empresaNome: string;
  setor: string;
  notaFinal: number;
};

export type PainelAvaliacao = {
  totalAvaliacoes: number;
  totalConcluidas: number;
  participacaoPct: number;
  porEmpresa: ParticipacaoLinha[];
  porSetor: ParticipacaoLinha[];
  // Só sobre avaliações tipo GESTOR concluídas — é a fonte "oficial" de nota,
  // a mesma que já alimenta o nine-box por ciclo (ciclo-detalhe.tsx). Somar
  // AUTOAVALIACAO ao mesmo balde inflaria a distribuição: quem se avalia
  // tende a notas mais altas que o gestor dá.
  distribuicaoNotas: { faixa: "BAIXO" | "MEDIO" | "ALTO"; label: string; qtd: number }[];
  mediaGeral: number | null;
  desvioPadrao: number | null;
  amostraNotas: number;
  destaques: {
    abaixoDaMedia: DestaqueColaborador[];
    acimaDaMedia: DestaqueColaborador[];
  };
};

const LABEL_FAIXA: Record<"BAIXO" | "MEDIO" | "ALTO", string> = {
  BAIXO: "Baixo (< 2,5)",
  MEDIO: "Médio (2,5 a 3,74)",
  ALTO: "Alto (≥ 3,75)",
};

function participacao(total: number, concluidas: number): number {
  return total > 0 ? Math.round((concluidas / total) * 100) : 0;
}

function agregarPor<T>(
  itens: AvaliacaoPainelInput[],
  chaveDe: (a: AvaliacaoPainelInput) => T,
  rotuloDe: (chave: T) => string,
): ParticipacaoLinha[] {
  const porChave = new Map<T, { total: number; concluidas: number }>();
  for (const a of itens) {
    const chave = chaveDe(a);
    const atual = porChave.get(chave) ?? { total: 0, concluidas: 0 };
    atual.total += 1;
    if (a.status === "CONCLUIDA") atual.concluidas += 1;
    porChave.set(chave, atual);
  }
  return [...porChave.entries()]
    .map(([chave, v]) => ({
      chave: rotuloDe(chave),
      total: v.total,
      concluidas: v.concluidas,
      participacaoPct: participacao(v.total, v.concluidas),
    }))
    .sort((a, b) => a.participacaoPct - b.participacaoPct || b.total - a.total);
}

export function calcularPainelAvaliacao(
  avaliacoes: AvaliacaoPainelInput[],
  empresaNomeDe: (empresaId: string) => string,
): PainelAvaliacao {
  const totalAvaliacoes = avaliacoes.length;
  const totalConcluidas = avaliacoes.filter((a) => a.status === "CONCLUIDA").length;

  const porEmpresa = agregarPor(avaliacoes, (a) => a.empresaId, empresaNomeDe);
  const porSetor = agregarPor(
    avaliacoes,
    (a) => a.colaborador.setor.nome,
    (nome) => nome,
  );

  // Fonte oficial de nota: GESTOR, concluída, com nota gravada. Uma pessoa
  // pode aparecer mais de uma vez aqui só se tiver mais de um GESTOR no
  // mesmo ciclo (não deveria acontecer — @@unique é por avaliador — mas o
  // filtro não presume isso).
  const notasOficiais = avaliacoes.filter(
    (a) => a.tipoAvaliador === "GESTOR" && a.status === "CONCLUIDA" && a.notaFinal !== null,
  ) as (AvaliacaoPainelInput & { notaFinal: number })[];

  const distribuicaoNotas: PainelAvaliacao["distribuicaoNotas"] = (["BAIXO", "MEDIO", "ALTO"] as const).map(
    (faixa) => ({
      faixa,
      label: LABEL_FAIXA[faixa],
      qtd: notasOficiais.filter((a) => faixaDesempenho(a.notaFinal) === faixa).length,
    }),
  );

  let mediaGeral: number | null = null;
  let desvioPadrao: number | null = null;
  const destaques: PainelAvaliacao["destaques"] = { abaixoDaMedia: [], acimaDaMedia: [] };

  // Desvio padrão só faz sentido com uma amostra mínima — com 1 ou 2 pessoas
  // qualquer nota "é" a média, e chamar isso de "destaque" engana mais do
  // que ajuda. Mesmo piso que AMOSTRA_MINIMA_ANONIMATO usa em outros painéis
  // do sistema, embora aqui o motivo seja estatístico, não de anonimato.
  if (notasOficiais.length >= 3) {
    const soma = notasOficiais.reduce((s, a) => s + a.notaFinal, 0);
    const media = soma / notasOficiais.length;
    const variancia =
      notasOficiais.reduce((s, a) => s + (a.notaFinal - media) ** 2, 0) / notasOficiais.length;
    const desvio = Math.sqrt(variancia);
    mediaGeral = media;
    desvioPadrao = desvio;

    if (desvio > 0) {
      const paraDestaque = (a: (typeof notasOficiais)[number]): DestaqueColaborador => ({
        colaboradorId: a.colaborador.id,
        nome: a.colaborador.nome,
        empresaNome: empresaNomeDe(a.empresaId),
        setor: a.colaborador.setor.nome,
        notaFinal: a.notaFinal,
      });

      destaques.abaixoDaMedia = notasOficiais
        .filter((a) => a.notaFinal < media - desvio)
        .map(paraDestaque)
        .sort((a, b) => a.notaFinal - b.notaFinal);

      destaques.acimaDaMedia = notasOficiais
        .filter((a) => a.notaFinal > media + desvio)
        .map(paraDestaque)
        .sort((a, b) => b.notaFinal - a.notaFinal);
    }
  }

  return {
    totalAvaliacoes,
    totalConcluidas,
    participacaoPct: participacao(totalAvaliacoes, totalConcluidas),
    porEmpresa,
    porSetor,
    distribuicaoNotas,
    mediaGeral,
    desvioPadrao,
    amostraNotas: notasOficiais.length,
    destaques,
  };
}
