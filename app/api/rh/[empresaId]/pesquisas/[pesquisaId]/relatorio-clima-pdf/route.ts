// Gera o Relatório de Clima Organizacional (GPTW) em PDF.
// Mesma estrutura do relatorio-pdf de NR-01.
import { NextRequest, NextResponse } from "next/server";
import chromiumServerless from "@sparticuz/chromium";
import { chromium, type Browser } from "playwright-core";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { CONVITES_NA_PESQUISA } from "@/lib/pesquisa-numeros";
import { gerarHtmlRelatorioClima } from "@/lib/clima-relatorio";
import { calcularClima, calcularNPS, compararCiclos } from "@/lib/clima";

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
  { params }: { params: Promise<{ empresaId: string; pesquisaId: string }> },
) {
  const { empresaId, pesquisaId } = await params;

  const session = await auth();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const autorizado =
    user.role === "ADMIN" || (user.role === "RH_MANAGER" && user.empresaId === empresaId);
  if (!autorizado) {
    return NextResponse.json({ error: "Sem acesso a esta empresa." }, { status: 403 });
  }

  const pesquisa = await prisma.pesquisa.findFirst({
    where: { id: pesquisaId, empresaId, modelo: "CLIMA" },
    include: {
      empresa: { select: { nome: true } },
      perguntas: {
        where: { tipo: "NPS_10" },
        select: { id: true },
      },
    },
  });
  if (!pesquisa) {
    return NextResponse.json(
      { error: "Pesquisa de clima não encontrada nesta empresa." },
      { status: 404 },
    );
  }

  const [convites, respostas] = await Promise.all([
    prisma.surveyToken.count({ where: { pesquisaId, ...CONVITES_NA_PESQUISA } }),
    prisma.resposta.findMany({
      where: { pesquisaId },
      include: {
        itens: { include: { pergunta: true } },
      },
    }),
  ]);

  // Perguntas NPS
  const perguntaIdsNPS = pesquisa.perguntas.map((p) => p.id);
  const itensNPS =
    perguntaIdsNPS.length > 0
      ? respostas.flatMap((r) =>
          r.itens
            .filter((i) => perguntaIdsNPS.includes(i.perguntaId))
            .map((i) => ({ valorNumerico: i.valorNumerico })),
        )
      : undefined;

  const { resultado } = calcularClima({
    respostas: respostas.map((r) => ({
      setorNomeSnapshot: r.setorNomeSnapshot,
      itens: r.itens.map((i) => ({
        pergunta: { dimensaoGPTW: i.pergunta.dimensaoGPTW, dimensao: i.pergunta.dimensao },
        valorNumerico: i.valorNumerico,
      })),
    })),
    perguntaNPS: itensNPS,
  });

  // Ciclo anterior
  const ciclosAnteriores = await prisma.pesquisa.findMany({
    where: { empresaId, modelo: "CLIMA", encerradaEm: { not: null } },
    orderBy: { encerradaEm: "desc" },
    take: 1,
    include: {
      respostas: {
        include: { itens: { include: { pergunta: true } } },
      },
    },
  });

  let comparativo = null;
  if (ciclosAnteriores.length > 0) {
    const anterior = ciclosAnteriores[0];
    const { resultado: resultadoAnterior } = calcularClima({
      respostas: anterior.respostas.map((r) => ({
        setorNomeSnapshot: r.setorNomeSnapshot,
        itens: r.itens.map((i) => ({
          pergunta: { dimensaoGPTW: i.pergunta.dimensaoGPTW, dimensao: i.pergunta.dimensao },
          valorNumerico: i.valorNumerico,
        })),
      })),
    });
    comparativo = compararCiclos(resultado, resultadoAnterior);
  }

  const html = gerarHtmlRelatorioClima({
    empresaNome: pesquisa.empresa.nome,
    pesquisaTitulo: pesquisa.titulo,
    pesquisaStatus: pesquisa.status,
    iniciadaEm: pesquisa.iniciadaEm,
    encerradaEm: pesquisa.encerradaEm,
    convites,
    resultado,
    comparativo,
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

    const nomeArquivo = `relatorio-clima-${pesquisa.empresa.nome.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("relatorio-clima-pdf:", e);
    return NextResponse.json(
      { error: `Falha ao gerar o PDF: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  } finally {
    await browser?.close().catch(() => {});
  }
}
