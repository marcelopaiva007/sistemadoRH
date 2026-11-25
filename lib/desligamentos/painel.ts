// O motor da área Desligamentos (Gestão → Desligamentos) — funções puras, sem
// Prisma, no estilo de lib/bi.ts: recebem as fichas já marcadas
// (lib/desligamentos/base.ts) e devolvem números prontos para a tela.
//
// Regras fixas da área (ordem de serviço do CEO, 25/11/2026):
// - meta anual de desligamento de 10% do quadro médio, limite de 15%, e custo
//   mínimo de R$ 4.000 por desligamento — os três editáveis por cliente
//   (ConfiguracaoDesligamentos), com estes valores como padrão;
// - nada por CNPJ: toda análise é por setor e por gestor;
// - transferência entre empresas do grupo não é desligamento nem admissão
//   (as marcas vêm de lib/transferencia.ts);
// - "cada gestor é responsável pela equipe que tem — contratar bem para
//   demitir menos".
//
// Uma régua só: o turnover de qualquer recorte sai de `turnoverNoPeriodo`
// (lib/bi.ts), a mesma conta do Painel executivo, do Placar e do Painel do
// setor. Um setor nunca mostra aqui um número e lá outro.
import { movimentoMensal, turnoverNoPeriodo, type VinculoParaTurnover } from "@/lib/bi";
import { somarAnosUTC, somarMesesUTC } from "@/lib/datas";

export const CONFIG_PADRAO = {
  custoPorDesligamento: 4000,
  metaPct: 10,
  limitePct: 15,
} as const;

export type ConfigDaArea = {
  /** Em reais. Guardado em centavos no banco. */
  custoPorDesligamento: number;
  metaPct: number;
  limitePct: number;
  /** false = nenhuma linha gravada ainda: a tela mostra os padrões e diz que são padrões. */
  personalizada: boolean;
};

/** De onde veio o gestor de uma ficha — a tela diz, para ninguém confundir palpite com cadastro. */
export type OrigemDoGestor = "retrato" | "lider" | "lider_do_setor" | "gestor_do_setor" | "sem_gestor";

export const ROTULO_ORIGEM_GESTOR: Record<OrigemDoGestor, string> = {
  retrato: "líder no dia da saída",
  lider: "líder no cadastro",
  lider_do_setor: "principal líder do setor",
  gestor_do_setor: "gestor do setor no sistema",
  sem_gestor: "sem gestor no cadastro",
};

/** Origens que são dedução pelo setor, não um vínculo da pessoa com o gestor. */
export function origemPeloSetor(origem: OrigemDoGestor): boolean {
  return origem === "lider_do_setor" || origem === "gestor_do_setor";
}

export type FichaDoPainel = VinculoParaTurnover & {
  id: string;
  /** Só para o link da ficha — nenhuma conta da área separa por CNPJ. */
  empresaId: string;
  nome: string;
  ativo: boolean;
  cargo: string;
  /** Setor em que a ficha CONTA (retrato da época para quem tem — ver setorParaContas). */
  setor: string;
  chaveSetor: string;
  gestorChave: string;
  gestorNome: string;
  gestorOrigem: OrigemDoGestor;
  /** Admissão no GRUPO — base do tempo de casa (a transferência não zera). */
  inicioNoGrupo: Date | null;
  motivoDesligamento: string | null;
  causaDesligamento: string | null;
  saidaPorTransferencia: boolean;
  entradaPorTransferencia: boolean;
  temRetrato: boolean;
};

export type ChavePeriodo = "ano" | "12m" | "24m" | "personalizado";

export type Periodo = { chave: ChavePeriodo; inicio: Date; fim: Date; rotulo: string };

const DIA_MS = 86_400_000;

export function faixaDaTaxa(pct: number, config: Pick<ConfigDaArea, "metaPct" | "limitePct">): "verde" | "amarelo" | "vermelho" {
  if (pct < config.metaPct) return "verde";
  if (pct <= config.limitePct) return "amarelo";
  return "vermelho";
}

/** Desligamento de verdade — saída por transferência no grupo não é. */
export function ehDesligamento(f: Pick<FichaDoPainel, "dataDesligamento" | "saidaPorTransferencia">): boolean {
  return f.dataDesligamento !== null && !f.saidaPorTransferencia;
}

