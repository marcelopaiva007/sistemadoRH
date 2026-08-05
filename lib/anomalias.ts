// Detecção de anomalia em desligamento: cada unidade é comparada COM ELA MESMA,
// e não com um limiar escrito à mão.
//
// O sistema já tem limiar fixo espalhado — turnover > 20%, absenteísmo > 3%,
// "3 desligamentos em 90 dias" (lib/alertas.ts, AL10). Limiar fixo erra dos dois
// lados num grupo heterogêneo: 3 saídas em 90 dias é catástrofe num CNPJ de 8
// pessoas e ruído num de 100. Em junho/2026 o grupo teve 13 desligamentos contra
// média de 3,5 dos 12 meses anteriores e nenhum limiar fixo piscou.
//
// O teste é Poisson: P(X >= observado | lambda = média dos 12 meses anteriores).
// Poisson é o modelo de contagem de evento raro e não exige amostra grande — que
// é exatamente a restrição aqui (215 ativos no grupo inteiro). A janela é móvel e
// NÃO inclui o mês avaliado: incluir faria o próprio pico puxar para cima a média
// que deveria denunciá-lo.
//
// Funções puras, mesmo contrato de lib/bi.ts — recebem a série mensal já montada
// (o formato que `movimentoMensal` produz) e devolvem o alerta pronto, frase
// inclusive. Nada aqui toca o Prisma.
//
// NÍVEIS QUE NÃO ENTRAM (decisão medida no backup de 04/08/2026):
//   • Setor e cargo. Não é só que 68% dos desligados estão em "Não definido" — é
//     que o preenchimento MELHOROU com o tempo (2024: 36 de 37 desligados sem
//     setor; 2026: 14 de 41). Baseline histórico de qualquer setor sai
//     artificialmente baixo por isso, e TODO setor viraria falso positivo
//     estrutural — o alerta acusaria a melhora do cadastro, não a saída de gente.
//     `NivelUnidade` aceita os dois para quando o cadastro estabilizar, mas nada
//     aqui monta unidade desse nível.
//   • Líder. 1 de 137 desligados tem `supervisorId` preenchido. Não há série.
//   • Série de admissões. 128 de 137 desligados não têm `dataAdmissao`, então
//     "17 admissões em abril" na verdade é "17 admitidos em abril que ainda estão
//     aqui" — outro número com o mesmo rótulo. Por isso este motor lê só
//     `desligamentos` da série mensal e ignora `admissoes` de propósito.
import { hojeUTC, somarMesesUTC } from "@/lib/datas";

// ---------------------------------------------------------------
// Parâmetros do teste
//
// São decisão registrada, não configuração de chamada: um limiar que cada tela
// escolhe volta a ser o problema que este arquivo existe para resolver.
// ---------------------------------------------------------------

/**
 * p < 2% para disparar, e não os 5% de praxe: uma rodada completa testa ~18
 * meses × ~7 unidades = ~126 pares, então 5% renderia ~6 alertas só por acaso e a
 * tela nasceria ruído. Mesmo a 2% sobram ~2,5 esperados por acaso — quem segura o
 * resto é o piso de excesso abaixo. Nenhum dos dois cortes basta sozinho.
 */
export const P_MAXIMO = 0.02;

/** Janela de baseline: 12 meses anteriores ao avaliado (absorve sazonalidade de fim de ano). */
export const BASELINE_MESES = 12;

/** Abaixo disso a média não descreve nada: unidade nova não gera alerta, gera rótulo. */
export const BASELINE_MINIMO_MESES = 6;

/** Piso de ativos na unidade. Elimina VAPT (7 ativos) e Mobility Tech (4) por decisão, não por acidente. */
export const PISO_ATIVOS = 15;

/**
 * Quantas saídas ACIMA da média o mês precisa ter para virar alerta, além de
 * passar no p. Significância estatística não é tamanho: no dado real de
 * 04/08/2026, "4 desligamentos na RSM contra 1,0 de média" dá p = 0,019 e passa
 * no teste, mas são 3 pessoas a mais do que o normal num CNPJ de 68 — o gestor
 * responde "foi coincidência" e está certo com frequência suficiente para o
 * alerta perder crédito. O corte separa os dois grupos com folga no dado real:
 * os picos que interessam ficam em excesso 4,4 a 9,8; os marginais, em 2,7 a 3,0.
 * Comparação com a média CRUA de propósito — o piso de lambda existe para o p
 * não mentir, não para inflar o tamanho do evento.
 */
