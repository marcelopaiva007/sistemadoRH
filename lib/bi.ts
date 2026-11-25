// BI inicial de RH: headcount, turnover, absenteísmo e custo de pessoal.
//
// Funções puras — recebem os dados já buscados do banco (com os relations que
// precisam já resolvidos pelo caller) e devolvem números prontos para a tela.
// Nada aqui toca o Prisma, para dar para testar sem banco.
import { hojeUTC, somarDiasUTC, somarMesesUTC } from "@/lib/datas";
import { diasDaAusenciaNoIntervalo } from "@/lib/folha-ausencias";

// ---------------------------------------------------------------
// Headcount
// ---------------------------------------------------------------

export type LinhaHeadcount = { setor: string; total: number };

export function headcountPorSetor(colaboradoresAtivos: { setorNome: string }[]): LinhaHeadcount[] {
  const contagem = new Map<string, number>();
  for (const c of colaboradoresAtivos) contagem.set(c.setorNome, (contagem.get(c.setorNome) ?? 0) + 1);
  return [...contagem.entries()]
    .map(([setor, total]) => ({ setor, total }))
    .sort((a, b) => b.total - a.total || a.setor.localeCompare(b.setor));
}

// ---------------------------------------------------------------
// Turnover
// ---------------------------------------------------------------

export type VinculoParaTurnover = {
  dataAdmissao: Date | null;
  dataDesligamento: Date | null;
  /**
   * A saída é transferência para outro CNPJ do grupo (lib/transferencia.ts,
   * `marcarTransferencias`): mexe no QUADRO do recorte, mas não é
   * desligamento. Ausente = não é transferência (o comportamento de antes).
   */
  saidaPorTransferencia?: boolean;
  /** A admissão é chegada por transferência: mexe no quadro, não é contratação. */
  entradaPorTransferencia?: boolean;
  /**
   * Admissão ajustada para o quadro (lib/transferencia.ts): na chegada por
   * transferência que herdou a admissão original, a data da transferência.
   * Ausente = vale `dataAdmissao`.
   */
  dataAdmissaoNoQuadro?: Date | null;
};

/** A admissão que move o quadro: a ajustada, quando a ficha foi marcada. */
const admissaoNoQuadro = (v: VinculoParaTurnover): Date | null =>
  v.dataAdmissaoNoQuadro === undefined ? v.dataAdmissao : v.dataAdmissaoNoQuadro;

export type ResultadoTurnover = {
  /** Desligamentos de verdade — sem as saídas por transferência. */
  desligados: number;
  /** Contratações de verdade — sem as chegadas por transferência. */
  admissoes: number;
  /** Saídas e chegadas por transferência na janela: mexem no quadro, ficam fora da taxa. */
  saidasPorTransferencia: number;
  entradasPorTransferencia: number;
  headcountInicio: number;
  headcountFim: number;
  headcountMedio: number;
  taxaPct: number;
};

const naJanela = (d: Date | null, inicio: Date, fim: Date): boolean => d !== null && d >= inicio && d <= fim;

/**
 * Taxa de turnover dos últimos `janelaMeses` (padrão 12), fórmula clássica de
 * RH: desligados no período / headcount médio do período × 100.
 *
 * Sem snapshot histórico de headcount, o headcount do INÍCIO do período é
 * reconstruído a partir do de agora: headcountInicio = headcountFim −
 * admissões do período + desligamentos do período. É uma aproximação (assume
 * que ninguém foi reativado no meio do caminho), mas é o que dá para calcular
 * só com admissão/desligamento — não exige guardar uma foto por mês.
 */