/** Quem tomou a decisão da saída, pelo tipo legal. */
export function classeDoMotivo(motivo: string | null): "empresa" | "pedido" | "outros" {
  if (motivo === "SEM_JUSTA_CAUSA" || motivo === "JUSTA_CAUSA") return "empresa";
  if (motivo === "PEDIDO_DEMISSAO") return "pedido";
  return "outros";
}

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function rotuloDoMes(ano: number, mes0: number): string {
  return `${MESES_CURTOS[mes0]}/${ano}`;
}

// ---------------------------------------------------------------
// 1. Placar da meta (sempre um ANO)
// ---------------------------------------------------------------

export type PlacarDaMeta = {
  ano: number;
  /** O ano ainda corre (hoje está dentro dele): vale projeção. */
  emAndamento: boolean;
  quadroMedio: number;
  desligamentos: number;
  realizadoPct: number;
  /** Quantas pessoas cabem na meta/limite: o percentual sobre o quadro médio, arredondado para baixo. */
  metaPessoas: number;
  limitePessoas: number;
  faixa: "verde" | "amarelo" | "vermelho";
  /** Pelo ritmo do ano até hoje, quantos desligamentos chegam a 31/12. null em ano fechado. */
  projecao: { desligamentos: number; pct: number; faixa: "verde" | "amarelo" | "vermelho" } | null;
  /** Mês em que o acumulado passou da meta / do limite ("jun/2026"), ou null. */
  mesMetaUltrapassada: string | null;
  mesLimiteUltrapassado: string | null;
  serie: { mes: string; desligamentos: number; acumulado: number }[];
  /** Transferências no grupo no ano — fora da conta, contadas para a tela dizer. */
  transferencias: number;
  custo: { porDesligamento: number; total: number; acimaDaMeta: number; acimaDoLimite: number };
};

export function placarDaMeta(
  fichas: FichaDoPainel[],
  ativosHoje: number,
  ano: number,
  hoje: Date,
  config: ConfigDaArea,
): PlacarDaMeta {
  const inicio = new Date(Date.UTC(ano, 0, 1));
  const fimDoAno = new Date(Date.UTC(ano, 11, 31));
  const emAndamento = hoje >= inicio && hoje <= fimDoAno;
  const t = turnoverNoPeriodo(fichas, ativosHoje, inicio, fimDoAno, hoje);

  const quadroMedio = t.headcountMedio;
  const realizadoPct = t.taxaPct;
  const limiarMeta = (config.metaPct / 100) * quadroMedio;
  const limiarLimite = (config.limitePct / 100) * quadroMedio;
  const metaPessoas = Math.floor(limiarMeta);
  const limitePessoas = Math.floor(limiarLimite);

  // Série do ano e o mês em que o acumulado cruzou cada régua.
  const ultimoMes = emAndamento ? hoje.getUTCMonth() : 11;
  const serie: PlacarDaMeta["serie"] = [];
  let acumulado = 0;
  let mesMetaUltrapassada: string | null = null;
  let mesLimiteUltrapassado: string | null = null;
  for (let m = 0; m <= ultimoMes; m++) {
    const doMes = fichas.filter(
      (f) =>
        ehDesligamento(f) &&
        f.dataDesligamento!.getUTCFullYear() === ano &&
        f.dataDesligamento!.getUTCMonth() === m &&
        f.dataDesligamento! <= hoje,
    ).length;
    acumulado += doMes;
    const rotulo = rotuloDoMes(ano, m);
    serie.push({ mes: rotulo, desligamentos: doMes, acumulado });
    if (!mesMetaUltrapassada && quadroMedio > 0 && acumulado > limiarMeta) mesMetaUltrapassada = rotulo;
    if (!mesLimiteUltrapassado && quadroMedio > 0 && acumulado > limiarLimite) mesLimiteUltrapassado = rotulo;
  }

  let projecao: PlacarDaMeta["projecao"] = null;
  if (emAndamento && quadroMedio > 0) {
    const diasDoAno = Math.round((fimDoAno.getTime() - inicio.getTime()) / DIA_MS) + 1;
    const diasDecorridos = Math.round((hoje.getTime() - inicio.getTime()) / DIA_MS) + 1;
    const desligamentosProjetados = Math.round((t.desligados / diasDecorridos) * diasDoAno);
    const pct = (desligamentosProjetados / quadroMedio) * 100;
    projecao = { desligamentos: desligamentosProjetados, pct, faixa: faixaDaTaxa(pct, config) };
  }

  const custo = config.custoPorDesligamento;
  return {
    ano,
    emAndamento,
    quadroMedio,
    desligamentos: t.desligados,
    realizadoPct,
    metaPessoas,
    limitePessoas,
    faixa: faixaDaTaxa(realizadoPct, config),
    projecao,
    mesMetaUltrapassada,
    mesLimiteUltrapassado,
    serie,
    transferencias: t.saidasPorTransferencia + t.entradasPorTransferencia,
    custo: {
      porDesligamento: custo,
      total: t.desligados * custo,
      acimaDaMeta: Math.max(0, t.desligados - metaPessoas) * custo,
      acimaDoLimite: Math.max(0, t.desligados - limitePessoas) * custo,
    },
  };
}

