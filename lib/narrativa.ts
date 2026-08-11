// "O que aconteceu" — a abertura em prosa do Painel executivo.
//
// Generaliza o padrão de lib/clima.ts::gerarAnaliseExecutiva (veredito e pontos
// críticos em frases prontas, montadas só a partir de número medido) para fora
// do PDF do clima. Três famílias de fato, escolhidas porque funcionam sobre
// 100% do dado desta base — nenhuma depende de campo que ninguém preenche
// (motivoDesligamento: 0/137; Ausencia: 0 linhas) nem de tabela vazia:
//
//   1. pico de desligamento     — lib/anomalias.ts (Poisson contra a própria média)
//   2. saldo admissão−saída     — lib/bi.ts::movimentoMensal, somado pelo caller
//   3. sobrecarga de liderança  — lib/lideranca.ts (span of control)
//
// Regra central (a mesma da tela de Pendências): cada frase carrega a PRÓPRIA
// cobertura — "12 das 13 saídas com setor informado, 1 sem" — e quando a
// cobertura de setor do mês fica abaixo de COBERTURA_MINIMA_SETOR a frase
// desce um nível de granularidade: fala do CNPJ e diz por quê, em vez de
// apontar um setor por chute. A "causa provável" é sempre hipótese declarada,
// nunca afirmação — o número afirma, a leitura sugere.
//
// Funções puras, contrato de lib/bi.ts — recebem números já medidos e devolvem
// frases prontas. Nada aqui toca o Prisma.
import { hojeUTC } from "@/lib/datas";
import type { Anomalia } from "@/lib/anomalias";
import { ROTULO_FAIXA_SPAN, type MalhaDeLideranca } from "@/lib/lideranca";
import { ROTULO_SEM_GRUPO } from "@/lib/tempo-de-casa";

// ---------------------------------------------------------------
// Parâmetros
//
// Decisão registrada, não configuração de chamada — o mesmo motivo de
// lib/anomalias.ts: um corte que cada tela escolhe vira dois painéis
// discordando sobre o que é notícia.
// ---------------------------------------------------------------

/** Teto de fatos na abertura. Acima disso a prosa vira lista e ninguém lê o nono. */
export const MAXIMO_FATOS = 8;

/**
 * Abaixo desta cobertura de setor, a frase não aponta setor. 23 das 52 saídas
 * de 12 meses não têm setor nesta base — foi exatamente o buraco que derrubou o
 * quadrante clima × turnover (conclusão invertida). 70%: com menos que isso, o
 * setor "concentrador" pode ser artefato de quem preencheu o cadastro.
 */
export const COBERTURA_MINIMA_SETOR = 0.7;

/** Pico com mês dentro dos últimos N meses ainda é acionável — vira "crítica". Mais velho, é história: "alta". */
export const MESES_PARA_CRITICA = 3;

/**
 * Saldo negativo menor que isso é ruído de mês, não fato. É contagem, não taxa,
 * então NÃO há piso de ativos aqui de propósito: um CNPJ de 8 pessoas perdendo
 * 4 é justamente a notícia — a frase leva o tamanho do quadro junto para o
 * leitor dimensionar sozinho.
 */
export const SALDO_NEGATIVO_MINIMO = 3;

/** Crescimento líquido a partir do qual vale uma frase (informativa, nunca crítica). */
export const CRESCIMENTO_MINIMO = 5;

/** Encolhimento (% do quadro do início da janela) que sobe o saldo de "média" para "alta". */
export const ENCOLHIMENTO_ALTA_PCT = 15;

/**
 * Span a partir do qual a sobrecarga vira "crítica". Não é régua clássica de RH
 * (essa é o 16+ de lib/lideranca.ts): é o dobro do teto da zona de atenção,
 * para separar "acima da régua" (52 e 57 diretos no dado real) de "passou um
 * pouco" — os dois casos reais do grupo não são a mesma conversa que 17.
 */
export const SPAN_CRITICO = 30;

