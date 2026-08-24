// Gera o Relatório de Indicadores (BI de RH) em PDF. Mesmo padrão de
// avaliacoes/painel/relatorio-pdf: HTML server-side renderizado por Chromium
// headless. Complementa o /csv já existente — CSV pra planilha, PDF pra
// anexar num e-mail ou levar pronto pra reunião de diretoria.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { escopoDeEmpresas, usuarioAlcancaEmpresa } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { hojeUTC } from "@/lib/datas";
import { rotuloDoEscopo } from "@/lib/escopo-marca";
import {
  absenteismoPorSetor,
  calcularTurnover,
  custoPessoalPorSetor,
  headcountPorSetor,
  movimentoMensal,
} from "@/lib/bi";
import { gerarHtmlRelatorioIndicadores } from "@/lib/indicadores-relatorio";
import { responderComHtmlRelatorio } from "@/lib/pdf-browser";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ empresaId: string }> },
) {
  const { empresaId } = await params;
  const empresasParam = req.nextUrl.searchParams.get("empresas") ?? undefined;

  const session = await auth();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  // Uma linha, uma regra: `usuarioAlcancaEmpresa` de lib/rh-auth-guard.ts, a
  // MESMA que decide o acesso às páginas. Aqui havia uma checagem escrita à
  // mão — cinco variantes diferentes conviviam em nove rotas, e duas delas
  // esqueciam DIRETORIA, cujo pivô `UserEmpresa` é vazio por desenho.
  if (!(await usuarioAlcancaEmpresa(user, empresaId))) {
    return NextResponse.json({ error: "Sem acesso a esta empresa." }, { status: 403 });
  }

  // O MESMO escopo que a tela do Painel está mostrando — ver o comentário
  // gêmeo em indicadores/csv/route.ts.
  const empresaIds = await escopoDeEmpresas(user, empresasParam);
  const hoje = hojeUTC();

  const [rotuloEscopo, ativos, todosOsVinculos, ausenciasRecentes, beneficiosVigentes, totalColaboradoresHistorico] =
    await Promise.all([
      rotuloDoEscopo(empresaIds),
      prisma.colaborador.findMany({
        where: { empresaId: { in: empresaIds }, ativo: true },
        select: { setor: { select: { nome: true } }, salarioBase: true },
      }),
      prisma.colaborador.findMany({
        where: { empresaId: { in: empresaIds } },
        select: { dataAdmissao: true, dataDesligamento: true },
      }),
      prisma.ausencia.findMany({
        where: { empresaId: { in: empresaIds }, dataInicio: { gte: new Date(hoje.getTime() - 40 * 86_400_000) } },
        select: { dias: true, abonada: true, dataInicio: true, colaborador: { select: { setor: { select: { nome: true } } } } },
      }),
      prisma.beneficioColaborador.findMany({
        where: { empresaId: { in: empresaIds }, OR: [{ dataFim: null }, { dataFim: { gte: hoje } }], colaborador: { ativo: true } },
        select: { valorEmpresa: true, colaborador: { select: { setor: { select: { nome: true } } } } },
      }),
      prisma.colaborador.count({ where: { empresaId: { in: empresaIds } } }),
    ]);

  const headcount = headcountPorSetor(ativos.map((c) => ({ setorNome: c.setor.nome })));
  const turnover = calcularTurnover(todosOsVinculos, ativos.length, hoje);
  const movimento = movimentoMensal(todosOsVinculos, hoje);
  const absenteismo = absenteismoPorSetor(
    ausenciasRecentes.map((a) => ({ setorNome: a.colaborador.setor.nome, dias: a.dias, abonada: a.abonada, dataInicio: a.dataInicio })),
    headcount,
    hoje,
  );
  const custo = custoPessoalPorSetor(
    ativos.map((c) => ({ setorNome: c.setor.nome, salarioBase: c.salarioBase })),
    beneficiosVigentes.map((b) => ({ setorNome: b.colaborador.setor.nome, valorEmpresa: b.valorEmpresa })),
  );
  const comSalarioPreenchido = ativos.filter((c) => c.salarioBase != null).length;

  const html = gerarHtmlRelatorioIndicadores({
    rotuloEscopo,
    qtdEmpresas: empresaIds.length,
    geradoEm: new Date(),
    totalAtivos: ativos.length,
    totalHistorico: totalColaboradoresHistorico,
    comSalarioPreenchido,
    turnover,
    movimento,
    headcount,
    absenteismo,
    custo,
  });

  return responderComHtmlRelatorio(html, `Relatório de Indicadores RH - ${rotuloEscopo}`);
}