export const EXCESSO_MINIMO = 4;

/** Só nomeia o CNPJ concentrador quando ele sozinho responde por metade ou mais do mês. */
const LIMIAR_CONCENTRACAO = 0.5;

const MESES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

// ---------------------------------------------------------------
// Cauda superior de Poisson
// ---------------------------------------------------------------

/** ln(n!) somado termo a termo — n aqui é contagem de desligamento no mês, nunca passa de dezenas. */
function logFatorial(n: number): number {
  let soma = 0;
  for (let k = 2; k <= n; k++) soma += Math.log(k);
  return soma;
}

/**
 * P(X >= observado | X ~ Poisson(lambda)).
 *
 * Soma a PMF a partir de `observado` para cima em vez de fazer 1 − P(X < obs):
 * a segunda forma perde os dígitos que importam justamente quando o p é pequeno,
 * que é o único caso em que este número decide alguma coisa. O primeiro termo sai
 * em logaritmo (evita `lambda^k` e `k!` estourarem separados) e os seguintes vêm
 * da recorrência `termo *= lambda / k`, que não recalcula fatorial nenhum.
 *
 * `lambda <= 0` devolve 0 para qualquer observação — matematicamente correto (a
 * hipótese nula diz que o evento é impossível) e operacionalmente inútil. Quem
 * chama aplica o piso de lambda ANTES; ver `lambdaComPiso`.
 */
export function caudaSuperiorPoisson(observado: number, lambda: number): number {
  if (observado <= 0) return 1;
  if (!Number.isFinite(lambda) || lambda <= 0) return 0;

  let termo = Math.exp(observado * Math.log(lambda) - lambda - logFatorial(observado));
  if (!Number.isFinite(termo) || termo === 0) return termo === 0 ? 0 : 1;

  let soma = termo;
  // Depois de k > lambda a razão lambda/k < 1 e a série decai; o corte por
  // relevância termina o laço bem antes do teto, que só existe para o caso
  // patológico de lambda enorme.
  for (let k = observado + 1; k <= observado + 10_000; k++) {
    termo = (termo * lambda) / k;
    if (termo < soma * 1e-15) break;
    soma += termo;
  }
  return Math.min(1, soma);
}

/**
 * Histórico zerado não é prova de que o evento é impossível — é prova de que nada
 * aconteceu em N meses. O piso equivale a "um único evento poderia ter caído na
 * janela inteira", que é o máximo que o dado autoriza a afirmar. Sem ele, lambda
 * = 0 devolveria p = 0 e qualquer primeira saída de qualquer unidade viraria
 * alerta com certeza absoluta.
 */
function lambdaComPiso(media: number, mesesDeBaseline: number): number {
  return Math.max(media, 1 / mesesDeBaseline);
}

// ---------------------------------------------------------------
// Unidades monitoradas
// ---------------------------------------------------------------

/**
 * "setor" e "cargo" existem no tipo mas nada neste arquivo os monta — ver o
 * bloco de decisão no topo antes de abrir essa porta.
 */
export type NivelUnidade = "grupo" | "marca" | "empresa" | "setor" | "cargo";

/** Um ponto da série mensal. Compatível com a saída de `lib/bi.ts::movimentoMensal` — `admissoes` sobra e é ignorado de propósito. */
export type PontoSerie = { mes: string; desligamentos: number };

export type UnidadeMonitorada = {
  nivel: NivelUnidade;
  id: string;
  nome: string;
  /** Unidade que a contém (marca de um CNPJ, grupo de uma marca). `null` no topo. */
  paiId: string | null;
  /** Ativos HOJE — é o que decide o piso de amostra. */
  ativos: number;
  /** Do mês mais antigo ao mais recente, sem buraco. */
  serie: PontoSerie[];
};