// ---------------------------------------------------------------
// 2. Quadro por setor / por gestor
// ---------------------------------------------------------------

/** Abaixo disto, a taxa descreve uma pessoa, não uma equipe — a tela marca, sem esconder. */
export const ATIVOS_MINIMOS_PARA_TAXA = 5;

export type LinhaDoQuadro = {
  chave: string;
  nome: string;
  /**
   * Só nas linhas de gestor: quantas saídas do período chegaram a este gestor
   * por DEDUÇÃO pelo setor (a ficha não guardava líder), e não por vínculo.
   */
  saidasPeloSetor?: number;
  ativos: number;
  entradas: number;
  saidas: number;
  saldo: number;
  /** Turnover dos últimos 12 meses (régua fixa, pedida assim). null = sem quadro para dividir. */
  turnover12mPct: number | null;
  pctMenosDeUmAno: number | null;
  dispensasEmpresa: number;
  pedidos: number;
  outrosMotivos: number;
  custo: number;
  acimaDoLimite: boolean;
  amostraPequena: boolean;
};

function linhaDe(
  chave: string,
  nome: string,
  fichas: FichaDoPainel[],
  periodo: Periodo,
  hoje: Date,
  config: ConfigDaArea,
  ehGestor = false,
): LinhaDoQuadro {
  const ativos = fichas.filter((f) => f.ativo);
  const noPeriodo = turnoverNoPeriodo(fichas, ativos.length, periodo.inicio, periodo.fim, hoje);
  const t12 = turnoverNoPeriodo(fichas, ativos.length, somarMesesUTC(hoje, -12), hoje, hoje);
  const saidasDoPeriodo = fichas.filter(
    (f) =>
      ehDesligamento(f) &&
      f.dataDesligamento! >= periodo.inicio &&
      f.dataDesligamento! <= (periodo.fim > hoje ? hoje : periodo.fim),
  );
  const umAnoAtras = somarAnosUTC(hoje, -1);
  const comInicio = ativos.filter((f) => f.inicioNoGrupo !== null);
  const turnover12mPct = t12.headcountMedio > 0 ? t12.taxaPct : null;
  return {
    chave,
    nome,
    ...(ehGestor ? { saidasPeloSetor: saidasDoPeriodo.filter((f) => origemPeloSetor(f.gestorOrigem)).length } : {}),
    ativos: ativos.length,
    entradas: noPeriodo.admissoes,
    saidas: noPeriodo.desligados,
    saldo: noPeriodo.admissoes - noPeriodo.desligados,
    turnover12mPct,
    pctMenosDeUmAno:
      comInicio.length > 0
        ? (comInicio.filter((f) => f.inicioNoGrupo! > umAnoAtras).length / comInicio.length) * 100
        : null,
    dispensasEmpresa: saidasDoPeriodo.filter((f) => classeDoMotivo(f.motivoDesligamento) === "empresa").length,
    pedidos: saidasDoPeriodo.filter((f) => classeDoMotivo(f.motivoDesligamento) === "pedido").length,
    outrosMotivos: saidasDoPeriodo.filter((f) => classeDoMotivo(f.motivoDesligamento) === "outros").length,
    custo: noPeriodo.desligados * config.custoPorDesligamento,
    acimaDoLimite: turnover12mPct !== null && turnover12mPct > config.limitePct,
    amostraPequena: ativos.length < ATIVOS_MINIMOS_PARA_TAXA,
  };
}

