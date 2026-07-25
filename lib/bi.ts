// BI inicial de RH: headcount, turnover, absenteísmo e custo de pessoal.
//
// Funções puras — recebem os dados já buscados do banco (com os relations que
// precisam já resolvidos pelo caller) e devolvem números prontos para a tela.
// Nada aqui toca o Prisma, para dar para testar sem banco.
import { diferencaEmDiasUTC, hojeUTC, somarMesesUTC } from "@/lib/datas";

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

export type VinculoParaTurnover = { dataAdmissao: Date | null; dataDesligamento: Date | null };

export type ResultadoTurnover = {
  desligados: number;
  admissoes: number;
  headcountInicio: number;
  headcountFim: number;
  headcountMedio: number;
  taxaPct: number;
};

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

  const desligados = vinculos.filter(
    (v) => v.dataDesligamento && v.dataDesligamento >= inicio && v.dataDesligamento <= hoje,
  ).length;
  const admissoes = vinculos.filter(
    (v) => v.dataAdmissao && v.dataAdmissao >= inicio && v.dataAdmissao <= hoje,
  ).length;

  const headcountFim = headcountAtual;
  const headcountInicio = Math.max(0, headcountFim - admissoes + desligados);
  const headcountMedio = (headcountInicio + headcountFim) / 2;
  const taxaPct = headcountMedio > 0 ? (desligados / headcountMedio) * 100 : 0;

  return { desligados, admissoes, headcountInicio, headcountFim, headcountMedio, taxaPct };
}

/** Admissões e desligamentos mês a mês, do mais antigo ao mais recente. */
export function movimentoMensal(
  vinculos: VinculoParaTurnover[],
  hoje: Date = hojeUTC(),
  meses = 12,
): { mes: string; admissoes: number; desligamentos: number }[] {
  const linhas: { mes: string; admissoes: number; desligamentos: number }[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const referencia = somarMesesUTC(hoje, -i);
    const ano = referencia.getUTCFullYear();
    const mesNum = referencia.getUTCMonth();
    const admissoes = vinculos.filter(
      (v) => v.dataAdmissao && v.dataAdmissao.getUTCFullYear() === ano && v.dataAdmissao.getUTCMonth() === mesNum,
    ).length;
    const desligamentos = vinculos.filter(
      (v) =>
        v.dataDesligamento &&
        v.dataDesligamento.getUTCFullYear() === ano &&
        v.dataDesligamento.getUTCMonth() === mesNum,
    ).length;
    linhas.push({ mes: `${String(mesNum + 1).padStart(2, "0")}/${ano}`, admissoes, desligamentos });
  }
  return linhas;
}

// ---------------------------------------------------------------
// Absenteísmo
// ---------------------------------------------------------------

export type AusenciaParaAbsenteismo = { setorNome: string; dias: number; abonada: boolean; dataInicio: Date };

export type LinhaAbsenteismo = { setor: string; diasFalta: number; taxaPct: number };

/**
 * % de dias úteis perdidos por falta NÃO abonada, nos últimos `janelaDias`
 * (padrão 30), por setor. Ausência abonada (atestado aceito, licença) não
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
    if (diferencaEmDiasUTC(hoje, a.dataInicio) > janelaDias) continue;
    if (a.dataInicio > hoje) continue;
    faltasPorSetor.set(a.setorNome, (faltasPorSetor.get(a.setorNome) ?? 0) + a.dias);
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