export type MotivoIgnorada = "AMOSTRA_PEQUENA" | "SEM_BASELINE" | "REDUNDANTE";

export type UnidadeIgnorada = {
  nivel: NivelUnidade;
  unidadeId: string;
  unidadeNome: string;
  motivo: MotivoIgnorada;
  /** Frase pronta para a tela mostrar ao lado da unidade, em vez de sumir com ela. */
  rotulo: string;
};

export type ForaDoRecorte = {
  /** Desligados sem `dataDesligamento`: existem, saíram, mas não têm mês — nenhuma série os enxerga. */
  desligamentosSemData: number;
  /** Com data, porém fora da janela da série. */
  desligamentosForaDaJanela: number;
};

export type Anomalia = {
  /** A frase como vai na tela. */
  frase: string;
  /** "06/2026", mesmo formato da série — é a chave do link. */
  mes: string;
  mesRotulo: string;
  nivel: NivelUnidade;
  unidadeId: string;
  unidadeNome: string;
  observado: number;
  /** Média dos meses de baseline, crua (sem o piso de lambda). */
  esperado: number;
  /** Lambda usado no teste: `esperado` já com o piso aplicado. */
  esperadoUsado: number;
  p: number;
  mesesDeBaseline: number;
  /** Mês avaliado ainda em curso — comparado contra meses fechados. */
  mesIncompleto: boolean;
  /** CNPJ que concentra o mês, quando concentra. */
  concentracao: { nome: string; desligamentos: number } | null;
};

export type ResultadoAnomalias = {
  /** Mais recente primeiro; empate no mês vai pelo p menor. */
  anomalias: Anomalia[];
  unidadesAvaliadas: number;
  mesesAvaliadosPorUnidade: number;
  ignoradas: UnidadeIgnorada[];
  foraDoRecorte: ForaDoRecorte;
  /** Frases prontas do que ficou de fora. Calar sobre o excluído é como o número mente. */
  avisos: string[];
};

// ---------------------------------------------------------------
// Detecção
// ---------------------------------------------------------------

function rotuloDoMes(mes: string): string {
  const partes = /^(\d{2})\/(\d{4})$/.exec(mes);
  if (!partes) return mes;
  return `${MESES_PT[Number(partes[1]) - 1] ?? partes[1]}/${partes[2]}`;
}