/** Só nomeia o setor concentrador quando ele responde por metade ou mais das saídas com setor — mesmo limiar de concentração de lib/anomalias.ts. */
const LIMIAR_CONCENTRACAO_SETOR = 0.5;

// ---------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------

export type GravidadeFato = "critica" | "alta" | "media";

/** Da mais grave para a menos — a ordem em que a tela lista. */
export const ORDEM_GRAVIDADE: GravidadeFato[] = ["critica", "alta", "media"];

/**
 * Para onde o botão do fato leva. A lib não monta URL — quem conhece rota é a
 * tela. `plano-acao` carrega o empresaId DA LINHA obrigatoriamente: plano de
 * ação e o cadastro de Setor são por CNPJ (seis "Área Técnica" no grupo), e
 * numa tela de marca o CNPJ da rota seria o errado.
 */
export type DestinoFato =
  | { tipo: "plano-acao"; empresaId: string; rotulo: string }
  | { tipo: "placar"; empresaId: string | null; rotulo: string }
  | { tipo: "lideranca"; rotulo: string };

export type FatoNarrado = {
  /** Chave estável para a lista da tela. */
  chave: string;
  familia: "pico" | "saldo" | "lideranca";
  gravidade: GravidadeFato;
  /** A frase com o número E a cobertura dele, pronta para a tela. */
  fato: string;
  /** Hipótese declarada como hipótese — derivada só do que foi medido. */
  causaProvavel: string;
  destino: DestinoFato;
};

export type Narrativa = {
  /** Por gravidade, no máximo MAXIMO_FATOS. */
  fatos: FatoNarrado[];
  /** Quantos existiam antes do teto — a tela diz quando cortou. */
  totalCandidatos: number;
  /** A frase do estado vazio — dizer "nada relevante" também é afirmação, então sai daqui com o critério junto. */
  fraseSemFatos: string;
  /** O que ficou fora de toda a leitura. Vai para a tela sem reescrita. */
  avisos: string[];
};

/** Um desligado COM data do mesmo recorte que alimentou o detector de anomalias — é o que dá a cobertura de setor de cada pico. */
export type DesligamentoParaNarrativa = {
  empresaId: string;
  marcaId: string;
  /** "MM/AAAA" — o mesmo formato de `Anomalia.mes`. */
  mes: string;
  setorNome: string;
};

export type SaldoEmpresaParaNarrativa = {
  empresaId: string;
  nome: string;
  /** Quadro atual do CNPJ. */
  ativos: number;
  /** Somas da janela, de `movimentoMensal` — a mesma série dos gráficos da tela. */
  admissoes: number;
  desligamentos: number;
  /** Desligados do CNPJ sem dataDesligamento: fora do saldo E do pico. */
  desligadosSemData: number;
};

// ---------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------

/**
 * Monta a abertura. Premissa documentada: `anomalias`, `desligamentos` e
 * `saldos` vêm do MESMO recorte de CNPJs (o filtro da tela); `malha` vem do
 * grupo inteiro, porque a liderança atravessa CNPJ (ver o aviso de escopo em
 * lib/lideranca.ts) — a frase de liderança declara isso.
 */