export function calcularTurnover(
  vinculos: VinculoParaTurnover[],
  headcountAtual: number,
  hoje: Date = hojeUTC(),
  janelaMeses = 12,
): ResultadoTurnover {
  const inicio = somarMesesUTC(hoje, -janelaMeses);

  const saidas = vinculos.filter((v) => naJanela(v.dataDesligamento, inicio, hoje));
  const entradas = vinculos.filter((v) => naJanela(admissaoNoQuadro(v), inicio, hoje));
  const saidasPorTransferencia = saidas.filter((v) => v.saidaPorTransferencia).length;
  const entradasPorTransferencia = entradas.filter((v) => v.entradaPorTransferencia).length;
  const desligados = saidas.length - saidasPorTransferencia;
  const admissoes = entradas.length - entradasPorTransferencia;

  // O quadro do início desfaz TODO movimento da janela, transferência
  // inclusive: quem chegou transferido não estava aqui no começo, e quem saiu
  // transferido estava. Só a TAXA ignora as transferências.
  const headcountFim = headcountAtual;
  const headcountInicio = Math.max(0, headcountFim - entradas.length + saidas.length);
  const headcountMedio = (headcountInicio + headcountFim) / 2;
  const taxaPct = headcountMedio > 0 ? (desligados / headcountMedio) * 100 : 0;

  return {
    desligados,
    admissoes,
    saidasPorTransferencia,
    entradasPorTransferencia,
    headcountInicio,
    headcountFim,
    headcountMedio,
    taxaPct,
  };
}

/** Um mês da série: contratações e desligamentos de verdade, e as transferências à parte. */
export type MesDoMovimento = {
  mes: string;
  admissoes: number;
  desligamentos: number;
  entradasPorTransferencia: number;
  saidasPorTransferencia: number;
};

/**
 * Admissões e desligamentos mês a mês, do mais antigo ao mais recente. As
 * transferências no grupo saem de `admissoes`/`desligamentos` e vêm contadas à
 * parte — quem desenha o quadro do mês (headcountMensal) soma as duas.
 */
export function movimentoMensal(
  vinculos: VinculoParaTurnover[],
  hoje: Date = hojeUTC(),
  meses = 12,
): MesDoMovimento[] {
  const linhas: MesDoMovimento[] = [];
  const doMes = (d: Date | null, ano: number, mesNum: number) =>
    d !== null && d.getUTCFullYear() === ano && d.getUTCMonth() === mesNum;
  for (let i = meses - 1; i >= 0; i--) {
    const referencia = somarMesesUTC(hoje, -i);
    const ano = referencia.getUTCFullYear();
    const mesNum = referencia.getUTCMonth();
    const entradas = vinculos.filter((v) => doMes(admissaoNoQuadro(v), ano, mesNum));
    const saidas = vinculos.filter((v) => doMes(v.dataDesligamento, ano, mesNum));
    const entradasPorTransferencia = entradas.filter((v) => v.entradaPorTransferencia).length;
    const saidasPorTransferencia = saidas.filter((v) => v.saidaPorTransferencia).length;
    linhas.push({
      mes: `${String(mesNum + 1).padStart(2, "0")}/${ano}`,
      admissoes: entradas.length - entradasPorTransferencia,
      desligamentos: saidas.length - saidasPorTransferencia,
      entradasPorTransferencia,
      saidasPorTransferencia,
    });
  }
  return linhas;
}

/**
 * Headcount no FIM de cada um dos últimos `meses` — a curva de crescimento do
 * quadro. Mesma reconstrução retroativa de `calcularTurnover`: parte do
 * headcount de agora e desfaz admissões/desligamentos mês a mês voltando no
 * tempo (vínculo sem `dataAdmissao` conta como sempre presente, coerente com a
 * aproximação de lá).
 */
export function headcountMensal(
  vinculos: VinculoParaTurnover[],
  headcountAtual: number,
  hoje: Date = hojeUTC(),
  meses = 12,
): { mes: string; total: number }[] {
  const movimento = movimentoMensal(vinculos, hoje, meses);
  // Do mês mais recente para trás: o total no fim do mês anterior é o total
  // atual sem o saldo do mês seguinte — saldo de TODO movimento, transferência
  // inclusive (ela muda quem está no recorte, só não é contratação nem saída).
  const totais: number[] = new Array(movimento.length);
  let total = headcountAtual;
  for (let i = movimento.length - 1; i >= 0; i--) {
    totais[i] = total;
    const m = movimento[i];
    total = Math.max(
      0,
      total - (m.admissoes + m.entradasPorTransferencia) + (m.desligamentos + m.saidasPorTransferencia),
    );
  }
  return movimento.map((m, i) => ({ mes: m.mes, total: totais[i] }));
}

