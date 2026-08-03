// Gera o Relatório de Indicadores (BI de RH) em PDF. Mesmo padrão de
// avaliacoes/painel/relatorio-pdf: HTML server-side renderizado por Chromium
// headless. Complementa o /csv já existente — CSV pra planilha, PDF pra
// anexar num e-mail ou levar pronto pra reunião de diretoria.
import { NextRequest, NextResponse } from "next/server";
import chromiumServerless from "@sparticuz/chromium";
import { chromium, type Browser } from "playwright-core";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hojeUTC } from "@/lib/datas";
import { empresasDaMesmaMarca } from "@/lib/escopo-marca";
import {
  absenteismoPorSetor,
  calcularTurnover,
  custoPessoalPorSetor,
  headcountPorSetor,
  movimentoMensal,
} from "@/lib/bi";
import { gerarHtmlRelatorioIndicadores } from "@/lib/indicadores-relatorio";

export const runtime = "nodejs";
export const maxDuration = 60;

async function launchChromium(): Promise<Browser> {
  if (process.platform === "linux") {
    return chromium.launch({
      args: chromiumServerless.args,
      executablePath: await chromiumServerless.executablePath(),
      headless: true,
    });
  }
  for (const channel of ["chrome", "msedge"] as const) {
    try {
      return await chromium.launch({ headless: true, channel });
    } catch {
      /* tenta o próximo */
    }
  }
  return chromium.launch({ headless: true });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ empresaId: string }> },
) {
  const { empresaId } = await params;

  const session = await auth();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const autorizado =
    user.role === "ADMIN" ||
    user.role === "DIRETORIA" ||
    user.empresas.some((e) => e.empresaId === empresaId && e.ativo);
  if (!autorizado) {
    return NextResponse.json({ error: "Sem acesso a esta empresa." }, { status: 403 });
  }

  const empresaIds = await empresasDaMesmaMarca(empresaId);
  const hoje = hojeUTC();

  const [empresa, ativos, todosOsVinculos, ausenciasRecentes, beneficiosVigentes, totalColaboradoresHistorico] =
    await Promise.all([
      prisma.empresa.findUnique({ where: { id: empresaId }, select: { marca: { select: { nome: true } } } }),
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
    nomeMarca: empresa?.marca.nome ?? "Empresa",
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

  let browser: Browser | undefined;
  try {
    browser = await launchChromium();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", bottom: "14mm", left: "10mm", right: "10mm" },
    });

    const nomeArquivo = `indicadores-${(empresa?.marca.nome ?? "empresa").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("indicadores-relatorio-pdf:", e);
    return NextResponse.json(
      { error: `Falha ao gerar o PDF: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  } finally {
    await browser?.close().catch(() => {});
  }
}