export function montarNarrativa(entrada: {
  janelaMeses: number;
  anomalias: Anomalia[];
  desligamentos: DesligamentoParaNarrativa[];
  saldos: SaldoEmpresaParaNarrativa[];
  malha: MalhaDeLideranca;
  hoje?: Date;
}): Narrativa {
  const hoje = entrada.hoje ?? hojeUTC();

  // O detector alerta o mesmo mês em até três níveis de propósito (grupo,
  // marca, CNPJ — três zooms para três leitores). A prosa conta cada mês UMA
  // vez, no nível mais acionável que alertou; o radar logo abaixo preserva os
  // zooms para quem quiser.
  const picos = picosSemZoomRepetido(entrada.anomalias);
  const cnpjsComPico = new Set(
    entrada.anomalias.filter(a => a.nivel === "empresa").map(a => a.unidadeId)
  );

  const candidatos: FatoNarrado[] = [
    ...picos.map(a => fatoDePico(a, entrada.desligamentos, hoje)),
    ...entrada.saldos.flatMap(s => fatoDeSaldo(s, entrada.janelaMeses, cnpjsComPico)),
    ...fatosDeLideranca(entrada.malha),
  ];

  // Sort estável: dentro da mesma gravidade fica a ordem de família
  // (pico → saldo → liderança), que é a ordem de urgência natural da leitura.
  const ordenados = [...candidatos].sort(
    (a, b) => ORDEM_GRAVIDADE.indexOf(a.gravidade) - ORDEM_GRAVIDADE.indexOf(b.gravidade)
  );

  const avisos: string[] = [];
  const semData = entrada.saldos.reduce((t, s) => t + s.desligadosSemData, 0);
  if (semData > 0) {
    avisos.push(
      `${semData} desligamento(s) sem data ficaram fora do pico e do saldo — sem mês, nenhuma série os conta.`
    );
  }
  if (entrada.malha.semNenhumSupervisorCadastrado) {
    avisos.push(
      "A leitura de liderança não pôde ser feita: nenhum ativo tem supervisor cadastrado. Ausência de fato aqui é falta de preenchimento, não estrutura saudável."
    );
  }

  return {
    fatos: ordenados.slice(0, MAXIMO_FATOS),
    totalCandidatos: ordenados.length,
    // O critério vai junto: "nada relevante" sem dizer o que foi testado é o
    // mesmo 0,0% que a tela de absenteísmo aprendeu a não imprimir.
    fraseSemFatos:
      `Nada fora do normal nas três leituras desta abertura: nenhum mês de desligamento acima da própria média, ` +
      `nenhum CNPJ com saldo além de −${SALDO_NEGATIVO_MINIMO - 1} em ${entrada.janelaMeses} meses e nenhum líder na faixa ` +
      `${ROTULO_FAIXA_SPAN.sobrecarga}. Os detalhes — inclusive o que não pôde ser testado — seguem nos blocos abaixo.`,
    avisos,
  };
}

// ---------------------------------------------------------------
// Família 1 — pico de desligamento
// ---------------------------------------------------------------

const PROFUNDIDADE_NIVEL: Record<string, number> = { empresa: 0, marca: 1, grupo: 2 };

function picosSemZoomRepetido(anomalias: Anomalia[]): Anomalia[] {
  const maisFundoPorMes = new Map<string, number>();
  for (const a of anomalias) {
    const prof = PROFUNDIDADE_NIVEL[a.nivel] ?? 0;
    const atual = maisFundoPorMes.get(a.mes);
    if (atual === undefined || prof < atual) maisFundoPorMes.set(a.mes, prof);
  }
  return anomalias.filter(a => (PROFUNDIDADE_NIVEL[a.nivel] ?? 0) === maisFundoPorMes.get(a.mes));
}

function mesesAtras(mes: string, hoje: Date): number {
  const partes = /^(\d{2})\/(\d{4})$/.exec(mes);
  if (!partes) return Number.MAX_SAFE_INTEGER;
  return (
    hoje.getUTCFullYear() * 12 +
    hoje.getUTCMonth() -
    (Number(partes[2]) * 12 + (Number(partes[1]) - 1))
  );
}