/** Do pior para o melhor turnover de 12 meses; sem taxa vai para o fim. */
function doPiorParaOMelhor(a: LinhaDoQuadro, b: LinhaDoQuadro): number {
  return (b.turnover12mPct ?? -1) - (a.turnover12mPct ?? -1) || b.saidas - a.saidas || a.nome.localeCompare(b.nome, "pt-BR");
}

/**
 * Uma linha por setor — todos, inclusive os pequenos (a ordem de serviço pede
 * Estoque, Financeiro e Marketing separados). Setor só com desligados também
 * aparece: um setor que perdeu todo mundo é o pior caso, não um caso a esconder.
 */
export function quadroPorSetor(
  fichas: FichaDoPainel[],
  periodo: Periodo,
  hoje: Date,
  config: ConfigDaArea,
): LinhaDoQuadro[] {
  type Grupo = { grafias: Map<string, number>; fichas: FichaDoPainel[] };
  const grupos = new Map<string, Grupo>();
  for (const f of fichas) {
    const g: Grupo = grupos.get(f.chaveSetor) ?? { grafias: new Map(), fichas: [] };
    g.grafias.set(f.setor, (g.grafias.get(f.setor) ?? 0) + 1);
    g.fichas.push(f);
    grupos.set(f.chaveSetor, g);
  }
  return [...grupos.entries()]
    .map(([chave, g]) => {
      const nome = [...g.grafias.entries()].sort((a, b) => b[1] - a[1])[0][0];
      return linhaDe(chave, nome, g.fichas, periodo, hoje, config);
    })
    .filter((l) => l.ativos > 0 || l.saidas > 0 || l.entradas > 0 || (l.turnover12mPct ?? 0) > 0)
    .sort(doPiorParaOMelhor);
}

/** Uma linha por gestor responsável (ver lib/desligamentos/base.ts para a atribuição). */
export function quadroPorGestor(
  fichas: FichaDoPainel[],
  periodo: Periodo,
  hoje: Date,
  config: ConfigDaArea,
): LinhaDoQuadro[] {
  const grupos = new Map<string, { nome: string; fichas: FichaDoPainel[] }>();
  for (const f of fichas) {
    const g: { nome: string; fichas: FichaDoPainel[] } = grupos.get(f.gestorChave) ?? { nome: f.gestorNome, fichas: [] };
    g.fichas.push(f);
    grupos.set(f.gestorChave, g);
  }
  return [...grupos.entries()]
    .map(([chave, g]) => linhaDe(chave, g.nome, g.fichas, periodo, hoje, config, true))
    .filter((l) => l.ativos > 0 || l.saidas > 0 || l.entradas > 0 || (l.turnover12mPct ?? 0) > 0)
    .sort(doPiorParaOMelhor);
}

// ---------------------------------------------------------------
// 3. Detalhe de um recorte (o setor ou o gestor clicado)
// ---------------------------------------------------------------

export type SaidaDoDetalhe = {
  id: string;
  empresaId: string;
  nome: string;
  /** "dd/mm/aaaa", formatado no servidor (o Date não atravessa para o cliente). */
  data: string;
  cargo: string;
  setor: string;
  gestor: string;
  motivo: string | null;
  causa: string | null;
  diasDeCasa: number | null;
};

export type DetalheDoRecorte = {
  mesAMes: { mes: string; admissoes: number; desligamentos: number }[];
  saidas: SaidaDoDetalhe[];
  porCausa: { causa: string | null; total: number }[];
};

