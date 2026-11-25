// Lógica de cálculo para pesquisas de Clima Organizacional (GPTW).
// Scores por dimensão (0-100), NPS, comparativo histórico, heatmap, recomendações.

import { DIMENSOES_GPTW } from "@/lib/constants-rh";
import { AMOSTRA_MINIMA_ANONIMATO } from "@/lib/constants-rh";
import { canonizarSetor } from "@/lib/de-para-rotulos";

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
  analiseExecutiva: AnaliseExecutiva;
  mostraAmostraInsuficiente: boolean;
};

export type AnaliseExecutiva = {
  vereditoGeral: string;
  tendencia: "melhora" | "estavel" | "queda" | "sem_historico";
  resumoTendencia: string;
  pontosFortes: string[];
  pontosCriticos: string[];
  setoresEmRisco: string[];
  setoresEmAlta: string[];
  participacaoNota: string;
  conclusao: string;
  alertasTexto: string[];
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

// `respostas` aqui é número de PESSOAS (Resposta distintas), não de itens
// respondidos (26/11/2026). Abaixo do piso de anonimato a média vem `null` —
// o número não sai do servidor, não é só a tela que esconde — e o setor fica
// fora do ranking (`ranking: null`).
export type ResultadoSetor = {
  setor: string;
  media: number | null;
  media100: number | null;
  respostas: number;
  amostraInsuficiente: boolean;
  ranking: number | null;
};

export type HeatmapCelula = {
  dimensao: DimensaoGPTW;
  dimensaoLabel: string;
  setor: string;
  media100: number | null;
  nivel: "critico" | "atencao" | "bom" | "excelente" | null;
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
  // `media` em 0-100 (mesma régua do resto do painel); `null` quando o grupo
  // tem menos pessoas que o piso de anonimato (26/11/2026).
  porSexo: { sexo: string; count: number; media: number | null }[];
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

// ---------------------------------------------------------------- Interpretação Executiva

// (analiseExecutiva definida na seção de tipos acima)

function gerarTextoVariacao(v: number): string {
  if (v > 0) return `melhorou ${v} pontos`;
  if (v < 0) return `piorou ${Math.abs(v)} pontos`;
  return "ficou estável";
}

export function gerarAnaliseExecutiva(
  resultado: ResultadoClima,
  comparativo: ResultadoComparativo | null,
  participacao: number,
): AnaliseExecutiva {
  // Abaixo do piso não há número para interpretar (26/11/2026) — sem isto o
  // veredito diria "CRÍTICO (0/100)" sobre uma pesquisa sem resultado.
  if (resultado.mostraAmostraInsuficiente) {
    return {
      vereditoGeral: `Amostra insuficiente: a pesquisa tem ${resultado.totalRespostas} resposta(s), abaixo do mínimo de ${AMOSTRA_MINIMA_ANONIMATO} pessoas que protege o anonimato. Os resultados ficam ocultos até atingir o mínimo.`,
      tendencia: "sem_historico",
      resumoTendencia: "",
      pontosFortes: [],
      pontosCriticos: [],
      setoresEmRisco: [],
      setoresEmAlta: [],
      participacaoNota: "",
      conclusao: "",
      alertasTexto: [],
    };
  }
  const cls = classificarScore(resultado.scoreGeral);
  const tendencia: AnaliseExecutiva["tendencia"] = comparativo
    ? comparativo.atual.scoreGeral > comparativo.anterior!.scoreGeral + 2
      ? "melhora"
      : comparativo.atual.scoreGeral < comparativo.anterior!.scoreGeral - 2
      ? "queda"
      : "estavel"
    : "sem_historico";

  const resumoTendencia =
    tendencia === "melhora"
      ? `O clima da empresa está em melhora. Em relação ao ciclo anterior, o score geral subiu ${comparativo!.atual.scoreGeral - comparativo!.anterior!.scoreGeral} pontos, saindo de ${comparativo!.anterior!.scoreGeral} para ${comparativo!.atual.scoreGeral}.`
      : tendencia === "queda"
      ? `O clima da empresa está em queda. Em relação ao ciclo anterior, o score geral caiu ${comparativo!.anterior!.scoreGeral - comparativo!.atual.scoreGeral} pontos, indo de ${comparativo!.anterior!.scoreGeral} para ${comparativo!.atual.scoreGeral}. É preciso investigar as causas e agir rápido.`
      : tendencia === "estavel"
      ? `O clima da empresa se manteve estável em relação ao ciclo anterior (variação de ${comparativo!.atual.scoreGeral - comparativo!.anterior!.scoreGeral} pontos). Não há queda expressiva, mas também não há melhora.`
      : `Este é o primeiro ciclo com dados suficientes — não há base anterior para comparar tendência. O foco deve ser estabelecer referência para os próximos ciclos.`;

  // Pontos fortes: dimensões em Bom/Excelente
  const pontosFortes = resultado.mediaPorDimensao
    .filter((d) => d.nivel === "bom" || d.nivel === "excelente")
    .sort((a, b) => b.media100 - a.media100)
    .map((d) => `${d.label} (${d.media100}/100) — o que está funcionando bem aqui indica práticas que devem ser disseminadas para outras dimensões e setores`);

  // Pontos críticos: dimensões em Crítico/Atenção
  const pontosCriticos = resultado.mediaPorDimensao
    .filter((d) => d.nivel === "critico" || d.nivel === "atencao")
    .sort((a, b) => a.media100 - b.media100)
    .map((d) => `${d.label} (${d.media100}/100) — considerado ${d.nivel === "critico" ? "CRÍTICO" : "em atenção"}; o setor precisa de intervenção direta (ver plano de ação)`);

  // Setores em risco: piores setores
  const setoresEmRisco = resultado.porSetor
    .filter((s) => !s.amostraInsuficiente && s.media100 !== null && s.media100 < 60)
    .slice(0, 3)
    .map((s) => `${s.setor} (${s.media100}/100) — recomenda-se reunião entre RH e liderança local para entender os motivos`);

  const setoresEmAlta = resultado.porSetor
    .filter((s) => !s.amostraInsuficiente && s.media100 !== null && s.media100 >= 75)
    .slice(0, 3)
    .map((s) => `${s.setor} (${s.media100}/100) — referência para outras áreas; investigue práticas para replicar`);

  const participacaoNota =
    participacao >= 80
      ? `Adesão excelente (${participacao}%). O dado é robusto e reflete a visão da maioria.`
      : participacao >= 60
      ? `Adesão boa (${participacao}%). O dado é confiável para tomada de decisão.`
      : participacao >= 40
      ? `Adesão moderada (${participacao}%). Os resultados indicam direção mas ainda não refletem a empresa inteira — vale intensificar comunicação.`
      : `Adesão baixa (${participacao}%). Resultados devem ser interpretados com cautela; comunicação sobre a próxima pesquisa deve ser mais intensa.`;

  const vereditoGeral =
    cls.nivel === "excelente"
      ? `A empresa atravessa um momento de clima organizacional EXCELENTE (${resultado.scoreGeral}/100). O engajamento é alto e as pessoas se sentem bem trabalhando aqui. O foco deve ser em Manutenção das práticas que geram esse resultado.`
      : cls.nivel === "bom"
      ? `A empresa está com clima organizacional BOM (${resultado.scoreGeral}/100). Há uma base sólida, mas há dimensões específicas que pedem atenção para evitar regressão.`
      : cls.nivel === "atencao"
      ? `A empresa está com clima organizacional em ATENÇÃO (${resultado.scoreGeral}/100). Há sinais claros de desgaste em dimensões importantes. É hora de agir — sem intervenção, o ciclo seguinte tende a piorar.`
      : `A empresa está com clima organizacional CRÍTICO (${resultado.scoreGeral}/100). Há problemas estruturais que pedem ação imediata da diretoria. Risco de perda de talentos, queda de produtividade e absenteísmo.`;

  const alertasTexto: string[] = [];
  if (resultado.nps && resultado.nps.score < 0) {
    alertasTexto.push(`NPS negativo (${resultado.nps.score}): mais pessoas detratoras do que promotoras. Indica risco de perda de marca empregadora.`);
  }
  if (setoresEmRisco.length > 0) {
    alertasTexto.push(`${setoresEmRisco.length} setor(es) com score abaixo de 60 — exigem atenção individualizada.`);
  }
  if (comparativo && comparativo.atual.scoreGeral < comparativo.anterior!.scoreGeral - 5) {
    alertasTexto.push(`Queda superior a 5 pontos em relação ao ciclo anterior — investigar mudanças organizacionais recentes.`);
  }
  if (pontosCriticos.length >= 2) {
    alertasTexto.push(`${pontosCriticos.length} dimensões em alerta simultaneamente — risco de insatisfação sistêmica.`);
  }

  const conclusao = cls.nivel === "excelente" || cls.nivel === "bom"
    ? `A empresa está no caminho certo. ${tendênciaMensagem(tendencia)} O desafio agora é preservar o que funciona e corrigir o que ainda não funciona.`
    : `A empresa precisa de mudanças estruturais. ${tendênciaMensagem(tendencia)} O plano de ação (seção 6) é o ponto de partida — mas precisa de ritmo e acompanhamento da diretoria para reverter o cenário.`;

  return {
    vereditoGeral,
    tendencia,
    resumoTendencia,
    pontosFortes,
    pontosCriticos,
    setoresEmRisco,
    setoresEmAlta,
    participacaoNota,
    conclusao,
    alertasTexto,
  };
}

function tendênciaMensagem(t: AnaliseExecutiva["tendencia"]): string {
  if (t === "melhora") return "A trajetória é positiva e vale a pena intensificar as iniciativas que vêm dando certo.";
  if (t === "queda") return "A tendência de queda precisa ser revertida com ações imediatas dos RH e gestores.";
  if (t === "estavel") return "A estabilidade é positiva, mas sem evolução o cenário fica vulnerável a mudanças externas.";
  return "Ainda não há trajetória para analisar — foque em ações de curto prazo.";
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

// Só a escala Likert 1-5 entra nas médias de dimensão, setor, heatmap e sexo
// (26/11/2026). Antes TODO item com valor numérico entrava — inclusive a nota
// NPS (0-10) e a frequência 0-4 —, e um 9 de NPS virava "acima do máximo" na
// conta de 1 a 5, puxando a média e o 0-100 (likertTo100) para cima.
export const TIPOS_LIKERT: ReadonlySet<string> = new Set(["LIKERT_5"]);

export function ehItemLikert(item: {
  pergunta: { tipo: string };
  valorNumerico: number | null;
}): item is { pergunta: { tipo: string }; valorNumerico: number } {
  return (
    item.valorNumerico != null &&
    TIPOS_LIKERT.has(item.pergunta.tipo) &&
    item.valorNumerico >= 1 &&
    item.valorNumerico <= 5
  );
}

// Acumulador de um recorte: soma/qtd dos ITENS (para a média) e o conjunto de
// PESSOAS (índice da Resposta) que contribuíram — é ele que vale para o piso
// de anonimato. Até 25/11/2026 o piso comparava `qtd`, que conta itens: um
// setor com 1 pessoa que respondeu 35 perguntas aparecia como "35 respostas",
// com média e posição no ranking (auditoria de 25/11/2026).
type Acumulador = { soma: number; qtd: number; pessoas: Set<number> };

function acumular(mapa: Map<string, Acumulador>, chave: string, valor: number, pessoa: number) {
  const atual = mapa.get(chave) ?? { soma: 0, qtd: 0, pessoas: new Set<number>() };
  atual.soma += valor;
  atual.qtd += 1;
  atual.pessoas.add(pessoa);
  mapa.set(chave, atual);
}

/** true quando o grupo tem menos PESSOAS que o piso de anonimato. */
export function abaixoDoPiso(pessoas: number): boolean {
  return pessoas < AMOSTRA_MINIMA_ANONIMATO;
}

function dimensaoDoItem(pergunta: { dimensaoGPTW: string | null; dimensao: string | null }): DimensaoGPTW {
  return (pergunta.dimensaoGPTW || pergunta.dimensao || "GERAL") as DimensaoGPTW;
}

export function agregarPorDimensao(respostas: Array<{
  itens: Array<{
    pergunta: { dimensaoGPTW: string | null; dimensao: string | null; tipo: string };
    valorNumerico: number | null;
  }>;
}>): Map<string, Acumulador> {
  const mapa = new Map<string, Acumulador>();
  respostas.forEach((resposta, pessoa) => {
    for (const item of resposta.itens) {
      if (!ehItemLikert(item)) continue;
      acumular(mapa, dimensaoDoItem(item.pergunta), item.valorNumerico, pessoa);
    }
  });
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

const ORDEM_NIVEL = { critico: 0, atencao: 1, bom: 2, excelente: 3 } as const;

const ANALISE_VAZIA: AnaliseExecutiva = {
  vereditoGeral: "", tendencia: "sem_historico", resumoTendencia: "", pontosFortes: [], pontosCriticos: [],
  setoresEmRisco: [], setoresEmAlta: [], participacaoNota: "", conclusao: "", alertasTexto: [],
};

// Rótulo que substitui o nome do setor num comentário aberto quando o setor
// tem menos pessoas que o piso: o texto aparece, a origem não.
export const SETOR_OCULTO_COMENTARIO = "Setor não identificado (amostra pequena)";

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

  // Pesquisa inteira abaixo do piso (26/11/2026): com 1 ou 2 respostas,
  // qualquer média é a nota de uma pessoa identificável. Nada de número,
  // comentário ou recorte sai daqui — só a contagem e o aviso.
  if (abaixoDoPiso(respostas.length)) {
    return {
      resultado: {
        totalRespostas: respostas.length,
        mediaPorDimensao: [],
        scoreGeral: 0,
        nps: null,
        porSetor: [],
        heatmap: [],
        perguntasCriticas: [],
        comentarios: [],
        demografia: null,
        recomendacoes: [],
        analiseExecutiva: ANALISE_VAZIA,
        mostraAmostraInsuficiente: true,
      },
      evolucao: [],
    };
  }

  // NPS — fica fora das médias Likert e tem o seu próprio indicador.
  const npsIds = new Set(perguntas.filter((p) => p.tipo === "NPS_10").map((p) => p.id));
  const itensNPS = respostas.flatMap((r) =>
    r.itens
      .filter((i) => npsIds.has(i.pergunta.id) || i.pergunta.tipo === "NPS_10")
      .map((i) => ({ valorNumerico: i.valorNumerico })),
  );
  const nps = calcularNPS(itensNPS);

  // Por dimensão (empresa inteira, só Likert). `respostas` = pessoas.
  const porDimensao = agregarPorDimensao(respostas);

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
      respostas: d.pessoas.size,
      nivel: cls.nivel,
    });
  }
  mediaPorDimensao.sort((a, b) => a.media100 - b.media100);

  // Por setor. O snapshot guarda o vocabulário da época da resposta — no Clima
  // 2026 "Comercial" e "Vendas" convivem na MESMA pesquisa. Agrupar pelo nome
  // canônico junta o que é o mesmo setor (ver lib/de-para-rotulos.ts).
  const setorDe = respostas.map((r) => canonizarSetor(r.setorNomeSnapshot).nome);
  // Quantas pessoas responderam por setor (qualquer item) — vale para decidir
  // se o nome do setor pode acompanhar um comentário aberto.
  const pessoasPorSetor = new Map<string, number>();
  for (const setor of setorDe) pessoasPorSetor.set(setor, (pessoasPorSetor.get(setor) ?? 0) + 1);

  const porSetorMap = new Map<string, Acumulador>();
  const setorDimensaoMap = new Map<string, Map<string, Acumulador>>();
  respostas.forEach((resposta, pessoa) => {
    const setor = setorDe[pessoa];
    for (const item of resposta.itens) {
      if (!ehItemLikert(item)) continue;
      acumular(porSetorMap, setor, item.valorNumerico, pessoa);
      // Mesma tradução do ranking por setor — sem ela o heatmap mostraria
      // "Comercial" e "Vendas" como duas linhas do mesmo setor.
      if (!setorDimensaoMap.has(setor)) setorDimensaoMap.set(setor, new Map());
      acumular(setorDimensaoMap.get(setor)!, dimensaoDoItem(item.pergunta), item.valorNumerico, pessoa);
    }
  });

  const comNumero: ResultadoSetor[] = [];
  const semNumero: ResultadoSetor[] = [];
  for (const [setor, d] of porSetorMap.entries()) {
    const pessoas = d.pessoas.size;
    if (abaixoDoPiso(pessoas)) {
      semNumero.push({ setor, media: null, media100: null, respostas: pessoas, amostraInsuficiente: true, ranking: null });
    } else {
      const media = d.soma / d.qtd;
      comNumero.push({ setor, media, media100: likertTo100(media), respostas: pessoas, amostraInsuficiente: false, ranking: 0 });
    }
  }
  comNumero.sort((a, b) => (a.media100 ?? 0) - (b.media100 ?? 0));
  comNumero.forEach((s, i) => { s.ranking = i + 1; });
  semNumero.sort((a, b) => a.setor.localeCompare(b.setor, "pt-BR"));
  // Setores sem amostra vão para o fim, sem posição no ranking.
  const resultadoSetor: ResultadoSetor[] = [...comNumero, ...semNumero];

  // Heatmap: setor × dimensão — piso conferido em cada célula, por pessoas.
  const heatmap: HeatmapCelula[] = [];
  for (const [setor, dimMap] of setorDimensaoMap.entries()) {
    for (const [dim, d] of dimMap.entries()) {
      const pessoas = d.pessoas.size;
      const insuficiente = abaixoDoPiso(pessoas);
      const media100 = insuficiente ? null : likertTo100(d.soma / d.qtd);
      heatmap.push({
        dimensao: dim as DimensaoGPTW,
        dimensaoLabel: dimensaoMap.get(dim) ?? dim,
        setor,
        media100,
        nivel: media100 === null ? null : classificarScore(media100).nivel,
        respostas: pessoas,
        amostraInsuficiente: insuficiente,
      });
    }
  }
  heatmap.sort((a, b) => {
    const oa = a.nivel === null ? 4 : ORDEM_NIVEL[a.nivel];
    const ob = b.nivel === null ? 4 : ORDEM_NIVEL[b.nivel];
    return oa - ob;
  });

  // Perguntas críticas (as piores 5 por média) — só Likert. Uma pessoa
  // responde cada pergunta uma vez (o envio público recusa repetida), então
  // `qtd` aqui é pessoas; o mínimo de 5 já é mais rígido que o piso.
  const porPergunta = new Map<string, { soma: number; qtd: number; pergunta: RespostaPrisma["itens"][number]["pergunta"] }>();
  for (const resposta of respostas) {
    for (const item of resposta.itens) {
      if (!ehItemLikert(item)) continue;
      const atual = porPergunta.get(item.pergunta.id) ?? { soma: 0, qtd: 0, pergunta: item.pergunta };
      atual.soma += item.valorNumerico;
      atual.qtd += 1;
      porPergunta.set(item.pergunta.id, atual);
    }
  }
  const perguntasCriticas: PerguntaCritica[] = [];
  for (const [, d] of porPergunta.entries()) {
    if (d.qtd < 5) continue;
    const media = d.soma / d.qtd;
    perguntasCriticas.push({
      id: d.pergunta.id,
      enunciado: d.pergunta.enunciado,
      dimensao: dimensaoDoItem(d.pergunta),
      dimensaoLabel: dimensaoMap.get(dimensaoDoItem(d.pergunta)) ?? "Geral",
      media,
      media100: likertTo100(media),
      respostas: d.qtd,
    });
  }
  perguntasCriticas.sort((a, b) => a.media100 - b.media100);
  perguntasCriticas.splice(5);

  // Comentários (TEXT). O nome do setor só acompanha o texto quando o setor
  // tem pessoas suficientes — comentário "de Financeiro" com 1 pessoa no
  // Financeiro é comentário assinado.
  const comentarios: Comentario[] = respostas
    .flatMap((r, pessoa) => {
      const setor = setorDe[pessoa];
      const setorVisivel = abaixoDoPiso(pessoasPorSetor.get(setor) ?? 0) ? SETOR_OCULTO_COMENTARIO : setor;
      return r.itens
        .filter((i) => i.pergunta.tipo === "TEXT" && i.valorTexto && i.valorTexto.trim().length > 5)
        // Rótulo traduzido para bater com os nomes do ranking/heatmap na tela.
        .map((i) => ({ texto: i.valorTexto!, setor: setorVisivel }));
    })
    .slice(0, 20);

  // Demografia. A média por sexo é a média das médias Likert de cada pessoa
  // (0-100) e só sai com o grupo no piso; a contagem por faixa etária é só
  // contagem, sem nota.
  let demografia: AnaliseDemografica | null = null;
  const porSexoMap = new Map<string, { soma: number; comNota: number; pessoas: number }>();
  const porFaixaMap = new Map<string, number>();
  for (const resposta of respostas) {
    const likert = resposta.itens.filter(ehItemLikert).map((i) => i.valorNumerico as number);
    if (resposta.sexoSnapshot) {
      const atual = porSexoMap.get(resposta.sexoSnapshot) ?? { soma: 0, comNota: 0, pessoas: 0 };
      atual.pessoas += 1;
      if (likert.length > 0) {
        atual.soma += likert.reduce((s, v) => s + v, 0) / likert.length;
        atual.comNota += 1;
      }
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
        count: d.pessoas,
        media: abaixoDoPiso(d.comNota) ? null : likertTo100(d.soma / d.comNota),
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
    analiseExecutiva: ANALISE_VAZIA,
    mostraAmostraInsuficiente: false,
  };
  resultado.analiseExecutiva = gerarAnaliseExecutiva(resultado, null, 0);

  return { resultado, evolucao: [] };
}

// ---------------------------------------------------------------- Comparativo

export function compararCiclos(atual: ResultadoClima, anterior: ResultadoClima | null): ResultadoComparativo | null {
  // Ciclo anterior abaixo do piso não tem número para comparar (26/11/2026).
  if (!anterior || anterior.mostraAmostraInsuficiente) return null;
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
  // Ciclo com menos pessoas que o piso não entra na linha do tempo: o score
  // dele seria a nota de alguém identificável (26/11/2026).
  return ciclos.filter((c) => !abaixoDoPiso(c.respostas.length)).map((c) => {
    const porDim = agregarPorDimensao(c.respostas);
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
