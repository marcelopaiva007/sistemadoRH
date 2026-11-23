// Análise gerencial de QUALQUER pesquisa — motor único por trás do Dashboard
// e do Relatório PDF de cada pesquisa.
//
// POR QUE EXISTE. Até a v1.207 só o Clima (dashboard-clima + relatorio-clima-pdf)
// e o NR-01 (dashboard + relatório PGR) tinham leitura gerencial. O eNPS, o
// Onboarding 30 dias, a pesquisa de desligamento e as demais terminavam na aba
// Resultados: barras por pergunta e os comentários em lista corrida. Em
// 23/11/2026 o eNPS de outubro fechou com 79 respostas e não havia onde ver
// "o que isso quer dizer e o que fazer" — a regra passou a ser: toda pesquisa
// gera um relatório de análise gerencial e um dashboard.
//
// Puro e sem I/O: recebe perguntas e respostas já carregadas (e, se houver,
// os ciclos anteriores do mesmo tipo), devolve tudo o que o dashboard desenha
// e o PDF imprime. Os dois leem o MESMO objeto — o número da tela e o do papel
// não podem divergir. Testável sem banco (scripts/test-pesquisa-analise.ts).
//
// ANONIMATO. Nada aqui identifica quem respondeu: setor com menos de
// AMOSTRA_MINIMA_ANONIMATO respostas sai sem número ("amostra insuficiente"),
// e os comentários são agrupados por tema e grupo de nota, nunca por setor.
import { apurarPorPergunta, type ApuracaoPergunta, type PerguntaParaApurar } from "@/lib/pesquisa-apuracao";
import { calcularResultadoEnps, type ResultadoEnps } from "@/lib/pesquisa-enps-resultado";
import { classificarEmZona, ZONAS_FAVORABILIDADE, type Zona } from "@/lib/zonas";
import { AMOSTRA_MINIMA_ANONIMATO } from "@/lib/constants-rh";
import { participacaoPct } from "@/lib/pesquisa-numeros";

// ---------------------------------------------------------------------------
// Entrada

export type ItemParaAnalise = {
  perguntaId: string;
  valorNumerico: number | null;
  valorTexto: string | null;
  opcaoId: string | null;
};

export type RespostaParaAnalise = {
  setorNomeSnapshot: string;
  itens: ItemParaAnalise[];
};

export type CicloParaAnalise = {
  titulo: string;
  /** Quando encerrou — ou, se ainda aberta, quando começou. Só para ordenar e rotular. */
  data: Date | null;
  convites: number;
  perguntas: PerguntaParaApurar[];
  respostas: RespostaParaAnalise[];
};

export type EntradaAnalise = CicloParaAnalise & {
  modelo: string;
  /** Ciclos anteriores do MESMO tipo e marca, do mais recente ao mais antigo. */
  anteriores?: CicloParaAnalise[];
};

// ---------------------------------------------------------------------------
// Saída

export type NivelParticipacao = "baixa" | "razoavel" | "boa";
export type GrupoNota = "promotor" | "neutro" | "detrator";
export type Tom = "positivo" | "negativo" | "misto";

export type PerguntaAnalisada = ApuracaoPergunta & {
  /** Nota 0-100 comparável entre escalas; null em texto e múltipla escolha. */
  nota100: number | null;
};

export type SetorAnalisado = {
  setor: string;
  respostas: number;
  /** true quando há menos de AMOSTRA_MINIMA_ANONIMATO respostas: nota e eNPS ficam ocultos. */
  amostraInsuficiente: boolean;
  nota100: number | null;
  enps: number | null;
};

export type TemaComentario = {
  tema: string;
  quantidade: number;
  /** % dos comentários que tocam neste tema (um comentário pode tocar em mais de um). */
  percentual: number;
  tom: Tom;
  /** Quantos vieram de cada grupo de nota (só quando a pesquisa tem pergunta 0-10). */
  porGrupo: Record<GrupoNota, number>;
  exemplos: string[];
};

export type PontoDaAnalise = { titulo: string; nota100: number; detalhe: string };

export type PontoDaSerie = {
  titulo: string;
  data: Date | null;
  participacao: number;
  /** eNPS (-100 a 100) quando o tipo tem pergunta 0-10; senão favorabilidade 0-100. */
  indicador: number | null;
};