export function detalheDoRecorte(
  fichas: FichaDoPainel[],
  periodo: Periodo,
  hoje: Date,
  formatarData: (d: Date) => string,
): DetalheDoRecorte {
  const fim = periodo.fim > hoje ? hoje : periodo.fim;
  const saidas = fichas
    .filter((f) => ehDesligamento(f) && f.dataDesligamento! >= periodo.inicio && f.dataDesligamento! <= fim)
    .sort((a, b) => b.dataDesligamento!.getTime() - a.dataDesligamento!.getTime());

  const porCausa = new Map<string | null, number>();
  for (const f of saidas) porCausa.set(f.causaDesligamento, (porCausa.get(f.causaDesligamento) ?? 0) + 1);

  return {
    mesAMes: movimentoMensal(fichas, hoje, 12).map((m) => ({
      mes: m.mes,
      admissoes: m.admissoes,
      desligamentos: m.desligamentos,
    })),
    saidas: saidas.map((f) => ({
      id: f.id,
      empresaId: f.empresaId,
      nome: f.nome,
      data: formatarData(f.dataDesligamento!),
      cargo: f.cargo,
      setor: f.setor,
      gestor: f.gestorNome,
      motivo: f.motivoDesligamento,
      causa: f.causaDesligamento,
      diasDeCasa: f.inicioNoGrupo
        ? Math.max(0, Math.round((f.dataDesligamento!.getTime() - f.inicioNoGrupo.getTime()) / DIA_MS))
        : null,
    })),
    porCausa: [...porCausa.entries()]
      .map(([causa, total]) => ({ causa, total }))
      .sort((a, b) => b.total - a.total),
  };
}

// ---------------------------------------------------------------
// 4. Configuração digitada na tela
// ---------------------------------------------------------------

/** "4.000,00", "4000", "4000.5" → número. Formato brasileiro primeiro: é o que o RH digita. */
function numeroDigitado(texto: string): number | null {
  const t = texto.trim().replace(/^R\$\s*/i, "").replace(/%$/, "").trim();
  if (!t) return null;
  const normalizado = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

export type ConfiguracaoValidada = { custoCentavos: number; metaPct: number; limitePct: number };

/**
 * Valida o formulário de configuração. As regras são as que impedem um painel
 * mentiroso: custo positivo, meta positiva, limite acima da meta, nada acima
 * de 100%.
 */
export function validarConfiguracao(campos: {
  custo: string;
  meta: string;
  limite: string;
}): { ok: true; valores: ConfiguracaoValidada } | { ok: false; error: string } {
  const custo = numeroDigitado(campos.custo);
  const meta = numeroDigitado(campos.meta);
  const limite = numeroDigitado(campos.limite);
  if (custo === null || custo <= 0) return { ok: false, error: "Informe o custo por desligamento, em reais (ex.: 4.000,00)." };
  if (custo > 10_000_000) return { ok: false, error: "Custo por desligamento alto demais — confira o valor digitado." };
  if (meta === null || meta <= 0 || meta > 100) return { ok: false, error: "A meta precisa ser um percentual entre 0 e 100." };
  if (limite === null || limite <= 0 || limite > 100) return { ok: false, error: "O limite precisa ser um percentual entre 0 e 100." };
  if (limite <= meta) return { ok: false, error: "O limite precisa ser maior que a meta." };
  return {
    ok: true,
    valores: { custoCentavos: Math.round(custo * 100), metaPct: meta, limitePct: limite },
  };
}

// ---------------------------------------------------------------
// 5. Período escolhido na tela
// ---------------------------------------------------------------

function dataDoParametro(v: string | undefined): Date | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Lê o período da URL. Padrão: o ano corrente (é a régua da meta). Período
 * personalizado inválido ou invertido cai no padrão — nunca numa conta vazia
 * que pareça "zero desligamento".
 */
export function periodoDaUrl(
  parametros: { periodo?: string; de?: string; ate?: string },
  hoje: Date,
): Periodo {
  const ano = hoje.getUTCFullYear();
  const doAno: Periodo = {
    chave: "ano",
    inicio: new Date(Date.UTC(ano, 0, 1)),
    fim: hoje,
    rotulo: `${ano} até hoje`,
  };
  switch (parametros.periodo) {
    case "12m":
      return { chave: "12m", inicio: somarMesesUTC(hoje, -12), fim: hoje, rotulo: "últimos 12 meses" };
    case "24m":
      return { chave: "24m", inicio: somarMesesUTC(hoje, -24), fim: hoje, rotulo: "últimos 24 meses" };
    case "personalizado": {
      const de = dataDoParametro(parametros.de);
      const ate = dataDoParametro(parametros.ate);
      if (!de || !ate || de > ate) return doAno;
      const fmt = (d: Date) =>
        `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
      return { chave: "personalizado", inicio: de, fim: ate, rotulo: `${fmt(de)} a ${fmt(ate)}` };
    }
    default:
      return doAno;
  }
}
