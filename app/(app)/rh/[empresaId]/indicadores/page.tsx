import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { hojeUTC } from "@/lib/datas";
import {
  absenteismoPorSetor,
  calcularTurnover,
  custoPessoalPorSetor,
  headcountPorSetor,
  movimentoMensal,
} from "@/lib/bi";
import { IndicadoresView } from "./indicadores-view";

// BI inicial de RH: headcount, turnover, absenteísmo e custo de pessoal. Tudo
// calculado na hora em lib/bi.ts a partir do que os outros módulos já
// registram — nada aqui é um número mantido à parte.
export default async function IndicadoresPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  const hoje = hojeUTC();

  const [ativos, todosOsVinculos, ausenciasRecentes, beneficiosVigentes, totalColaboradoresHistorico] =
    await Promise.all([
      prisma.colaborador.findMany({
        where: { empresaId, ativo: true },
        select: { setor: { select: { nome: true } }, salarioBase: true },
      }),
      prisma.colaborador.findMany({
        where: { empresaId },
        select: { dataAdmissao: true, dataDesligamento: true },
      }),
      prisma.ausencia.findMany({
        where: { empresaId, dataInicio: { gte: new Date(hoje.getTime() - 40 * 86_400_000) } },
        select: { dias: true, abonada: true, dataInicio: true, colaborador: { select: { setor: { select: { nome: true } } } } },
      }),
      prisma.beneficioColaborador.findMany({
        where: { empresaId, OR: [{ dataFim: null }, { dataFim: { gte: hoje } }], colaborador: { ativo: true } },
        select: { valorEmpresa: true, colaborador: { select: { setor: { select: { nome: true } } } } },
      }),
      prisma.colaborador.count({ where: { empresaId } }),
    ]);

  const colaboradoresParaCusto = ativos.map((c) => ({ setorNome: c.setor.nome, salarioBase: c.salarioBase }));
  const headcount = headcountPorSetor(ativos.map((c) => ({ setorNome: c.setor.nome })));
  const turnover = calcularTurnover(todosOsVinculos, ativos.length, hoje);
  const movimento = movimentoMensal(todosOsVinculos, hoje);
  const absenteismo = absenteismoPorSetor(
    ausenciasRecentes.map((a) => ({ setorNome: a.colaborador.setor.nome, dias: a.dias, abonada: a.abonada, dataInicio: a.dataInicio })),
    headcount,
    hoje,
  );
  const custo = custoPessoalPorSetor(
    colaboradoresParaCusto,
    beneficiosVigentes.map((b) => ({ setorNome: b.colaborador.setor.nome, valorEmpresa: b.valorEmpresa })),
  );

  const comSalarioPreenchido = ativos.filter((c) => c.salarioBase != null).length;

  return (
    <IndicadoresView
      headcount={headcount}
      totalAtivos={ativos.length}
      totalHistorico={totalColaboradoresHistorico}
      turnover={turnover}
      movimento={movimento}
      absenteismo={absenteismo}
      custo={custo}
      comSalarioPreenchido={comSalarioPreenchido}
    />
  );
}