export type Recomendacao = {
  prioridade: "alta" | "media" | "baixa";
  titulo: string;
  detalhe: string;
  responsavel: string;
};

export type AnaliseGerencial = {
  titulo: string;
  modelo: string;
  convites: number;
  respostas: number;
  participacao: number;
  nivelParticipacao: NivelParticipacao;

  /** Nome e régua do indicador principal desta pesquisa. */
  indicador: {
    nome: string;
    valor: number | null;
    escala: "enps" | "favorabilidade" | "nenhum";
    zona: Zona | null;
  };
  enps: ResultadoEnps | null;
  /** % de notas 4-5 nas perguntas de escala 1-5; null se a pesquisa não tem nenhuma. */
  favorabilidade: number | null;

  perguntas: PerguntaAnalisada[];
  pontosFortes: PontoDaAnalise[];
  pontosAtencao: PontoDaAnalise[];
  setores: SetorAnalisado[];

  totalComentarios: number;
  temas: TemaComentario[];

  /** Do ciclo MAIS ANTIGO ao atual — a ordem em que um gráfico de linha lê. */
  serie: PontoDaSerie[];
  comparativo: {
    tituloAnterior: string;
    indicadorAnterior: number | null;
    variacao: number | null;
    participacaoAnterior: number;
    tendencia: "melhora" | "queda" | "estavel" | "sem_base";
  } | null;

  resumo: string[];
  recomendacoes: Recomendacao[];
};

// ---------------------------------------------------------------------------
// Regras

/** Abaixo disso a leitura vale para quem respondeu, não para a empresa. */
export const PARTICIPACAO_BAIXA = 50;
export const PARTICIPACAO_BOA = 70;
/** Variação de indicador que conta como mudança de verdade, não ruído de amostra. */
const VARIACAO_RELEVANTE = 5;

export function nivelDaParticipacao(pct: number): NivelParticipacao {
  if (pct < PARTICIPACAO_BAIXA) return "baixa";
  if (pct < PARTICIPACAO_BOA) return "razoavel";
  return "boa";
}

/** Converte a média de uma pergunta para 0-100, para comparar escalas diferentes. */
export function paraNota100(tipo: string, media: number | null): number | null {
  if (media === null) return null;
  if (tipo === "LIKERT_5") return Math.round(((media - 1) / 4) * 100);
  if (tipo === "NPS_10") return Math.round(media * 10);
  // FREQ_0_4 é a escala do NR-01, onde a direção (risco x proteção) depende da
  // pergunta — o NR-01 tem motor próprio; aqui não se arrisca um sentido.
  return null;
}

// ---------------------------------------------------------------------------
// Temas dos comentários
//
// Dicionário simples e explícito de propósito: o RH precisa conseguir ler a
// regra e entender por que um comentário caiu em "Frota". Palavras comparadas
// sem acento e em minúsculas; basta UMA ocorrência para o tema contar.

