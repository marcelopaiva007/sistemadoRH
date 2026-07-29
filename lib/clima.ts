// Lógica de cálculo para pesquisas de Clima Organizacional (GPTW).
// Scores por dimensão (0-100), NPS, e comparativo histórico.

import { DIMENSOES_GPTW } from "@/lib/constants-rh";
import { AMOSTRA_MINIMA_ANONIMATO } from "@/lib/constants-rh";

export type DimensaoGPTW = "CREDIBILIDADE" | "RESPEITO" | "IMPARCIALIDADE" | "ORGULHO" | "CAMARADAGEM" | "GERAL";

export type ResultadoClima = {
  totalRespostas: number;
  mediaPorDimensao: ResultadoDimensao[];
  scoreGeral: number;
  nps: ResultadoNPS | null;
  porSetor: ResultadoSetor[];
  mostraAmostraInsuficiente: boolean;
};

export type ResultadoDimensao = {
  dimensao: DimensaoGPTW;
  label: string;
  media: number;       // 0-5 (escala Likert)
  media100: number;     // 0-100
  respostas: number;
};

export type ResultadoNPS = {
  promotores: number;   // 9-10
  detratores: number;   // 0-6
  neutros: number;      // 7-8
  total: number;
  score: number;        // -100 a +100
};

export type ResultadoSetor = {
  setor: string;
  media: number;        // 0-5
  media100: number;     // 0-100
  respostas: number;
  amostraInsuficiente: boolean;
};

export type ResultadoComparativo = {
  atual: ResultadoClima;
  anterior: ResultadoClima | null;
  variacao: {
    dimensao: DimensaoGPTW;
    anterior: number;
    atual: number;
    variacaoPontos: number;
  }[];
};

// NPS usa perguntas tipo NPS_10
export function calcularNPS(
  respostas: { valorNumerico: number | null }[]
): ResultadoNPS | null {
  const valores = respostas
    .map((r) => r.valorNumerico)
    .filter((v): v is number => v !== null && v >= 0 && v <= 10);

  if (valores.length === 0) return null;

  const promotores = valores.filter((v) => v >= 9).length;
  const neutros = valores.filter((v) => v >= 7 && v <= 8).length;
  const detratores = valores.filter((v) => v <= 6).length;
  const total = valores.length;

  const score = Math.round(((promotores - detratores) / total) * 100);

  return { promotores, detratores, neutros, total, score };
}

// Score geral (0-100) = média das dimensões em 0-100
export function calcularScoreGeral(dimenses: ResultadoDimensao[]): number {
  if (dimenses.length === 0) return 0;
  const soma = dimenses.reduce((acc, d) => acc + d.media100, 0);
  return Math.round(soma / dimenses.length);
}

// Converte nota Likert 1-5 para 0-100
export function likertTo100(valor: number): number {
  // 1 -> 0, 3 -> 50, 5 -> 100
  return Math.round(((valor - 1) / 4) * 100);
}

// Interpretação do score GPTW (benchmarks internos)
export function classificarScore(score: number): {
  label: string;
  cor: string;
  nivel: "critico" | "atencao" | "bom" | "excelente";
} {
  if (score < 40) return { label: "Crítico", cor: "#dc2626", nivel: "critico" };
  if (score < 60) return { label: "Atenção", cor: "#f59e0b", nivel: "atencao" };
  if (score < 75) return { label: "Bom", cor: "#22c55e", nivel: "bom" };
  return { label: "Excelente", cor: "#16a34a", nivel: "excelente" };
}

// Interpretação NPS
export function classificarNPS(score: number): {
  label: string;
  cor: string;
} {
  if (score < 0) return { label: "Crítico", cor: "#dc2626" };
  if (score < 50) return { label: "Baixo", cor: "#f59e0b" };
  if (score < 75) return { label: "Bom", cor: "#22c55e" };
  return { label: "Excelente", cor: "#16a34a" };
}