// ---------------------------------------------------------------
// Demografia
// ---------------------------------------------------------------

export type LinhaFaixaEtaria = { faixa: string; total: number };

/** Distribuição etária dos ativos. Quem não tem data de nascimento aparece como faixa própria — omitir esconderia o buraco da base. */
export function distribuicaoFaixaEtaria(
  colaboradoresAtivos: { dataNascimento: Date | null }[],
  hoje: Date = hojeUTC(),
): LinhaFaixaEtaria[] {
  const faixas: [string, (idade: number) => boolean][] = [
    ["Até 24", (i) => i <= 24],
    ["25–34", (i) => i >= 25 && i <= 34],
    ["35–44", (i) => i >= 35 && i <= 44],
    ["45–54", (i) => i >= 45 && i <= 54],
    ["55+", (i) => i >= 55],
  ];
  const contagem = new Map<string, number>(faixas.map(([f]) => [f, 0]));
  let semData = 0;

  for (const c of colaboradoresAtivos) {
    if (!c.dataNascimento) {
      semData++;
      continue;
    }
    const idade = Math.floor(
      (hoje.getTime() - c.dataNascimento.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
    );
    const faixa = faixas.find(([, cabe]) => cabe(idade));
    if (faixa) contagem.set(faixa[0], (contagem.get(faixa[0]) ?? 0) + 1);
  }

  const linhas = faixas.map(([faixa]) => ({ faixa, total: contagem.get(faixa) ?? 0 }));
  if (semData > 0) linhas.push({ faixa: "Sem data", total: semData });
  return linhas;
}

/** Tempo médio de casa dos ativos, em anos — só de quem tem admissão preenchida. */
export function tempoMedioDeCasaAnos(
  colaboradoresAtivos: { dataAdmissao: Date | null }[],
  hoje: Date = hojeUTC(),
): { anos: number; comData: number } {
  const comAdmissao = colaboradoresAtivos.filter((c) => c.dataAdmissao);
  if (comAdmissao.length === 0) return { anos: 0, comData: 0 };
  const somaAnos = comAdmissao.reduce(
    (t, c) => t + (hoje.getTime() - c.dataAdmissao!.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
    0,
  );
  return { anos: somaAnos / comAdmissao.length, comData: comAdmissao.length };
}

// ---------------------------------------------------------------
// Absenteísmo
// ---------------------------------------------------------------

export type AusenciaParaAbsenteismo = {
  setorNome: string;
  dias: number;
  abonada: boolean;
  dataInicio: Date;
  dataFim: Date;
};

/**
 * A janela do absenteísmo: [hoje − `janelaDias`, hoje], as duas pontas
 * contando — o mesmo corte que as telas já usavam para dizer quais registros
 * "caem nos últimos 30 dias". Quem consulta o banco usa estas datas para
 * buscar toda ausência que TOCA a janela (dataInicio ≤ fim e dataFim ≥ início).
 */
export function janelaDoAbsenteismo(hoje: Date = hojeUTC(), janelaDias = 30): { inicio: Date; fim: Date } {
  return { inicio: somarDiasUTC(hoje, -janelaDias), fim: hoje };
}

/**
 * O filtro do Prisma para buscar as ausências que TOCAM a janela — inclusive a
 * que começou antes dela e segue dentro. Antes cada tela buscava "dataInicio
 * nos últimos 40 dias" e perdia esse caso. Um só lugar para painel, CSV, PDF e
 * tela inicial buscarem a mesma coisa.
 */
export function filtroAusenciasDaJanela(
  hoje: Date = hojeUTC(),
  janelaDias = 30,
): { dataInicio: { lte: Date }; dataFim: { gte: Date } } {
  const { inicio, fim } = janelaDoAbsenteismo(hoje, janelaDias);
  return { dataInicio: { lte: fim }, dataFim: { gte: inicio } };
}

/**
 * Dias de falta da ausência que caem DENTRO da janela (26/11/2026). Antes, a
 * ausência que começou na janela somava o `dias` inteiro: um afastamento de 15
 * dias iniciado anteontem contava 15 faltas, 13 delas ainda no futuro; e a que
 * começou antes da janela e seguia dentro dela não contava nada. O recorte é o
 * mesmo da folha (lib/folha-ausencias.ts).
 */
export function diasDeFaltaNaJanela(
  a: { dataInicio: Date; dataFim: Date; dias: number },
  hoje: Date = hojeUTC(),
  janelaDias = 30,
): number {
  const { inicio, fim } = janelaDoAbsenteismo(hoje, janelaDias);
  return diasDaAusenciaNoIntervalo(a, inicio, fim);
}

export type LinhaAbsenteismo = { setor: string; diasFalta: number; taxaPct: number };

/**
 * % de dias úteis perdidos por falta NÃO abonada, nos últimos `janelaDias`
 * (padrão 30), por setor. Cada ausência conta só os dias que caem dentro da
 * janela (26/11/2026). Ausência abonada (atestado aceito, licença) não
 * entra — é o que a Fase 1 já define como "não conta como falta".
 *
 * `diasUteisPorJanela` é uma aproximação (≈22 dias úteis por mês corrido) —
 * dá para trocar por um calendário de feriados de verdade depois, sem mudar a
 * fórmula.
 */
export function absenteismoPorSetor(
  ausencias: AusenciaParaAbsenteismo[],
  headcount: LinhaHeadcount[],
  hoje: Date = hojeUTC(),
  janelaDias = 30,
  diasUteisPorJanela = 22,
): LinhaAbsenteismo[] {
  const faltasPorSetor = new Map<string, number>();
  for (const a of ausencias) {
    if (a.abonada) continue;
    // Só os dias dentro de [hoje − janela, hoje] — ver `diasDeFaltaNaJanela`.
    const dias = diasDeFaltaNaJanela(a, hoje, janelaDias);
    if (dias <= 0) continue;
    faltasPorSetor.set(a.setorNome, (faltasPorSetor.get(a.setorNome) ?? 0) + dias);
  }

  return headcount
    .map((h) => {
      const diasFalta = faltasPorSetor.get(h.setor) ?? 0;
      const diasDisponiveis = h.total * diasUteisPorJanela;
      const taxaPct = diasDisponiveis > 0 ? (diasFalta / diasDisponiveis) * 100 : 0;
      return { setor: h.setor, diasFalta, taxaPct };
    })
    .sort((a, b) => b.taxaPct - a.taxaPct);
}

// ---------------------------------------------------------------
// Custo de pessoal
// ---------------------------------------------------------------

export type ColaboradorParaCusto = { setorNome: string; salarioBase: number | null };
export type BeneficioParaCusto = { setorNome: string; valorEmpresa: number | null };

export type LinhaCusto = { setor: string; folha: number; beneficios: number; total: number };

/** Custo mensal estimado (folha + benefícios vigentes), por setor. */
export function custoPessoalPorSetor(
  colaboradores: ColaboradorParaCusto[],
  beneficiosVigentes: BeneficioParaCusto[],
): LinhaCusto[] {
  const porSetor = new Map<string, { folha: number; beneficios: number }>();
  const garantir = (setor: string) => {
    if (!porSetor.has(setor)) porSetor.set(setor, { folha: 0, beneficios: 0 });
    return porSetor.get(setor)!;
  };

  for (const c of colaboradores) garantir(c.setorNome).folha += c.salarioBase ?? 0;
  for (const b of beneficiosVigentes) garantir(b.setorNome).beneficios += b.valorEmpresa ?? 0;

  return [...porSetor.entries()]
    .map(([setor, v]) => ({ setor, folha: v.folha, beneficios: v.beneficios, total: v.folha + v.beneficios }))
    .sort((a, b) => b.total - a.total || a.setor.localeCompare(b.setor));
}