export const TEMAS: { tema: string; palavras: string[] }[] = [
  {
    tema: "Frota e veículos",
    palavras: ["carro", "carros", "veiculo", "veiculos", "frota", "moto", "motos", "quebrad", "remendad", "oficina", "manutencao do carro", "combustivel", "pneu"],
  },
  {
    tema: "Ferramentas e equipamentos",
    palavras: ["celular", "aparelho", "credito", "creditos", "ferramenta", "equipamento", "notebook", "computador", "sistema", "aplicativo", "app", "uniforme", "epi", "material"],
  },
  {
    tema: "Salário e benefícios",
    palavras: ["salario", "salarial", "remuneracao", "pagamento", "beneficio", "beneficios", "vale", "plano de saude", "bonus", "bonificacao", "comissao", "aumento", "reajuste", "hora extra", "horas extras"],
  },
  {
    tema: "Liderança e gestão",
    palavras: ["gestao", "gestor", "gestores", "lider", "lideranca", "chefe", "supervisor", "gerente", "gerencia", "diretoria", "decisao", "decisoes", "parcial", "favoritismo", "cobranca"],
  },
  {
    tema: "Ambiente e equipe",
    palavras: ["ambiente", "equipe", "colegas", "companheirismo", "acolhedor", "familia", "clima", "uniao", "respeito", "amizade", "time"],
  },
  {
    tema: "Crescimento e reconhecimento",
    palavras: ["crescimento", "crescer", "oportunidade", "oportunidades", "carreira", "reconhecimento", "reconhecer", "valorizacao", "valoriza", "promocao", "aprendizado", "aprender", "treinamento", "desenvolvimento", "profissional"],
  },
  {
    tema: "Carga de trabalho e escala",
    palavras: ["escala", "folga", "folgas", "domingo", "feriado", "sobrecarga", "carga", "horario", "jornada", "cansaco", "6x1", "5x2", "plantao", "descanso"],
  },
  {
    tema: "Comunicação",
    palavras: ["comunicacao", "informacao", "informar", "transparencia", "feedback", "ouvir", "escuta", "dialogo"],
  },
  {
    tema: "Clientes e serviço",
    // "cliente" sozinho não: "vergonha na frente dos clientes" fala de frota, não de atendimento.
    palavras: ["atendimento", "atender o cliente", "atendimento ao cliente", "qualidade do servico", "reclamacao", "reclamacoes"],
  },
];

const PALAVRAS_NEGATIVAS = [
  "nao", "falta", "faltando", "precisa", "precisaria", "melhorar", "melhoria", "ruim", "pessimo", "problema",
  "quebrad", "remend", "vergonha", "atraso", "demora", "injust", "parcia", "pouco", "poucas", "nunca", "dificil",
  "cansad", "sobrecarg", "insatisf", "desvaloriz", "olhe mais", "deveria", "poderia", "precari", "desorganiz",
  "pressao", "assedio", "humilh", "grit",
];
const PALAVRAS_POSITIVAS = [
  "bom", "boa", "otimo", "otima", "excelente", "gosto", "adoro", "feliz", "satisf", "acolhedor",
  "respeito", "crescimento", "oportunidade", "melhor lugar", "agradeco", "obrigad", "orgulho", "parabens",
];

export function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function contem(textoNormalizado: string, palavra: string): boolean {
  // Palavra curta precisa casar inteira ("app" não pode casar "apparel");
  // raiz terminada sem vogal ("quebrad") casa por prefixo de propósito.
  if (palavra.length <= 4 || palavra.includes(" ")) {
    const re = new RegExp(`(^|[^a-z0-9])${palavra.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`);
    return re.test(textoNormalizado);
  }
  return textoNormalizado.includes(palavra);
}

export function temasDoComentario(texto: string): string[] {
  const n = normalizarTexto(texto);
  return TEMAS.filter((t) => t.palavras.some((p) => contem(n, p))).map((t) => t.tema);
}

/** Pergunta do tipo "o que faria sua nota subir?" — a resposta é, por natureza, pedido de melhoria. */
export function perguntaPedeMelhoria(enunciado: string): boolean {
  return /melhor|subir|sugest|mudar|mudaria|poderia|falta|aumentar/.test(normalizarTexto(enunciado));
}

/**
 * Tom de um comentário. Sem palavra que indique elogio ou crítica, o
 * comentário é neutro ("misto") — NUNCA elogio por omissão: "Adotar a escala
 * 5x2" é sugestão, não elogio. Na resposta a uma pergunta de melhoria, o
 * padrão é "negativo" (pedido de melhoria), salvo quem diz que não falta nada.
 */
export function tomDoComentario(texto: string, pedidoDeMelhoria = false): Tom {
  const n = normalizarTexto(texto);
  if (pedidoDeMelhoria) {
    return /(^|[^a-z])(nada|nenhum|nenhuma|ja esta bom|esta otimo|esta bom|tudo certo|tudo otimo)([^a-z]|$)/.test(n)
      ? "positivo"
      : "negativo";
  }
  const neg = PALAVRAS_NEGATIVAS.filter((p) => contem(n, p)).length;
  const pos = PALAVRAS_POSITIVAS.filter((p) => contem(n, p)).length;
  if (neg > pos) return "negativo";
  if (pos > neg) return "positivo";
  return "misto";
}

