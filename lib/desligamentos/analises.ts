// As análises da área Desligamentos além do painel (PR 3, v1.216.0) — funções
// puras sobre as mesmas fichas marcadas de lib/desligamentos/base.ts:
//
//   5. contratação errada  — quem saiu cedo demais e quanto das admissões já se foi;
//   6. comparações         — mês a mês e ano contra ano, com o crescimento do
//                            negócio digitado pela diretoria;
//   7. motivos             — a causa da saída por setor e por gestor;
//   8. pendências de dados — o que impede a análise de ser completa.
//
// Mesma régua de sempre: transferência no grupo não é desligamento nem
// admissão (marcas de lib/transferencia.ts), turnover por `turnoverNoPeriodo`,
// tempo de casa pela admissão no GRUPO (`inicioNoGrupo`).
import { headcountMensal, movimentoMensal, turnoverNoPeriodo } from "@/lib/bi";
import { CAUSAS_DESLIGAMENTO } from "@/lib/constants-dp";
import { ehSetorSemSetor } from "@/lib/retrato-desligamento";
import {
  classeDoMotivo,
  ehDesligamento,
  linhaSemDono,
  type FichaDoPainel,
  type Periodo,
  type SaidaDoDetalhe,
} from "@/lib/desligamentos/painel";

const DIA_MS = 86_400_000;

function fimEfetivo(periodo: Periodo, hoje: Date): Date {
  return periodo.fim > hoje ? hoje : periodo.fim;
}

function saidasDoPeriodo(fichas: FichaDoPainel[], periodo: Periodo, hoje: Date): FichaDoPainel[] {
  const fim = fimEfetivo(periodo, hoje);
  return fichas.filter((f) => ehDesligamento(f) && f.dataDesligamento! >= periodo.inicio && f.dataDesligamento! <= fim);
}

/** A admissão que conta como contratação: a do quadro (ver lib/bi.ts), fora as chegadas por transferência. */
function admitidoNoPeriodo(f: FichaDoPainel, periodo: Periodo, hoje: Date): boolean {
  if (f.entradaPorTransferencia) return false;
  const adm = f.dataAdmissaoNoQuadro === undefined ? f.dataAdmissao : f.dataAdmissaoNoQuadro;
  return adm !== null && adm >= periodo.inicio && adm <= fimEfetivo(periodo, hoje);
}

/** Dias entre a entrada no grupo e a saída; null sem data de admissão. */
export function diasDeCasaNaSaida(f: Pick<FichaDoPainel, "inicioNoGrupo" | "dataDesligamento">): number | null {
  if (!f.inicioNoGrupo || !f.dataDesligamento) return null;
  return Math.max(0, Math.round((f.dataDesligamento.getTime() - f.inicioNoGrupo.getTime()) / DIA_MS));
}

function agrupar(fichas: FichaDoPainel[], por: "setor" | "gestor"): Map<string, { nome: string; fichas: FichaDoPainel[] }> {
  const grupos = new Map<string, { nome: string; fichas: FichaDoPainel[] }>();
  for (const f of fichas) {
    const chave = por === "setor" ? f.chaveSetor : f.gestorChave;
    const nome = por === "setor" ? f.setor : f.gestorNome;
    const g: { nome: string; fichas: FichaDoPainel[] } = grupos.get(chave) ?? { nome, fichas: [] };
    g.fichas.push(f);
    grupos.set(chave, g);
  }
  return grupos;
}

function paraDetalhe(f: FichaDoPainel, formatarData: (d: Date) => string): SaidaDoDetalhe {
  return {
    id: f.id,
    empresaId: f.empresaId,
    nome: f.nome,
    data: formatarData(f.dataDesligamento!),
    cargo: f.cargo,
    setor: f.setor,
    gestor: f.gestorNome,
    motivo: f.motivoDesligamento,
    causa: f.causaDesligamento,
    diasDeCasa: diasDeCasaNaSaida(f),
  };
}

// ---------------------------------------------------------------
// 5. Contratação errada
// ---------------------------------------------------------------

export type LinhaContratacao = {
  chave: string;
  nome: string;
  saidas: number;
  /** Saídas com menos de 90 dias de casa (no grupo). */
  ate90: number;
  /** Saídas com menos de 180 dias de casa — inclui as de menos de 90. */
  ate180: number;
  /** Saídas sem data de admissão: não dá para dizer quanto tempo ficaram. */
  semAdmissao: number;
  pctAte90: number | null;
  pctAte180: number | null;
  /** Contratações do período e quantas delas já saíram. */
  admissoes: number;
  admissoesQueSairam: number;
  pctAdmissoesQueSairam: number | null;
};