function mesDaData(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

function comVirgula(n: number, casas = 1): string {
  return n.toFixed(casas).replace(".", ",");
}

function nomeNaFrase(unidade: UnidadeMonitorada): string {
  if (unidade.nivel === "grupo") return "no grupo";
  if (unidade.nivel === "marca") return `na marca ${unidade.nome}`;
  return `na ${unidade.nome}`;
}

/** Todas as unidades de CNPJ abaixo de `raiz` (ela mesma não entra). */
function cnpjsAbaixo(raiz: UnidadeMonitorada, unidades: UnidadeMonitorada[]): UnidadeMonitorada[] {
  const porPai = new Map<string, UnidadeMonitorada[]>();
  for (const u of unidades) {
    if (!u.paiId) continue;
    porPai.set(u.paiId, [...(porPai.get(u.paiId) ?? []), u]);
  }
  const achados: UnidadeMonitorada[] = [];
  const fila = [...(porPai.get(raiz.id) ?? [])];
  while (fila.length > 0) {
    const atual = fila.shift()!;
    if (atual.nivel === "empresa") achados.push(atual);
    fila.push(...(porPai.get(atual.id) ?? []));
  }
  return achados;
}

/**
 * Marca com um único CNPJ (Centrysol, VAPT, Mobility) descreve exatamente as
 * mesmas pessoas que o CNPJ. Avaliar os dois faria o mesmo mês virar dois alertas
 * com nomes quase iguais — o jeito mais rápido de o time aprender a ignorar a
 * tela. Fica o nível mais alto, some o filho (mas ele continua na lista, para
 * ainda servir de composição do mês).
 */
function ehRedundante(unidade: UnidadeMonitorada, unidades: UnidadeMonitorada[]): boolean {
  if (!unidade.paiId) return false;
  return unidades.filter(u => u.paiId === unidade.paiId).length === 1;
}

/**
 * Roda o teste em todas as unidades e devolve os alertas prontos.
 *
 * Máximo de 1 alerta por unidade por mês: cada par (unidade, mês) é testado uma
 * vez só, e a chave de deduplicação está explícita porque a lista de entrada pode
 * trazer a mesma unidade repetida de duas origens.
 *
 * O MESMO mês pode aparecer em mais de um nível (junho/2026 sai no grupo, na
 * marca e no CNPJ) e isso é de propósito: cada nível tem leitor diferente — a
 * tela filtra pelo escopo de quem olha (lib/escopo-marca.ts, matriz de papéis), e
 * suprimir o nível do meio deixaria a diretoria de uma marca sem alerta nenhum
 * sobre o pico da própria marca. Quem enxerga os três lê a mesma história em três
 * zooms, com a frase do nível de cima já nomeando o CNPJ que concentra.
 */
export function detectarAnomalias(
  unidades: UnidadeMonitorada[],
  opcoes: { hoje?: Date; foraDoRecorte?: ForaDoRecorte } = {}
): ResultadoAnomalias {
  const hoje = opcoes.hoje ?? hojeUTC();
  const foraDoRecorte = opcoes.foraDoRecorte ?? {
    desligamentosSemData: 0,
    desligamentosForaDaJanela: 0,
  };
  const mesAtual = mesDaData(hoje);
  const ultimoDiaDoMes = new Date(
    Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 0)
  ).getUTCDate();

  const anomalias: Anomalia[] = [];
  const ignoradas: UnidadeIgnorada[] = [];
  const jaAlertado = new Set<string>();
  let avaliadas = 0;
  let mesesAvaliadosPorUnidade = 0;

  for (const unidade of unidades) {
    if (ehRedundante(unidade, unidades)) {
      ignoradas.push({
        nivel: unidade.nivel,
        unidadeId: unidade.id,
        unidadeNome: unidade.nome,
        motivo: "REDUNDANTE",
        rotulo: "mesma gente da unidade acima — alerta sairia duplicado",
      });
      continue;
    }
    if (unidade.ativos < PISO_ATIVOS) {
      ignoradas.push({
        nivel: unidade.nivel,
        unidadeId: unidade.id,
        unidadeNome: unidade.nome,
        motivo: "AMOSTRA_PEQUENA",
        rotulo: `amostra pequena: ${unidade.ativos} ativos, piso de ${PISO_ATIVOS}`,
      });
      continue;
    }
    if (unidade.serie.length <= BASELINE_MINIMO_MESES) {
      ignoradas.push({
        nivel: unidade.nivel,
        unidadeId: unidade.id,
        unidadeNome: unidade.nome,
        motivo: "SEM_BASELINE",
        rotulo: "célula nova, sem baseline",
      });
      continue;
    }

    avaliadas++;
    mesesAvaliadosPorUnidade = Math.max(
      mesesAvaliadosPorUnidade,
      unidade.serie.length - BASELINE_MINIMO_MESES
    );

    for (let i = BASELINE_MINIMO_MESES; i < unidade.serie.length; i++) {
      const ponto = unidade.serie[i];
      const baseline = unidade.serie.slice(Math.max(0, i - BASELINE_MESES), i);
      if (baseline.length < BASELINE_MINIMO_MESES) continue;

      const chave = `${unidade.nivel}:${unidade.id}:${ponto.mes}`;
      if (jaAlertado.has(chave)) continue;

      const esperado = baseline.reduce((t, b) => t + b.desligamentos, 0) / baseline.length;
      if (ponto.desligamentos - esperado < EXCESSO_MINIMO) continue;

      const esperadoUsado = lambdaComPiso(esperado, baseline.length);
      const p = caudaSuperiorPoisson(ponto.desligamentos, esperadoUsado);
      if (p >= P_MAXIMO) continue;

      jaAlertado.add(chave);

      const filhos = cnpjsAbaixo(unidade, unidades)
        .map(f => ({
          nome: f.nome,
          desligamentos: f.serie.find(s => s.mes === ponto.mes)?.desligamentos ?? 0,
        }))
        .sort((a, b) => b.desligamentos - a.desligamentos);
      const topo = filhos[0];
      const concentracao =
        topo &&
        topo.desligamentos >= ponto.desligamentos * LIMIAR_CONCENTRACAO &&
        topo.desligamentos > 0
          ? topo
          : null;

      const mesIncompleto = ponto.mes === mesAtual && hoje.getUTCDate() < ultimoDiaDoMes;
      const trechoConcentracao = concentracao
        ? ` — ${concentracao.desligamentos} dos ${ponto.desligamentos} na ${concentracao.nome}`
        : "";
      const trechoIncompleto = mesIncompleto
        ? " (mês ainda em curso, comparado com meses fechados)"
        : "";
      // "contra ~0,0 esperados" seria uma frase estranha e mais fraca do que o
      // fato: a unidade não tinha histórico de saída nenhuma.
      const trechoEsperado =
        esperado > 0
          ? `contra ~${comVirgula(esperado)} esperados pela própria média dos ${baseline.length} meses anteriores`
          : `contra nenhum nos ${baseline.length} meses anteriores`;
      const frase =
        `${rotuloDoMes(ponto.mes)}: ${ponto.desligamentos} desligamentos ${nomeNaFrase(unidade)} ` +
        `${trechoEsperado}${trechoConcentracao}.${trechoIncompleto}`;

      anomalias.push({
        frase,
        mes: ponto.mes,
        mesRotulo: rotuloDoMes(ponto.mes),
        nivel: unidade.nivel,
        unidadeId: unidade.id,
        unidadeNome: unidade.nome,
        observado: ponto.desligamentos,
        esperado,
        esperadoUsado,
        p,
        mesesDeBaseline: baseline.length,
        mesIncompleto,
        concentracao,
      });
    }
  }

  anomalias.sort((a, b) => ordemDoMes(b.mes) - ordemDoMes(a.mes) || a.p - b.p);

  return {
    anomalias,
    unidadesAvaliadas: avaliadas,
    mesesAvaliadosPorUnidade,
    ignoradas,
    foraDoRecorte,
    avisos: montarAvisos(ignoradas, foraDoRecorte),
  };
}