function grupoDaNota(nota: number): GrupoNota {
  if (nota >= 9) return "promotor";
  if (nota >= 7) return "neutro";
  return "detrator";
}

function encurtar(s: string, max = 220): string {
  const limpo = s.replace(/\s+/g, " ").trim();
  return limpo.length <= max ? limpo : `${limpo.slice(0, max - 1).trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// Cálculos por ciclo

type Basico = {
  participacao: number;
  enps: ResultadoEnps | null;
  favorabilidade: number | null;
  perguntas: PerguntaAnalisada[];
};

function calcularBasico(ciclo: CicloParaAnalise): Basico {
  const itens = ciclo.respostas.flatMap((r) => r.itens);
  const apuradas = apurarPorPergunta(ciclo.perguntas, itens);
  const perguntas: PerguntaAnalisada[] = apuradas.map((q) => ({ ...q, nota100: paraNota100(q.tipo, q.media) }));

  const tipoPorPergunta = new Map(ciclo.perguntas.map((p) => [p.id, p.tipo]));
  const itensNps = itens.filter((i) => tipoPorPergunta.get(i.perguntaId) === "NPS_10");
  const enps = itensNps.length > 0 ? calcularResultadoEnps(itensNps) : null;

  const notasLikert = itens
    .filter((i) => tipoPorPergunta.get(i.perguntaId) === "LIKERT_5" && i.valorNumerico !== null)
    .map((i) => i.valorNumerico as number);
  const favorabilidade =
    notasLikert.length > 0
      ? Math.round((notasLikert.filter((v) => v >= 4).length / notasLikert.length) * 100)
      : null;

  return {
    participacao: participacaoPct(ciclo.respostas.length, ciclo.convites),
    enps,
    favorabilidade,
    perguntas,
  };
}

function indicadorDe(b: Basico): number | null {
  return b.enps ? b.enps.score : b.favorabilidade;
}

function calcularSetores(ciclo: CicloParaAnalise): SetorAnalisado[] {
  const tipoPorPergunta = new Map(ciclo.perguntas.map((p) => [p.id, p.tipo]));
  const porSetor = new Map<string, RespostaParaAnalise[]>();
  for (const r of ciclo.respostas) {
    const s = r.setorNomeSnapshot?.trim() || "Não informado";
    (porSetor.get(s) ?? porSetor.set(s, []).get(s)!).push(r);
  }

  return [...porSetor.entries()]
    .map(([setor, respostas]) => {
      const amostraInsuficiente = respostas.length < AMOSTRA_MINIMA_ANONIMATO;
      if (amostraInsuficiente) {
        return { setor, respostas: respostas.length, amostraInsuficiente, nota100: null, enps: null };
      }
      const notas: number[] = [];
      const nps: { valorNumerico: number | null }[] = [];
      for (const r of respostas) {
        for (const i of r.itens) {
          if (i.valorNumerico === null) continue;
          const tipo = tipoPorPergunta.get(i.perguntaId) ?? "";
          const n100 = paraNota100(tipo, i.valorNumerico);
          if (n100 !== null) notas.push(n100);
          if (tipo === "NPS_10") nps.push(i);
        }
      }
      return {
        setor,
        respostas: respostas.length,
        amostraInsuficiente,
        nota100: notas.length ? Math.round(notas.reduce((a, b) => a + b, 0) / notas.length) : null,
        enps: nps.length ? (calcularResultadoEnps(nps)?.score ?? null) : null,
      };
    })
    .sort((a, b) => {
      // Com número primeiro (do pior ao melhor — é por onde o gestor começa),
      // amostra insuficiente no fim.
      if (a.amostraInsuficiente !== b.amostraInsuficiente) return a.amostraInsuficiente ? 1 : -1;
      const va = a.enps ?? a.nota100 ?? 0;
      const vb = b.enps ?? b.nota100 ?? 0;
      return va - vb || b.respostas - a.respostas;
    });
}

function calcularTemas(ciclo: CicloParaAnalise): { total: number; temas: TemaComentario[] } {
  const tipoPorPergunta = new Map(ciclo.perguntas.map((p) => [p.id, p.tipo]));
  const pedeMelhoria = new Set(ciclo.perguntas.filter((p) => perguntaPedeMelhoria(p.enunciado)).map((p) => p.id));
  type Comentario = { texto: string; grupo: GrupoNota | null; pedido: boolean };
  const comentarios: Comentario[] = [];

  for (const r of ciclo.respostas) {
    const nota = r.itens.find((i) => tipoPorPergunta.get(i.perguntaId) === "NPS_10" && i.valorNumerico !== null);
    const grupo = nota ? grupoDaNota(nota.valorNumerico as number) : null;
    for (const i of r.itens) {
      if (tipoPorPergunta.get(i.perguntaId) !== "TEXT") continue;
      const t = (i.valorTexto ?? "").trim();
      // "ok", "nada", "-" não dizem nada e só inflariam a contagem.
      if (t.length < 4) continue;
      comentarios.push({ texto: t, grupo, pedido: pedeMelhoria.has(i.perguntaId) });
    }
  }

  const acumulado = new Map<string, { qtd: number; neg: number; pos: number; porGrupo: Record<GrupoNota, number>; textos: string[] }>();
  const SEM_TEMA = "Outros assuntos";
  for (const c of comentarios) {
    const temas = temasDoComentario(c.texto);
    const tom = tomDoComentario(c.texto, c.pedido);
    for (const tema of temas.length ? temas : [SEM_TEMA]) {
      const a = acumulado.get(tema) ?? { qtd: 0, neg: 0, pos: 0, porGrupo: { promotor: 0, neutro: 0, detrator: 0 }, textos: [] };
      a.qtd++;
      if (tom === "negativo") a.neg++;
      if (tom === "positivo") a.pos++;
      if (c.grupo) a.porGrupo[c.grupo]++;
      a.textos.push(c.texto);
      acumulado.set(tema, a);
    }
  }

  const temas = [...acumulado.entries()]
    .map(([tema, a]): TemaComentario => {
      const tom: Tom = a.neg > a.qtd * 0.6 ? "negativo" : a.pos > a.qtd * 0.6 ? "positivo" : "misto";
      // Exemplos: prioriza os mais explicativos (os mais longos), sem repetir.
      const exemplos = [...new Set(a.textos)]
        .sort((x, y) => y.length - x.length)
        .slice(0, 3)
        .map((t) => encurtar(t));
      return {
        tema,
        quantidade: a.qtd,
        percentual: comentarios.length ? Math.round((a.qtd / comentarios.length) * 100) : 0,
        tom,
        porGrupo: a.porGrupo,
        exemplos,
      };
    })
    .sort((a, b) => (a.tema === SEM_TEMA ? 1 : b.tema === SEM_TEMA ? -1 : b.quantidade - a.quantidade));

  return { total: comentarios.length, temas };
}

// ---------------------------------------------------------------------------
// Responsáveis sugeridos por tema — quem normalmente resolve, não ordem.

const RESPONSAVEL_POR_TEMA: Record<string, string> = {
  "Frota e veículos": "Gestão de Frota + Diretoria",
  "Ferramentas e equipamentos": "TI / Compras",
  "Salário e benefícios": "RH + Diretoria",
  "Liderança e gestão": "RH + gestores das áreas",
  "Ambiente e equipe": "Gestores das áreas",
  "Crescimento e reconhecimento": "RH (T&D)",
  "Carga de trabalho e escala": "Gestores das áreas + RH",
  "Comunicação": "RH + Diretoria",
  "Clientes e serviço": "Gestores operacionais",
};

function fmt(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

// ---------------------------------------------------------------------------
// Entrada principal

export function analisarPesquisa(entrada: EntradaAnalise): AnaliseGerencial {
  const atual = calcularBasico(entrada);
  const respostas = entrada.respostas.length;
  const nivelParticipacao = nivelDaParticipacao(atual.participacao);

  const escala: AnaliseGerencial["indicador"]["escala"] = atual.enps
    ? "enps"
    : atual.favorabilidade !== null
      ? "favorabilidade"
      : "nenhum";
  const valorIndicador = indicadorDe(atual);
  const indicador: AnaliseGerencial["indicador"] = {
    nome: escala === "enps" ? "eNPS" : escala === "favorabilidade" ? "Favorabilidade" : "Sem indicador numérico",
    valor: valorIndicador,
    escala,
    zona:
      escala === "enps"
        ? (atual.enps?.zona ?? null)
        : escala === "favorabilidade" && valorIndicador !== null
          ? classificarEmZona(valorIndicador, ZONAS_FAVORABILIDADE)
          : null,
  };

  // Pontos fortes e de atenção: perguntas de escala, comparadas em 0-100.
  // Com uma pergunta só (o eNPS), não há ranking a fazer — os pontos saem dos temas.
  const comNota = atual.perguntas.filter((p) => p.nota100 !== null && p.respondentes > 0);
  const pontosFortes: PontoDaAnalise[] = [];
  const pontosAtencao: PontoDaAnalise[] = [];
  if (comNota.length >= 2) {
    const ordenadas = [...comNota].sort((a, b) => (b.nota100 as number) - (a.nota100 as number));
    const n = Math.min(3, Math.floor(ordenadas.length / 2));
    for (const p of ordenadas.slice(0, n)) {
      pontosFortes.push({ titulo: p.enunciado, nota100: p.nota100 as number, detalhe: `média ${p.media?.toFixed(1)} · ${p.respondentes} resposta(s)` });
    }
    for (const p of ordenadas.slice(-n).reverse()) {
      pontosAtencao.push({ titulo: p.enunciado, nota100: p.nota100 as number, detalhe: `média ${p.media?.toFixed(1)} · ${p.respondentes} resposta(s)` });
    }
  }

  const { total: totalComentarios, temas } = calcularTemas(entrada);
  const temasNegativos = temas.filter((t) => t.tom !== "positivo" && t.tema !== "Outros assuntos");
  const temasPositivos = temas.filter((t) => t.tom === "positivo" && t.tema !== "Outros assuntos");

  if (comNota.length < 2) {
    // Assunto citado uma vez só é caso isolado, não ponto forte/fraco da empresa.
    for (const t of temasPositivos.filter((x) => x.quantidade >= 2).slice(0, 3)) {
      pontosFortes.push({ titulo: t.tema, nota100: t.percentual, detalhe: `citado em ${t.quantidade} comentário(s) (${t.percentual}%), tom predominantemente positivo` });
    }
    for (const t of temasNegativos.filter((x) => x.quantidade >= 2).slice(0, 3)) {
      pontosAtencao.push({ titulo: t.tema, nota100: t.percentual, detalhe: `citado em ${t.quantidade} comentário(s) (${t.percentual}%), ${t.tom === "negativo" ? "predominam críticas e pedidos de melhoria" : "opiniões divididas ou neutras"}` });
    }
  }

  const setores = calcularSetores(entrada);

  // Série histórica: anteriores (mais recente primeiro na entrada) + atual.
  const anteriores = (entrada.anteriores ?? []).map((c) => ({ ciclo: c, basico: calcularBasico(c) }));
  const serie: PontoDaSerie[] = [
    ...anteriores
      .slice()
      .reverse()
      .map(({ ciclo, basico }) => ({ titulo: ciclo.titulo, data: ciclo.data, participacao: basico.participacao, indicador: indicadorDe(basico) })),
    { titulo: entrada.titulo, data: entrada.data, participacao: atual.participacao, indicador: valorIndicador },
  ];

  let comparativo: AnaliseGerencial["comparativo"] = null;
  if (anteriores.length > 0) {
    const ant = anteriores[0];
    const indAnt = indicadorDe(ant.basico);
    const variacao = valorIndicador !== null && indAnt !== null ? valorIndicador - indAnt : null;
    comparativo = {
      tituloAnterior: ant.ciclo.titulo,
      indicadorAnterior: indAnt,
      variacao,
      participacaoAnterior: ant.basico.participacao,
      tendencia:
        variacao === null
          ? "sem_base"
          : variacao >= VARIACAO_RELEVANTE
            ? "melhora"
            : variacao <= -VARIACAO_RELEVANTE
              ? "queda"
              : "estavel",
    };
  }

  // ---- Resumo executivo (texto corrido, frase a frase) ----
  const resumo: string[] = [];
  if (respostas === 0) {
    resumo.push("A pesquisa ainda não recebeu respostas — não há o que analisar.");
  } else {
    resumo.push(
      `${respostas} de ${entrada.convites} convidados responderam (${atual.participacao}% de participação, ${
        nivelParticipacao === "boa" ? "boa adesão" : nivelParticipacao === "razoavel" ? "adesão razoável" : "adesão baixa"
      }).${nivelParticipacao === "baixa" ? " Com menos da metade respondendo, o resultado mostra a opinião de quem respondeu — não necessariamente a da empresa toda." : ""}`,
    );

    if (atual.enps) {
      const e = atual.enps;
      const pct = (n: number) => Math.round((n / e.total) * 100);
      resumo.push(
        `O eNPS ficou em ${fmt(e.score)}${e.zona ? ` (zona ${e.zona.rotulo})` : ""}: ${pct(e.promotores)}% promotores (nota 9-10), ${pct(e.neutros)}% neutros (7-8) e ${pct(e.detratores)}% detratores (0-6).`,
      );
    } else if (atual.favorabilidade !== null) {
      resumo.push(
        `A favorabilidade geral ficou em ${atual.favorabilidade}%${indicador.zona ? ` (zona ${indicador.zona.rotulo})` : ""} — a parcela de respostas 4 ou 5 nas perguntas de escala.`,
      );
    }

    if (comparativo && comparativo.variacao !== null) {
      const nome = indicador.nome;
      resumo.push(
        comparativo.tendencia === "melhora"
          ? `Em relação a "${comparativo.tituloAnterior}", o ${nome} subiu ${comparativo.variacao} pontos (${fmt(comparativo.indicadorAnterior as number)} → ${fmt(valorIndicador as number)}).`
          : comparativo.tendencia === "queda"
            ? `Em relação a "${comparativo.tituloAnterior}", o ${nome} caiu ${Math.abs(comparativo.variacao)} pontos (${fmt(comparativo.indicadorAnterior as number)} → ${fmt(valorIndicador as number)}) — sinal de alerta que pede investigação.`
            : `Em relação a "${comparativo.tituloAnterior}", o ${nome} ficou estável (variação de ${fmt(comparativo.variacao)} pontos).`,
      );
    } else if (!comparativo) {
      resumo.push("Não há ciclo anterior deste tipo para comparar — este resultado passa a ser a referência.");
    }

    if (totalComentarios > 0) {
      const principais = temas.filter((t) => t.tema !== "Outros assuntos").slice(0, 3);
      if (principais.length) {
        resumo.push(
          `Nos ${totalComentarios} comentários, os assuntos mais citados foram: ${principais
            .map((t) => `${t.tema} (${t.quantidade}, ${t.tom === "negativo" ? "a melhorar" : t.tom === "positivo" ? "elogio" : "neutro"})`)
            .join("; ")}.`,
        );
      }
    }

    const setoresComNumero = setores.filter((s) => !s.amostraInsuficiente);
    if (setoresComNumero.length >= 2) {
      const pior = setoresComNumero[0];
      const melhor = setoresComNumero[setoresComNumero.length - 1];
      const v = (s: SetorAnalisado) => (s.enps !== null ? `eNPS ${fmt(s.enps)}` : `${s.nota100}/100`);
      resumo.push(`Por setor, o resultado mais baixo é ${pior.setor} (${v(pior)}) e o mais alto, ${melhor.setor} (${v(melhor)}).`);
    }
  }

  // ---- Recomendações ----
  const recomendacoes: Recomendacao[] = [];
  if (respostas > 0) {
    if (nivelParticipacao === "baixa") {
      recomendacoes.push({
        prioridade: "alta",
        titulo: "Aumentar a participação no próximo ciclo",
        detalhe: `Só ${atual.participacao}% responderam. Reenviar o lembrete aos pendentes, pedir aos gestores que reforcem com a equipe e garantir que todos tenham Telegram ou e-mail cadastrado.`,
        responsavel: "RH + gestores das áreas",
      });
    }

    if (atual.enps) {
      const pctDet = Math.round((atual.enps.detratores / atual.enps.total) * 100);
      if (pctDet >= 20) {
        recomendacoes.push({
          prioridade: pctDet >= 30 ? "alta" : "media",
          titulo: "Conversar com os setores que concentram detratores",
          detalhe: `${pctDet}% deram nota 0-6. Fazer rodas de conversa (sem identificar ninguém) nos setores com eNPS mais baixo para entender as causas antes de decidir ações.`,
          responsavel: "RH + gestores das áreas",
        });
      }
    }

    for (const t of temasNegativos.slice(0, 3)) {
      if (t.quantidade < 2) continue;
      const detr = t.porGrupo.detrator;
      recomendacoes.push({
        prioridade: t.tom === "negativo" && t.percentual >= 10 ? "alta" : "media",
        titulo: `Tratar: ${t.tema}`,
        detalhe: `Citado em ${t.quantidade} comentário(s) (${t.percentual}%)${detr ? `, ${detr} deles de detratores` : ""}. Levantar o problema concreto, definir uma ação com prazo e dar retorno à equipe sobre o que será feito.`,
        responsavel: RESPONSAVEL_POR_TEMA[t.tema] ?? "RH",
      });
    }

    for (const s of setores.filter((x) => !x.amostraInsuficiente).slice(0, 2)) {
      const critico = (s.enps !== null && s.enps < 0) || (s.enps === null && s.nota100 !== null && s.nota100 < 60);
      if (!critico) continue;
      recomendacoes.push({
        prioridade: "alta",
        titulo: `Plano de ação no setor ${s.setor}`,
        detalhe: `Resultado abaixo do esperado (${s.enps !== null ? `eNPS ${fmt(s.enps)}` : `${s.nota100}/100`}, ${s.respostas} respostas). Reunião do RH com a liderança do setor e registro do plano em Planos de ação.`,
        responsavel: `Gestor do setor ${s.setor} + RH`,
      });
    }

    for (const p of pontosAtencao.slice(0, 2)) {
      if (comNota.length < 2 || p.nota100 >= 60) continue;
      recomendacoes.push({
        prioridade: "media",
        titulo: `Ponto fraco: ${encurtar(p.titulo, 80)}`,
        detalhe: `Nota ${p.nota100}/100 (${p.detalhe}). Investigar com as equipes e definir ação.`,
        responsavel: "RH",
      });
    }

    if (comparativo?.tendencia === "queda") {
      recomendacoes.push({
        prioridade: "alta",
        titulo: "Entender a queda em relação ao ciclo anterior",
        detalhe: `O ${indicador.nome} caiu ${Math.abs(comparativo.variacao ?? 0)} pontos. Cruzar com o que mudou no período (mudança de gestão, escala, pagamentos, frota) e apresentar à diretoria.`,
        responsavel: "RH + Diretoria",
      });
    }

    if (temasPositivos.length) {
      recomendacoes.push({
        prioridade: "baixa",
        titulo: `Manter e reconhecer: ${temasPositivos.slice(0, 2).map((t) => t.tema).join(" e ")}`,
        detalhe: "É o que a equipe mais elogia. Comunicar o resultado e reforçar essas práticas nos setores com nota mais baixa.",
        responsavel: "RH + Diretoria",
      });
    }

    recomendacoes.push({
      prioridade: "baixa",
      titulo: "Dar retorno do resultado à equipe",
      detalhe: "Compartilhar os números gerais e 2 ou 3 ações que serão tomadas. Pesquisa sem retorno derruba a participação do próximo ciclo.",
      responsavel: "RH + Diretoria",
    });
  }

  const ordemPrioridade = { alta: 0, media: 1, baixa: 2 };
  recomendacoes.sort((a, b) => ordemPrioridade[a.prioridade] - ordemPrioridade[b.prioridade]);

  return {
    titulo: entrada.titulo,
    modelo: entrada.modelo,
    convites: entrada.convites,
    respostas,
    participacao: atual.participacao,
    nivelParticipacao,
    indicador,
    enps: atual.enps,
    favorabilidade: atual.favorabilidade,
    perguntas: atual.perguntas,
    pontosFortes,
    pontosAtencao,
    setores,
    totalComentarios,
    temas,
    serie,
    comparativo,
    resumo,
    recomendacoes,
  };
}
