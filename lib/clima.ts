// Lógica de cálculo para pesquisas de Clima Organizacional (GPTW).
// Scores por dimensão (0-100), NPS, comparativo histórico, heatmap, recomendações.

import { DIMENSOES_GPTW } from "@/lib/constants-rh";
import { AMOSTRA_MINIMA_ANONIMATO } from "@/lib/constants-rh";

export type DimensaoGPTW = "CREDIBILIDADE" | "RESPEITO" | "IMPARCIALIDADE" | "ORGULHO" | "CAMARADAGEM" | "GERAL";

// ---------------------------------------------------------------- Tipos
export type ResultadoClima = {
  totalRespostas: number;
  mediaPorDimensao: ResultadoDimensao[];
  scoreGeral: number;
  nps: ResultadoNPS | null;
  porSetor: ResultadoSetor[];
  heatmap: HeatmapCelula[];
  perguntasCriticas: PerguntaCritica[];
  comentarios: Comentario[];
  demografia: AnaliseDemografica | null;
  recomendacoes: Recomendacao[];
  mostraAmostraInsuficiente: boolean;
};

export type ResultadoDimensao = {
  dimensao: DimensaoGPTW;
  label: string;
  media: number;       // 0-5
  media100: number;     // 0-100
  respostas: number;
  nivel: "critico" | "atencao" | "bom" | "excelente";
};

export type ResultadoNPS = {
  promotores: number;
  detratores: number;
  neutros: number;
  total: number;
  score: number;
};

export type ResultadoSetor = {
  setor: string;
  media: number;
  media100: number;
  respostas: number;
  amostraInsuficiente: boolean;
  ranking: number;
};

export type HeatmapCelula = {
  dimensao: DimensaoGPTW;
  dimensaoLabel: string;
  setor: string;
  media100: number;
  nivel: "critico" | "atencao" | "bom" | "excelente";
  respostas: number;
  amostraInsuficiente: boolean;
};

export type PerguntaCritica = {
  id: string;
  enunciado: string;
  dimensao: DimensaoGPTW;
  dimensaoLabel: string;
  media: number;       // 0-5
  media100: number;    // 0-100
  respostas: number;
};

export type Comentario = {
  texto: string;
  setor: string;
};

export type FaixaEtariaBucket = {
  faixa: string;
  count: number;
};

export type AnaliseDemografica = {
  porSexo: { sexo: string; count: number; media: number }[];
  porFaixaEtaria: FaixaEtariaBucket[];
};