function ordemDoMes(mes: string): number {
  const partes = /^(\d{2})\/(\d{4})$/.exec(mes);
  return partes ? Number(partes[2]) * 12 + Number(partes[1]) : 0;
}

function montarAvisos(ignoradas: UnidadeIgnorada[], fora: ForaDoRecorte): string[] {
  const avisos: string[] = [];

  if (fora.desligamentosSemData > 0) {
    avisos.push(
      `${fora.desligamentosSemData} desligamentos sem data ficaram fora de toda a análise — não têm mês para comparar.`
    );
  }
  if (fora.desligamentosForaDaJanela > 0) {
    avisos.push(
      `${fora.desligamentosForaDaJanela} desligamentos com data anterior à janela da série ficaram de fora.`
    );
  }

  const pequenas = ignoradas.filter(i => i.motivo === "AMOSTRA_PEQUENA");
  if (pequenas.length > 0) {
    avisos.push(
      `Fora do teste por amostra pequena (menos de ${PISO_ATIVOS} ativos): ${pequenas.map(i => i.unidadeNome).join(", ")}. ` +
        "Não é ausência de risco — é falta de gente suficiente para o teste dizer alguma coisa."
    );
  }

  const novas = ignoradas.filter(i => i.motivo === "SEM_BASELINE");
  if (novas.length > 0) {
    avisos.push(
      `Sem baseline (célula nova, menos de ${BASELINE_MINIMO_MESES} meses de série): ${novas.map(i => i.unidadeNome).join(", ")}.`
    );
  }

  return avisos;
}

// ---------------------------------------------------------------
// Montagem das unidades a partir dos vínculos
// ---------------------------------------------------------------

export type VinculoParaAnomalia = {
  empresaId: string;
  empresaNome: string;
  marcaId: string;
  marcaNome: string;
  ativo: boolean;
  dataDesligamento: Date | null;
};

export const ID_GRUPO = "grupo";

