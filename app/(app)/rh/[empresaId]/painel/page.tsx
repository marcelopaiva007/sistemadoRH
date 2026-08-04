import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { hojeUTC } from "@/lib/datas";
import { empresasDaMesmaMarca } from "@/lib/escopo-marca";
import {
  absenteismoPorSetor,
  calcularTurnover,
  custoPessoalPorSetor,
  distribuicaoFaixaEtaria,
  headcountMensal,
  headcountPorSetor,
  movimentoMensal,
  tempoMedioDeCasaAnos,
} from "@/lib/bi";
import { PainelView } from "./painel-view";

// Dashboard executivo: a visão de grupo numa tela só — KPIs + curvas.
//
// Consolidado pela MARCA (mesmo raciocínio de Indicadores e da tela Início):
// a Diretoria quer o grupo, não uma soma manual de CNPJs. As fórmulas são as
// mesmas de lib/bi.ts que alimentam Indicadores — nenhum número aqui diverge
// do que aquela tela mostra, só muda a forma (curvas em vez de tabelas).
export default async function PainelPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  const empresaIds = await empresasDaMesmaMarca(empresaId);
  const hoje = hojeUTC();

  const [ativos, todosOsVinculos, ausenciasRecentes, beneficiosVigentes] = await Promise.all([
    prisma.colaborador.findMany({
      where: { empresaId: { in: empresaIds }, ativo: true },
      select: {
        salarioBase: true,
        dataAdmissao: true,
        dataNascimento: true,
        setor: { select: { nome: true } },
      },
    }),
    prisma.colaborador.findMany({
      where: { empresaId: { in: empresaIds } },
      select: { dataAdmissao: true, dataDesligamento: true },
    }),
    prisma.ausencia.findMany({
      where: {
        empresaId: { in: empresaIds },
        dataInicio: { gte: new Date(hoje.getTime() - 40 * 86_400_000) },
      },
      select: {
        dias: true,
        abonada: true,
        dataInicio: true,
        colaborador: { select: { setor: { select: { nome: true } } } },
      },
    }),
    prisma.beneficioColaborador.findMany({
      where: {
        empresaId: { in: empresaIds },
        OR: [{ dataFim: null }, { dataFim: { gte: hoje } }],
        colaborador: { ativo: true },
      },
      select: { valorEmpresa: true, colaborador: { select: { setor: { select: { nome: true } } } } },
    }),
  ]);

  const headcount = headcountPorSetor(ativos.map(c => ({ setorNome: c.setor.nome })));
  const turnover = calcularTurnover(todosOsVinculos, ativos.length, hoje);
  const movimento = movimentoMensal(todosOsVinculos, hoje);
  const evolucao = headcountMensal(todosOsVinculos, ativos.length, hoje);
  const absenteismo = absenteismoPorSetor(
    ausenciasRecentes.map(a => ({
      setorNome: a.colaborador.setor.nome,
      dias: a.dias,
      abonada: a.abonada,
      dataInicio: a.dataInicio,
    })),
    headcount,
    hoje,
  );
  const custo = custoPessoalPorSetor(
    ativos.map(c => ({ setorNome: c.setor.nome, salarioBase: c.salarioBase })),
    beneficiosVigentes.map(b => ({ setorNome: b.colaborador.setor.nome, valorEmpresa: b.valorEmpresa })),
  );
  const faixaEtaria = distribuicaoFaixaEtaria(ativos.map(c => ({ dataNascimento: c.dataNascimento })), hoje);
  const tempoDeCasa = tempoMedioDeCasaAnos(ativos.map(c => ({ dataAdmissao: c.dataAdmissao })), hoje);

  return (
    <PainelView
      qtdEmpresas={empresaIds.length}
      totalAtivos={ativos.length}
      turnover={turnover}
      movimento={movimento}
      evolucao={evolucao}
      headcount={headcount}
      absenteismo={absenteismo}
      custo={custo}
      faixaEtaria={faixaEtaria}
      tempoDeCasa={tempoDeCasa}
    />
  );
}