export type Recomendacao = {
  dimensao: DimensaoGPTW;
  dimensaoLabel: string;
  nivel: "critico" | "atencao" | "bom" | "excelente";
  score: number;
  acoes: string[];
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

export type EvolucaoCiclo = {
  titulo: string;
  encerradaEm: Date;
  scoreGeral: number;
  mediaPorDimensao: { dimensao: DimensaoGPTW; media100: number }[];
};

// ---------------------------------------------------------------- Utilidades

export function calcularNPS(respostas: { valorNumerico: number | null }[]): ResultadoNPS | null {
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

export function calcularScoreGeral(dimenses: ResultadoDimensao[]): number {
  if (dimenses.length === 0) return 0;
  return Math.round(dimenses.reduce((acc, d) => acc + d.media100, 0) / dimenses.length);
}

export function likertTo100(valor: number): number {
  return Math.round(((valor - 1) / 4) * 100);
}

export function classificarScore(score: number): {
  label: string; cor: string; nivel: "critico" | "atencao" | "bom" | "excelente";
} {
  if (score < 40) return { label: "Crítico", cor: "#dc2626", nivel: "critico" };
  if (score < 60) return { label: "Atenção", cor: "#f59e0b", nivel: "atencao" };
  if (score < 75) return { label: "Bom", cor: "#22c55e", nivel: "bom" };
  return { label: "Excelente", cor: "#16a34a", nivel: "excelente" };
}

export function classificarNPS(score: number): { label: string; cor: string } {
  if (score < 0) return { label: "Crítico", cor: "#dc2626" };
  if (score < 50) return { label: "Baixo", cor: "#f59e0b" };
  if (score < 75) return { label: "Bom", cor: "#22c55e" };
  return { label: "Excelente", cor: "#16a34a" };
}

// ---------------------------------------------------------------- Recomendações GPTW

const RECOMENDACOES: Record<DimensaoGPTW, { critico: string[]; atencao: string[]; bom: string[] }> = {
  CREDIBILIDADE: {
    critico: [
      "Agendar reunião com gestores para apresentar dados e alinhar plano de ação imediato",
      "Revisar processos de comunicação interna — criar canal direto RH × colaboradores",
      "Avaliar confiança na liderança:访谈 anônimas com equipes críticas",
    ],
    atencao: [
      "Melhorar transparência nas decisões: comunicados mensais da diretoria",
      "Criar canal de feedback direto entre colaboradores e gestão",
      "Implementar reunião semanal de alinhamento por setor",
    ],
    bom: [
      "Manter o ritmo de comunicação transparente",
      "Compartilhar resultados da pesquisa com todos os colaboradores",
    ],
  },
  RESPEITO: {
    critico: [
      "Realizar workshop de inteligência emocional e comunicação não-violenta",
      "Implementar protocolo de convivência com mediação de conflitos",
      "Entrevistas de desligamento para entender padrões de conflito",
    ],
    atencao: [
      "Treinamento de liderança para gestão de equipes diversas",
      "Definir código de conduta claro e divulgação ampla",
      "Criar canal anônimo para denúncia de desrespeito",
    ],
    bom: [
      "Promover ações de integração entre setores",
      "Valorizarpublicamente boas práticas de convivência",
    ],
  },
  IMPARCIALIDADE: {
    critico: [
      "Auditar processos de promoção e reajuste — buscar causas de percepção negativa",
      "Implementar critérios objetivos e transparentes para oportunidades",
      "Garantir participação plural em comitês de decisão",
    ],
    atencao: [
      "Divulgar critérios de promoção e bônus antes das ciclos de avaliação",
      "Criar comitê misto (RH + colaboradores) para revisar equidade",
      "Análise de dados demográficos de cargos de liderança",
    ],
    bom: [
      "Manter processos de seleção e promoção com critérios claros",
      "Revisar periodicamente práticas de equidade salarial",
    ],
  },
  ORGULHO: {
    critico: [
      "Levantar com gestores diretos os motivos da baixa percepção",
      "Criar programa de reconhecimento público de contribuições",
      "Revisar missão e valores da empresa — alinhar com squads",
    ],
    atencao: [
      "Campanha interna: 'Por que trabalho aqui?' — engajamento com valores",
      "Ações de employer branding: mostrar cultura no site e redes",
      "Programa de indicação com bônus atrativo",
    ],
    bom: [
      "Investir em marca empregadora e ações de endomarketing",
      "Reconhecer e celebrar conquistas de equipe publicamente",
    ],
  },
  CAMARADAGEM: {
    critico: [
      "Plano de integração urgente para novos colaboradores",
      "Mapeamento de lideranças quebremteam e intervir",
      "Programas de team building por setor",
    ],
    atencao: [
      "Iniciarprograma deBuddy para novos funcionários",
      "Ações de integração trimestrais por departamento",
      "Identificar e replicar práticas de setores com boa camaradagem",
    ],
    bom: [
      "Manter atividades de integração e celebração",
      "Criar canais informais de convivência (espaços de pausa)",
    ],
  },
  GERAL: {
    critico: [
      "Plano de ação transversal com todas as dimensões em alerta",
      "Reunião com RH e diretoria para replanejamento estratégico",
    ],
    atencao: [
      "Monitoramento mensal de indicadores de clima",
      "Plano de ação focado nas 2 dimensões mais baixas",
    ],
    bom: [
      "Manter práticas de melhoria contínua",
      "Compartilhar resultados e plano de ação com colaboradores",
    ],
  },
};

export function gerarRecomendacoes(dimensoes: ResultadoDimensao[]): Recomendacao[] {
  return dimensoes.map((d) => {
    const textos = d.nivel === "critico"
      ? RECOMENDACOES[d.dimensao]?.critico ?? []
      : d.nivel === "atencao"
      ? RECOMENDACOES[d.dimensao]?.atencao ?? []
      : RECOMENDACOES[d.dimensao]?.bom ?? [];
    return {
      dimensao: d.dimensao,
      dimensaoLabel: d.label,
      nivel: d.nivel,
      score: d.media100,
      acoes: textos,
    };
  }).sort((a, b) => {
    const ordem = { critico: 0, atencao: 1, bom: 2, excelente: 3 };
    return ordem[a.nivel] - ordem[b.nivel];
  });
}

// ---------------------------------------------------------------- Agregações

export function agregarPorDimensao(itens: Array<{
  pergunta: { dimensaoGPTW: string | null; dimensao: string | null };
  valorNumerico: number | null;
}>): Map<string, { soma: number; qtd: number }> {
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

// ---------------------------------------------------------------- Cálculo completo do clima

export type RespostaPrisma = {
  itens: Array<{
    pergunta: {
      dimensaoGPTW: string | null;
      dimensao: string | null;
      id: string;
      enunciado: string;
      tipo: string;
    };
    valorNumerico: number | null;
    valorTexto: string | null;
  }>;
  setorNomeSnapshot: string;
  sexoSnapshot: string | null;
  faixaEtariaSnapshot: string | null;
};

type PerguntaPrisma = { id: string };

export function calcularClima(dados: {
  respostas: RespostaPrisma[];
  perguntas: Array<{ id: string; dimensaoGPTW: string | null; dimensao: string | null; enunciado: string; tipo: string }>;
}): {
  resultado: ResultadoClima;
  evolucao: EvolucaoCiclo[];
} {
  const respostas = dados.respostas;
  const perguntas = dados.perguntas;
  const dimensaoMap = new Map<DimensaoGPTW | string, string>(
    DIMENSOES_GPTW.map((d) => [d.value, d.label]),
  );

  // NPS
  const npsIds = perguntas.filter((p) => p.tipo === "NPS_10").map((p) => p.id);
  const itensNPS = respostas.flatMap((r) =>
    r.itens
      .filter((i) => npsIds.includes(i.pergunta.id))
      .map((i) => ({ valorNumerico: i.valorNumerico })),
  );
  const nps = calcularNPS(itensNPS);

  // Por dimensão
  const todosItens = respostas.flatMap((r) => r.itens);
  const porDimensao = agregarPorDimensao(todosItens);

  const mediaPorDimensao: ResultadoDimensao[] = [];
  for (const [dim, d] of porDimensao.entries()) {
    const label = dimensaoMap.get(dim) ?? dim;
    const media = d.soma / d.qtd;
    const media100 = likertTo100(media);
    const cls = classificarScore(media100);
    mediaPorDimensao.push({
      dimensao: dim as DimensaoGPTW,
      label,
      media,
      media100,
      respostas: d.qtd,
      nivel: cls.nivel,
    });
  }
  mediaPorDimensao.sort((a, b) => a.media100 - b.media100);

  // Por setor
  const porSetorMap = new Map<string, { soma: number; qtd: number }>();
  for (const resposta of respostas) {
    for (const item of resposta.itens) {
      if (item.valorNumerico == null) continue;
      const atual = porSetorMap.get(resposta.setorNomeSnapshot) ?? { soma: 0, qtd: 0 };
      atual.soma += item.valorNumerico;
      atual.qtd += 1;
      porSetorMap.set(resposta.setorNomeSnapshot, atual);
    }
  }
  const resultadoSetor: ResultadoSetor[] = [];
  for (const [setor, d] of porSetorMap.entries()) {
    const media = d.soma / d.qtd;
    resultadoSetor.push({
      setor,
      media,
      media100: likertTo100(media),
      respostas: d.qtd,
      amostraInsuficiente: d.qtd < AMOSTRA_MINIMA_ANONIMATO,
      ranking: 0,
    });
  }
  resultadoSetor.sort((a, b) => a.media100 - b.media100);
  resultadoSetor.forEach((s, i) => { s.ranking = i + 1; });

  // Heatmap: setor × dimensão
  const heatmap: HeatmapCelula[] = [];
  const setorDimensaoMap = new Map<string, Map<string, { soma: number; qtd: number }>>();
  for (const resposta of respostas) {
    for (const item of resposta.itens) {
      if (item.valorNumerico == null) continue;
      const dim = (item.pergunta.dimensaoGPTW || item.pergunta.dimensao || "GERAL") as DimensaoGPTW;
      const setor = resposta.setorNomeSnapshot;
      if (!setorDimensaoMap.has(setor)) setorDimensaoMap.set(setor, new Map());
      const mapa = setorDimensaoMap.get(setor)!;
      const atual = mapa.get(dim) ?? { soma: 0, qtd: 0 };
      atual.soma += item.valorNumerico;
      atual.qtd += 1;
      mapa.set(dim, atual);
    }
  }
  for (const [setor, dimMap] of setorDimensaoMap.entries()) {
    for (const [dim, d] of dimMap.entries()) {
      const media100 = likertTo100(d.soma / d.qtd);
      const cls = classificarScore(media100);
      heatmap.push({
        dimensao: dim as DimensaoGPTW,
        dimensaoLabel: dimensaoMap.get(dim) ?? dim,
        setor,
        media100,
        nivel: cls.nivel,
        respostas: d.qtd,
        amostraInsuficiente: d.qtd < AMOSTRA_MINIMA_ANONIMATO,
      });
    }
  }
  heatmap.sort((a, b) => {
    const ordem = { critico: 0, atencao: 1, bom: 2, excelente: 3 };
    return (ordem[a.nivel] - ordem[b.nivel]);
  });

  // Perguntas críticas (as piores 5 por média)
  const porPergunta = new Map<string, { soma: number; qtd: number; pergunta: typeof perguntas[0] }>();
  for (const item of todosItens) {
    if (item.valorNumerico == null) continue;
    if (item.pergunta.tipo === "TEXT" || item.pergunta.tipo === "NPS_10") continue;
    const atual = porPergunta.get(item.pergunta.id) ?? { soma: 0, qtd: 0, pergunta: item.pergunta };
    atual.soma += item.valorNumerico;
    atual.qtd += 1;
    porPergunta.set(item.pergunta.id, atual);
  }
  const perguntasCriticas: PerguntaCritica[] = [];
  for (const [, d] of porPergunta.entries()) {
    if (d.qtd < 5) continue;
    const media = d.soma / d.qtd;
    perguntasCriticas.push({
      id: d.pergunta.id,
      enunciado: d.pergunta.enunciado,
      dimensao: (d.pergunta.dimensaoGPTW || d.pergunta.dimensao || "GERAL") as DimensaoGPTW,
      dimensaoLabel: dimensaoMap.get(d.pergunta.dimensaoGPTW || d.pergunta.dimensao || "GERAL") ?? "Geral",
      media,
      media100: likertTo100(media),
      respostas: d.qtd,
    });
  }
  perguntasCriticas.sort((a, b) => a.media100 - b.media100);
  perguntasCriticas.splice(5);

  // Comentários (TEXT)
  const comentarios: Comentario[] = respostas
    .flatMap((r) =>
      r.itens
        .filter((i) => i.pergunta.tipo === "TEXT" && i.valorTexto && i.valorTexto.trim().length > 5)
        .map((i) => ({ texto: i.valorTexto!, setor: r.setorNomeSnapshot })),
    )
    .slice(0, 20);

  // Demografia
  let demografia: AnaliseDemografica | null = null;
  const porSexoMap = new Map<string, { soma: number; qtd: number }>();
  const porFaixaMap = new Map<string, number>();
  for (const resposta of respostas) {
    const media = resposta.itens
      .filter((i) => i.valorNumerico != null)
      .reduce((s, i) => s + (i.valorNumerico ?? 0), 0) /
      Math.max(resposta.itens.filter((i) => i.valorNumerico != null).length, 1);
    if (resposta.sexoSnapshot) {
      const atual = porSexoMap.get(resposta.sexoSnapshot) ?? { soma: 0, qtd: 0 };
      atual.soma += media;
      atual.qtd += 1;
      porSexoMap.set(resposta.sexoSnapshot, atual);
    }
    if (resposta.faixaEtariaSnapshot) {
      porFaixaMap.set(resposta.faixaEtariaSnapshot, (porFaixaMap.get(resposta.faixaEtariaSnapshot) ?? 0) + 1);
    }
  }
  if (porSexoMap.size > 0 || porFaixaMap.size > 0) {
    demografia = {
      porSexo: [...porSexoMap.entries()].map(([sexo, d]) => ({
        sexo,
        count: d.qtd,
        media: Math.round((d.soma / d.qtd) * 100),
      })),
      porFaixaEtaria: [...porFaixaMap.entries()].map(([faixa, count]) => ({ faixa, count })),
    };
  }

  // Recomendações
  const recomendacoes = gerarRecomendacoes(mediaPorDimensao);

  const scoreGeral = calcularScoreGeral(mediaPorDimensao);
  const resultado: ResultadoClima = {
    totalRespostas: respostas.length,
    mediaPorDimensao,
    scoreGeral,
    nps,
    porSetor: resultadoSetor,
    heatmap,
    perguntasCriticas,
    comentarios,
    demografia,
    recomendacoes,
    mostraAmostraInsuficiente: respostas.length < AMOSTRA_MINIMA_ANONIMATO,
  };

  return { resultado, evolucao: [] };
}

// ---------------------------------------------------------------- Comparativo

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

// ---------------------------------------------------------------- Evolução histórica

export function extrairEvolucao(
  ciclos: Array<{
    titulo: string;
    encerradaEm: Date;
    respostas: RespostaPrisma[];
  }>,
): EvolucaoCiclo[] {
  return ciclos.map((c) => {
    const todosItens = c.respostas.flatMap((r) => r.itens);
    const porDim = agregarPorDimensao(todosItens);
    const dimensoes = [...porDim.entries()].map(([dim, d]) => ({
      dimensao: dim as DimensaoGPTW,
      media100: likertTo100(d.soma / d.qtd),
    }));
    const scoreGeral = dimensoes.length > 0
      ? Math.round(dimensoes.reduce((s, d) => s + d.media100, 0) / dimensoes.length)
      : 0;
    return {
      titulo: c.titulo,
      encerradaEm: c.encerradaEm,
      scoreGeral,
      mediaPorDimensao: dimensoes,
    };
  }).reverse(); // mais antigo primeiro
}