function fatoDePico(
  anomalia: Anomalia,
  desligamentos: DesligamentoParaNarrativa[],
  hoje: Date
): FatoNarrado {
  const doMes = desligamentos.filter(d => {
    if (d.mes !== anomalia.mes) return false;
    if (anomalia.nivel === "empresa") return d.empresaId === anomalia.unidadeId;
    if (anomalia.nivel === "marca") return d.marcaId === anomalia.unidadeId;
    return true;
  });

  // "Não definido" é o bucket de setor não atribuído (lib/tempo-de-casa.ts) —
  // para a cobertura ele conta como "sem setor", que é o que ele é.
  const comSetor = doMes.filter(d => d.setorNome !== ROTULO_SEM_GRUPO);
  const semSetor = Math.max(0, anomalia.observado - comSetor.length);
  const cobertura = anomalia.observado > 0 ? comSetor.length / anomalia.observado : 0;

  // A frase-fato reaproveita a do detector VERBATIM: é a mesma que o radar
  // mostra logo abaixo, e duas redações do mesmo número é como telas divergem.
  // Aqui só se acrescenta a cobertura de setor, que o detector não conhece.
  const trechoCobertura =
    semSetor === 0
      ? ` Das ${anomalia.observado} saídas, todas com setor informado.`
      : comSetor.length === 0
        ? ` Nenhuma das ${anomalia.observado} saídas tem setor informado.`
        : ` Das ${anomalia.observado} saídas, ${comSetor.length} com setor informado e ${semSetor} sem.`;

  let causa: string;
  if (cobertura < COBERTURA_MINIMA_SETOR) {
    // Cobertura baixa: a frase desce um nível de granularidade — fala da
    // unidade, não do setor — e diz o que destravaria o zoom.
    causa =
      `Só ${comSetor.length} das ${anomalia.observado} saídas do mês têm setor informado — abaixo de ` +
      `${Math.round(COBERTURA_MINIMA_SETOR * 100)}%, apontar setor seria inventar padrão. A leitura fica no nível ` +
      `${anomalia.nivel === "empresa" ? "do CNPJ" : anomalia.nivel === "marca" ? "da marca" : "do grupo"}; ` +
      `completar o setor dos desligamentos destrava o zoom.`;
  } else {
    const porSetor = new Map<string, number>();
    for (const d of comSetor) porSetor.set(d.setorNome, (porSetor.get(d.setorNome) ?? 0) + 1);
    const topo = [...porSetor.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topo && topo[1] >= comSetor.length * LIMIAR_CONCENTRACAO_SETOR) {
      causa =
        `${topo[1]} das ${comSetor.length} saídas com setor são de ${topo[0]} — concentração que aponta causa ` +
        `local (liderança, demanda ou corte do setor), não movimento espalhado. É por aí que um plano de ação começa.`;
    } else {
      causa =
        `As saídas com setor se espalham por ${porSetor.size} setores — padrão mais compatível com movimento ` +
        `da unidade inteira (contrato, sazonalidade, revisão de quadro) do que com problema de um setor.`;
    }
  }

  return {
    chave: `pico:${anomalia.nivel}:${anomalia.unidadeId}:${anomalia.mes}`,
    familia: "pico",
    gravidade: mesesAtras(anomalia.mes, hoje) < MESES_PARA_CRITICA ? "critica" : "alta",
    fato: `${anomalia.frase}${trechoCobertura}`,
    causaProvavel: causa,
    destino:
      anomalia.nivel === "empresa"
        ? { tipo: "plano-acao", empresaId: anomalia.unidadeId, rotulo: "Abrir plano de ação" }
        : { tipo: "placar", empresaId: null, rotulo: "Ver no placar" },
  };
}

// ---------------------------------------------------------------
// Família 2 — saldo por CNPJ
// ---------------------------------------------------------------