/**
 * Monta grupo → marca → CNPJ com a série mensal de desligamentos de cada um.
 *
 * Devolve TODAS as unidades, inclusive as que o detector vai descartar: a
 * unidade descartada continua servindo para explicar a composição do mês de quem
 * alertou ("11 dos 13 na RSM"), e sumir com ela aqui esconderia isso.
 *
 * 24 meses por padrão: o baseline come 12, então uma série de 12 não avaliaria
 * mês nenhum.
 */
export function montarUnidadesDeDesligamento(
  vinculos: VinculoParaAnomalia[],
  hoje: Date = hojeUTC(),
  meses = 24
): { unidades: UnidadeMonitorada[]; foraDoRecorte: ForaDoRecorte } {
  const chavesDaJanela: string[] = [];
  for (let i = meses - 1; i >= 0; i--) chavesDaJanela.push(mesDaData(somarMesesUTC(hoje, -i)));
  const indiceDoMes = new Map(chavesDaJanela.map((chave, i) => [chave, i]));

  type Acumulador = {
    nivel: NivelUnidade;
    id: string;
    nome: string;
    paiId: string | null;
    ativos: number;
    contagem: number[];
  };
  // Chave inclui o nível: marca e CNPJ de mesmo nome (Centrysol, VAPT) são
  // unidades diferentes, e um id repetido entre níveis não pode fundir as duas.
  const acumuladores = new Map<string, Acumulador>();
  const garantir = (
    nivel: NivelUnidade,
    id: string,
    nome: string,
    paiId: string | null
  ): Acumulador => {
    const chave = `${nivel}:${id}`;
    const atual = acumuladores.get(chave);
    if (atual) return atual;
    const novo: Acumulador = {
      nivel,
      id,
      nome,
      paiId,
      ativos: 0,
      contagem: new Array<number>(meses).fill(0),
    };
    acumuladores.set(chave, novo);
    return novo;
  };

  let desligamentosSemData = 0;
  let desligamentosForaDaJanela = 0;

  for (const v of vinculos) {
    const grupo = garantir("grupo", ID_GRUPO, "Grupo", null);
    const marca = garantir("marca", v.marcaId, v.marcaNome, ID_GRUPO);
    const empresa = garantir("empresa", v.empresaId, v.empresaNome, v.marcaId);

    if (v.ativo) {
      grupo.ativos++;
      marca.ativos++;
      empresa.ativos++;
      continue;
    }

    if (!v.dataDesligamento) {
      desligamentosSemData++;
      continue;
    }
    const i = indiceDoMes.get(mesDaData(v.dataDesligamento));
    if (i === undefined) {
      desligamentosForaDaJanela++;
      continue;
    }
    grupo.contagem[i]++;
    marca.contagem[i]++;
    empresa.contagem[i]++;
  }

  // Grupo primeiro, depois marcas, depois CNPJs — a ordem em que a tela lista e
  // a ordem em que os "ignorados" fazem sentido de ler.
  const ordemNivel: NivelUnidade[] = ["grupo", "marca", "empresa"];
  const unidades = [...acumuladores.values()]
    .sort(
      (a, b) =>
        ordemNivel.indexOf(a.nivel) - ordemNivel.indexOf(b.nivel) ||
        a.nome.localeCompare(b.nome, "pt-BR")
    )
    .map(a => ({
      nivel: a.nivel,
      id: a.id,
      nome: a.nome,
      paiId: a.paiId,
      ativos: a.ativos,
      serie: chavesDaJanela.map((mes, i) => ({ mes, desligamentos: a.contagem[i] })),
    }));

  return { unidades, foraDoRecorte: { desligamentosSemData, desligamentosForaDaJanela } };
}

/** Atalho de tela: dos vínculos crus aos alertas prontos, com o que ficou de fora junto. */
export function analisarDesligamentos(
  vinculos: VinculoParaAnomalia[],
  hoje: Date = hojeUTC(),
  meses = 24
): ResultadoAnomalias {
  const { unidades, foraDoRecorte } = montarUnidadesDeDesligamento(vinculos, hoje, meses);
  return detectarAnomalias(unidades, { hoje, foraDoRecorte });
}
