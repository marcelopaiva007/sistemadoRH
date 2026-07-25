import { prisma } from "@/lib/prisma";
import { hojeUTC, somarDiasUTC, somarMesesUTC } from "@/lib/datas";

export type ResumoDashboard = {
  ativos: number;
  admissoes12m: number;
  desligamentos12m: number;
  turnoverPct: number;
  diasFalta30d: number;
  absenteismoPct: number;
  custoFolha: number;
  custoBeneficios: number;
  semSalario: number;
};

/**
 * Números de cabeçalho da empresa para a tela inicial.
 *
 * Tudo aqui é `count`/`aggregate` — nada de `findMany`. A tela de Indicadores
 * carrega as linhas todas porque precisa quebrar por setor e desenhar
 * gráfico; a inicial precisa só do total, e é a tela que abre a cada login.
 * Trocar isso por findMany traria de volta a lentidão que acabamos de tirar.
 */
export async function resumoDaEmpresa(empresaId: string): Promise<ResumoDashboard> {
  const hoje = hojeUTC();
  const inicio12m = somarMesesUTC(hoje, -12);
  const inicio30d = somarDiasUTC(hoje, -30);

  const [ativos, admissoes12m, desligamentos12m, faltas, folha, beneficios, semSalario] =
    await Promise.all([
      prisma.colaborador.count({ where: { empresaId, ativo: true } }),
      prisma.colaborador.count({
        where: { empresaId, dataAdmissao: { gte: inicio12m, lte: hoje } },
      }),
      prisma.colaborador.count({
        where: { empresaId, dataDesligamento: { gte: inicio12m, lte: hoje } },
      }),
      prisma.ausencia.aggregate({
        where: {
          empresaId,
          abonada: false,
          status: "APROVADA",
          dataInicio: { gte: inicio30d, lte: hoje },
        },
        _sum: { dias: true },
      }),
      prisma.colaborador.aggregate({
        where: { empresaId, ativo: true },
        _sum: { salarioBase: true },
      }),
      prisma.beneficioColaborador.aggregate({
        where: { empresaId, OR: [{ dataFim: null }, { dataFim: { gte: hoje } }] },
        _sum: { valorEmpresa: true },
      }),
      // Quantos ativos ainda estão sem salário: sem isso o custo abaixo é
      // uma verdade parcial, e o número precisa aparecer junto para não
      // induzir a erro.
      prisma.colaborador.count({ where: { empresaId, ativo: true, salarioBase: null } }),
    ]);

  // Mesma fórmula de lib/bi.ts: sem foto histórica de headcount, o início do
  // período é reconstruído a partir de hoje.
  const headcountInicio = Math.max(0, ativos - admissoes12m + desligamentos12m);
  const headcountMedio = (headcountInicio + ativos) / 2;
  const turnoverPct = headcountMedio > 0 ? (desligamentos12m / headcountMedio) * 100 : 0;

  const diasFalta30d = faltas._sum.dias ?? 0;
  // 30 dias úteis aproximados por pessoa no período — mesma simplificação da
  // tela de Indicadores, para os dois números não divergirem.
  const diasPossiveis = ativos * 30;
  const absenteismoPct = diasPossiveis > 0 ? (diasFalta30d / diasPossiveis) * 100 : 0;

  return {
    ativos,
    admissoes12m,
    desligamentos12m,
    turnoverPct,
    diasFalta30d,
    absenteismoPct,
    custoFolha: folha._sum.salarioBase ?? 0,
    custoBeneficios: beneficios._sum.valorEmpresa ?? 0,
    semSalario,
  };
}