export type ContratacaoErrada = {
  total: LinhaContratacao;
  porSetor: LinhaContratacao[];
  porGestor: LinhaContratacao[];
  /** Quem saiu com menos de 180 dias de casa, do mais rápido para o mais lento. */
  pessoas: SaidaDoDetalhe[];
};

function linhaContratacao(
  chave: string,
  nome: string,
  fichas: FichaDoPainel[],
  periodo: Periodo,
  hoje: Date,
): LinhaContratacao {
  const saidas = saidasDoPeriodo(fichas, periodo, hoje);
  const comDias = saidas.map(diasDeCasaNaSaida).filter((d): d is number => d !== null);
  const ate90 = comDias.filter((d) => d < 90).length;
  const ate180 = comDias.filter((d) => d < 180).length;
  const admitidos = fichas.filter((f) => admitidoNoPeriodo(f, periodo, hoje));
  const jaSairam = admitidos.filter((f) => ehDesligamento(f) && f.dataDesligamento! <= hoje).length;
  return {
    chave,
    nome,
    saidas: saidas.length,
    ate90,
    ate180,
    semAdmissao: saidas.length - comDias.length,
    pctAte90: comDias.length > 0 ? (ate90 / comDias.length) * 100 : null,
    pctAte180: comDias.length > 0 ? (ate180 / comDias.length) * 100 : null,
    admissoes: admitidos.length,
    admissoesQueSairam: jaSairam,
    pctAdmissoesQueSairam: admitidos.length > 0 ? (jaSairam / admitidos.length) * 100 : null,
  };
}

const piorContratacao = (a: LinhaContratacao, b: LinhaContratacao) =>
  Number(linhaSemDono(a)) - Number(linhaSemDono(b)) ||
  b.ate180 - a.ate180 ||
  b.ate90 - a.ate90 ||
  b.saidas - a.saidas ||
  a.nome.localeCompare(b.nome, "pt-BR");

export function contratacaoErrada(
  fichas: FichaDoPainel[],
  periodo: Periodo,
  hoje: Date,
  formatarData: (d: Date) => string,
): ContratacaoErrada {
  const linhas = (por: "setor" | "gestor") =>
    [...agrupar(fichas, por).entries()]
      .map(([chave, g]) => linhaContratacao(chave, g.nome, g.fichas, periodo, hoje))
      .filter((l) => l.saidas > 0 || l.admissoes > 0)
      .sort(piorContratacao);
  const pessoas = saidasDoPeriodo(fichas, periodo, hoje)
    .filter((f) => {
      const d = diasDeCasaNaSaida(f);
      return d !== null && d < 180;
    })
    .sort((a, b) => diasDeCasaNaSaida(a)! - diasDeCasaNaSaida(b)!)
    .map((f) => paraDetalhe(f, formatarData));
  return {
    total: linhaContratacao("todos", "Todos", fichas, periodo, hoje),
    porSetor: linhas("setor"),
    porGestor: linhas("gestor"),
    pessoas,
  };
}

// ---------------------------------------------------------------
// 6. Comparações
// ---------------------------------------------------------------

export type MesDaComparacao = {
  mes: string;
  admissoes: number;
  desligamentos: number;
  /** Quadro no fim do mês (reconstruído, como no Painel executivo). */
  quadro: number;
};

/** Mês a mês dos últimos `meses` (a tela mostra 12 ou 24). */
export function serieMensal(fichas: FichaDoPainel[], ativosHoje: number, hoje: Date, meses: number): MesDaComparacao[] {
  const movimento = movimentoMensal(fichas, hoje, meses);
  const quadro = headcountMensal(fichas, ativosHoje, hoje, meses);
  return movimento.map((m, i) => ({
    mes: m.mes,
    admissoes: m.admissoes,
    desligamentos: m.desligamentos,
    quadro: quadro[i]?.total ?? 0,
  }));
}

export type IndicadoresDoAno = {
  crescimentoClientesPct: number | null;
  crescimentoFaturamentoPct: number | null;
  observacao: string | null;
};