function fatoDeSaldo(
  s: SaldoEmpresaParaNarrativa,
  janelaMeses: number,
  cnpjsComPico: Set<string>
): FatoNarrado[] {
  const saldo = s.admissoes - s.desligamentos;
  // A mesma reconstrução retroativa de lib/bi.ts::calcularTurnover — por isso o
  // "~": é cálculo a partir do quadro de hoje, não foto guardada.
  const inicio = Math.max(0, s.ativos - saldo);
  const trechoSemData =
    s.desligadosSemData > 0
      ? ` ${s.desligadosSemData} desligado(s) sem data não entram nesta conta.`
      : "";

  if (saldo <= -SALDO_NEGATIVO_MINIMO) {
    const perdaPct = inicio > 0 ? (Math.abs(saldo) / inicio) * 100 : 100;
    return [
      {
        chave: `saldo:${s.empresaId}`,
        familia: "saldo",
        gravidade: perdaPct >= ENCOLHIMENTO_ALTA_PCT ? "alta" : "media",
        fato:
          `Em ${janelaMeses} meses, a ${s.nome} encolheu de ~${inicio} para ${s.ativos} ativos: ` +
          `${s.admissoes} admissão(ões) contra ${s.desligamentos} desligamento(s).${trechoSemData}`,
        causaProvavel: cnpjsComPico.has(s.empresaId)
          ? "O radar acusa pico de desligamento neste CNPJ — a perda não é gradual, está concentrada no(s) mês(es) do alerta; a causa mora no que aconteceu lá."
          : "Sem pico isolado no radar para este CNPJ: saída constante acima da reposição — padrão de desidratação contínua, não de evento único.",
        destino: { tipo: "placar", empresaId: s.empresaId, rotulo: "Ver no placar" },
      },
    ];
  }

  if (saldo >= CRESCIMENTO_MINIMO) {
    return [
      {
        chave: `saldo:${s.empresaId}`,
        familia: "saldo",
        gravidade: "media",
        fato:
          `Em ${janelaMeses} meses, a ${s.nome} cresceu de ~${inicio} para ${s.ativos} ativos: ` +
          `${s.admissoes} admissão(ões) contra ${s.desligamentos} desligamento(s).${trechoSemData}`,
        causaProvavel:
          "Contratação acima das saídas. Quadro novo concentra risco de saída precoce — a régua disso é o bloco de tempo de casa, não este.",
        destino: { tipo: "placar", empresaId: s.empresaId, rotulo: "Ver no placar" },
      },
    ];
  }

  return [];
}

// ---------------------------------------------------------------
// Família 3 — sobrecarga de liderança
// ---------------------------------------------------------------

function fatosDeLideranca(malha: MalhaDeLideranca): FatoNarrado[] {
  // Sem cadastro não há fato NEM absolvição — o aviso da narrativa cobre isso.
  if (malha.totalAtivos === 0 || malha.semNenhumSupervisorCadastrado) return [];

  const sobrecarregados = malha.lideres.filter(l => l.faixa === "sobrecarga");
  if (sobrecarregados.length === 0) return [];

  const nomeados = sobrecarregados
    .slice(0, 3)
    .map(l => `${l.nome} (${l.diretos} diretos em ${l.cnpjsSob} CNPJ${l.cnpjsSob === 1 ? "" : "s"})`);
  const excedente = sobrecarregados.length - nomeados.length;
  const carregam = sobrecarregados.reduce((t, l) => t + l.diretos, 0);
  const { cobertura } = malha;
  const trechoCobertura =
    cobertura.semSupervisor > 0
      ? ` ${cobertura.semSupervisor} dos ${cobertura.totalAtivos} ativos não têm supervisor cadastrado e ficam fora de qualquer span — o número real pode ser maior.`
      : "";

  return [
    {
      chave: "lideranca:sobrecarga",
      familia: "lideranca",
      gravidade: sobrecarregados.some(l => l.diretos >= SPAN_CRITICO) ? "critica" : "alta",
      fato:
        `${sobrecarregados.length} líder(es) na faixa ${ROTULO_FAIXA_SPAN.sobrecarga}: ${nomeados.join("; ")}` +
        `${excedente > 0 ? ` e mais ${excedente}` : ""} — juntos carregam ${carregam} dos ${malha.concentracao.liderados} ` +
        `liderados mapeados.${trechoCobertura}`,
      causaProvavel:
        (malha.concentracao.informativa
          ? `Estrutura, não desempenho: ${Math.round(malha.concentracao.pct)}% de quem tem líder está nas mãos de ` +
            `${malha.concentracao.topN} pessoas — falta camada intermediária de supervisão. `
          : "Falta camada intermediária de supervisão. ") +
        "Medido sempre no grupo inteiro, porque a malha atravessa CNPJ — no recorte de um CNPJ esses spans nem apareceriam.",
      destino: { tipo: "lideranca", rotulo: "Abrir malha de liderança" },
    },
  ];
}