// Agrega respostas por dimensão GPTW (formato Prisma: pergunta aninhada)
export function agregarPorDimensao(
  itens: Array<{
    pergunta: { dimensaoGPTW: string | null; dimensao: string | null };
    valorNumerico: number | null;
  }>
): Map<string, { soma: number; qtd: number }> {
  const mapa = new Map<string, { soma: number; qtd: number }>();

  for (const item of itens) {
    if (item.valorNumerico == null) continue;
    const dimensao = (item.pergunta.dimensaoGPTW || item.pergunta.dimensao || "GERAL") as DimensaoGPTW;
    const atual = mapa.get(dimensao) ?? { soma: 0, qtd: 0 };
    atual.soma += item.valorNumerico;
    atual.qtd += 1;
    mapa.set(dimensao, atual);
  }

  return mapa;
}

// Monta resultado completo a partir dos itens de resposta (formato Prisma: pergunta aninhada)
export function calcularClima(dados: {
  respostas: Array<{
    itens: Array<{
      pergunta: { dimensaoGPTW: string | null; dimensao: string | null };
      valorNumerico: number | null;
    }>;
    setorNomeSnapshot: string;
  }>;
  perguntaNPS?: { valorNumerico: number | null }[];
}): { resultado: ResultadoClima; porSetor: Map<string, { soma: number; qtd: number }> } {
  const todosItens = dados.respostas.flatMap((r) => r.itens);
  const porDimensao = agregarPorDimensao(todosItens);

  const dimensaoMap = new Map<DimensaoGPTW | string, string>(DIMENSOES_GPTW.map((d) => [d.value, d.label]));

  const mediaPorDimensao: ResultadoDimensao[] = [];
  const porSetor = new Map<string, { soma: number; qtd: number }>();

  for (const [dimensao, dados2] of porDimensao.entries()) {
    const label = dimensaoMap.get(dimensao) ?? dimensao;
    const media = dados2.soma / dados2.qtd;
    mediaPorDimensao.push({
      dimensao: dimensao as DimensaoGPTW,
      label,
      media,
      media100: likertTo100(media),
      respostas: dados2.qtd,
    });
  }

  // Por setor
  for (const resposta of dados.respostas) {
    for (const item of resposta.itens) {
      if (item.valorNumerico == null) continue;
      const setor = resposta.setorNomeSnapshot;
      const atual = porSetor.get(setor) ?? { soma: 0, qtd: 0 };
      atual.soma += item.valorNumerico;
      atual.qtd += 1;
      porSetor.set(setor, atual);
    }
  }

  const resultadoSetor: ResultadoSetor[] = [];
  for (const [setor, dados3] of porSetor.entries()) {
    const media = dados3.soma / dados3.qtd;
    resultadoSetor.push({
      setor,
      media,
      media100: likertTo100(media),
      respostas: dados3.qtd,
      amostraInsuficiente: dados3.qtd < AMOSTRA_MINIMA_ANONIMATO,
    });
  }

  const nps = dados.perguntaNPS ? calcularNPS(dados.perguntaNPS) : null;
  const scoreGeral = calcularScoreGeral(mediaPorDimensao);

  const resultado: ResultadoClima = {
    totalRespostas: dados.respostas.length,
    mediaPorDimensao: mediaPorDimensao.sort((a, b) => b.media100 - a.media100),
    scoreGeral,
    nps,
    porSetor: resultadoSetor.sort((a, b) => b.media100 - a.media100),
    mostraAmostraInsuficiente: dados.respostas.length < AMOSTRA_MINIMA_ANONIMATO,
  };

  return { resultado, porSetor };
}

// Comparativo entre dois ciclos
export function compararCiclos(atual: ResultadoClima, anterior: ResultadoClima | null): ResultadoComparativo | null {
  if (!anterior) return null;

  const variacao = atual.mediaPorDimensao.map((d) => {
    const ant = anterior.mediaPorDimensao.find((a) => a.dimensao === d.dimensao);
    return {
      dimensao: d.dimensao,
      anterior: ant?.media100 ?? 0,
      atual: d.media100,
      variacaoPontos: (ant?.media100 ?? 0) - d.media100,
    };
  });

  return { atual, anterior, variacao };
}