export type LinhaAno = {
  ano: number;
  emAndamento: boolean;
  desligamentos: number;
  dispensasEmpresa: number;
  pedidos: number;
  admissoes: number;
  /** Quadro em 31/12 (no ano corrente, hoje). */
  ativosNoFim: number;
  quadroMedio: number;
  /** Desligamentos ÷ quadro médio. */
  pct: number | null;
  /** Quanto o quadro do fim do ano cresceu sobre o do fim do ano anterior. */
  crescimentoQuadroPct: number | null;
} & IndicadoresDoAno;

export function comparacaoAnual(
  fichas: FichaDoPainel[],
  ativosHoje: number,
  anos: number[],
  hoje: Date,
  indicadores: Map<number, IndicadoresDoAno>,
): LinhaAno[] {
  const doAno = (ano: number) => {
    const inicio = new Date(Date.UTC(ano, 0, 1));
    const fim = new Date(Date.UTC(ano, 11, 31));
    return { inicio, fim, t: turnoverNoPeriodo(fichas, ativosHoje, inicio, fim, hoje) };
  };
  const ordenados = [...anos].sort((a, b) => a - b);
  const linhas: LinhaAno[] = [];
  for (const ano of ordenados) {
    const { inicio, fim, t } = doAno(ano);
    const anterior = doAno(ano - 1).t.headcountFim;
    const fimEfetivoDoAno = fim > hoje ? hoje : fim;
    const saidas = fichas.filter(
      (f) => ehDesligamento(f) && f.dataDesligamento! >= inicio && f.dataDesligamento! <= fimEfetivoDoAno,
    );
    const ind = indicadores.get(ano);
    linhas.push({
      ano,
      emAndamento: hoje >= inicio && hoje <= fim,
      desligamentos: t.desligados,
      dispensasEmpresa: saidas.filter((f) => classeDoMotivo(f.motivoDesligamento) === "empresa").length,
      pedidos: saidas.filter((f) => classeDoMotivo(f.motivoDesligamento) === "pedido").length,
      admissoes: t.admissoes,
      ativosNoFim: t.headcountFim,
      quadroMedio: t.headcountMedio,
      pct: t.headcountMedio > 0 ? t.taxaPct : null,
      crescimentoQuadroPct: anterior > 0 ? ((t.headcountFim - anterior) / anterior) * 100 : null,
      crescimentoClientesPct: ind?.crescimentoClientesPct ?? null,
      crescimentoFaturamentoPct: ind?.crescimentoFaturamentoPct ?? null,
      observacao: ind?.observacao ?? null,
    });
  }
  return linhas;
}

/** Lê os campos do formulário de crescimento do negócio — vazio = não informado. */
export function validarIndicadoresNegocio(
  campos: Record<string, string>,
  anos: number[],
): { ok: true; valores: ({ ano: number } & IndicadoresDoAno)[] } | { ok: false; error: string } {
  const numero = (texto: string | undefined): number | null | "invalido" => {
    const t = (texto ?? "").trim().replace(/%$/, "").trim();
    if (!t) return null;
    const n = Number(t.replace(",", "."));
    if (!Number.isFinite(n) || n < -100 || n > 1000) return "invalido";
    return n;
  };
  const valores: ({ ano: number } & IndicadoresDoAno)[] = [];
  for (const ano of anos) {
    const clientes = numero(campos[`clientes_${ano}`]);
    const faturamento = numero(campos[`faturamento_${ano}`]);
    if (clientes === "invalido" || faturamento === "invalido") {
      return { ok: false, error: `Percentual inválido em ${ano} — use um número entre -100 e 1000 (ex.: 4,5).` };
    }
    const observacao = (campos[`observacao_${ano}`] ?? "").trim().slice(0, 300) || null;
    valores.push({ ano, crescimentoClientesPct: clientes, crescimentoFaturamentoPct: faturamento, observacao });
  }
  return { ok: true, valores };
}

// ---------------------------------------------------------------
// 7. Motivos
// ---------------------------------------------------------------

export const SEM_CAUSA = "SEM_CAUSA";

/** A ordem das causas nos gráficos: a lista oficial e, por último, "sem causa registrada". */
export const ORDEM_DAS_CAUSAS: string[] = [...CAUSAS_DESLIGAMENTO.map((c) => c.value), SEM_CAUSA];

export type LinhaMotivos = {
  chave: string;
  nome: string;
  total: number;
  /** Causa gerencial (chave de CAUSAS_DESLIGAMENTO ou SEM_CAUSA) → quantidade. */
  porCausa: Record<string, number>;
  /** O tipo legal, agrupado por quem decidiu a saída. */
  empresa: number;
  pedido: number;
  outros: number;
};

export type Motivos = { geral: LinhaMotivos; porSetor: LinhaMotivos[]; porGestor: LinhaMotivos[] };

function linhaMotivos(chave: string, nome: string, saidas: FichaDoPainel[]): LinhaMotivos {
  const porCausa: Record<string, number> = Object.fromEntries(ORDEM_DAS_CAUSAS.map((c) => [c, 0]));
  for (const f of saidas) {
    const c = f.causaDesligamento && f.causaDesligamento in porCausa ? f.causaDesligamento : SEM_CAUSA;
    porCausa[c]++;
  }
  return {
    chave,
    nome,
    total: saidas.length,
    porCausa,
    empresa: saidas.filter((f) => classeDoMotivo(f.motivoDesligamento) === "empresa").length,
    pedido: saidas.filter((f) => classeDoMotivo(f.motivoDesligamento) === "pedido").length,
    outros: saidas.filter((f) => classeDoMotivo(f.motivoDesligamento) === "outros").length,
  };
}

export function motivosDasSaidas(fichas: FichaDoPainel[], periodo: Periodo, hoje: Date): Motivos {
  const saidas = saidasDoPeriodo(fichas, periodo, hoje);
  const linhas = (por: "setor" | "gestor") =>
    [...agrupar(saidas, por).entries()]
      .map(([chave, g]) => linhaMotivos(chave, g.nome, g.fichas))
      .sort(
        (a, b) =>
          Number(linhaSemDono(a)) - Number(linhaSemDono(b)) || b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"),
      );
  return { geral: linhaMotivos("todos", "Todos", saidas), porSetor: linhas("setor"), porGestor: linhas("gestor") };
}

// ---------------------------------------------------------------
// 8. Pendências de dados
// ---------------------------------------------------------------

export type PendenciaDeDado = {
  id: string;
  empresaId: string;
  nome: string;
  /** "dd/mm/aaaa" da saída, ou null quando é justamente a data que falta. */
  data: string | null;
  setor: string;
};

export type PendenciasDeDados = {
  /** Saídas que não aparecem em setor nenhum de verdade. */
  setorNaoDefinido: PendenciaDeDado[];
  /** Saídas sem o tipo legal (pedido, dispensa...): ficam fora de "empresa × pedido". */
  semMotivo: PendenciaDeDado[];
  /** Saídas sem a causa gerencial: ficam como "sem causa" no gráfico de motivos. */
  semCausa: PendenciaDeDado[];
  /** Fichas desligadas sem data de saída: não entram em conta nenhuma. */
  semData: PendenciaDeDado[];
  /** Saída seguida de admissão do mesmo CPF em outro CNPJ: talvez seja transferência não marcada. */
  possivelTransferencia: PendenciaDeDado[];
};

export function pendenciasDeDados(
  fichas: FichaDoPainel[],
  formatarData: (d: Date) => string,
  possiveisTransferencias: Set<string>,
): PendenciasDeDados {
  const item = (f: FichaDoPainel): PendenciaDeDado => ({
    id: f.id,
    empresaId: f.empresaId,
    nome: f.nome,
    data: f.dataDesligamento ? formatarData(f.dataDesligamento) : null,
    setor: f.setor,
  });
  const maisRecentePrimeiro = (a: FichaDoPainel, b: FichaDoPainel) =>
    (b.dataDesligamento?.getTime() ?? 0) - (a.dataDesligamento?.getTime() ?? 0) || a.nome.localeCompare(b.nome, "pt-BR");
  const saidas = fichas.filter(ehDesligamento).sort(maisRecentePrimeiro);
  return {
    setorNaoDefinido: saidas.filter((f) => ehSetorSemSetor(f.setor)).map(item),
    semMotivo: saidas.filter((f) => !f.motivoDesligamento).map(item),
    semCausa: saidas.filter((f) => !f.causaDesligamento).map(item),
    semData: fichas
      .filter((f) => !f.ativo && !f.dataDesligamento)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      .map(item),
    possivelTransferencia: saidas.filter((f) => possiveisTransferencias.has(f.id)).map(item),
  };
}
