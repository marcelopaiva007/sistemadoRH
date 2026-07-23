// Gera o Relatório Técnico NR-01/PGR em PDF (para envio ao engenheiro de SST).
// HTML de lib/nr01-relatorio.ts convertido via Chromium headless — em produção
// (Vercel/linux) usa @sparticuz/chromium; em dev local (Windows) usa o
// Chrome/Edge instalado. Sempre escopado à empresa da rota (requireEmpresaAccess
// + where empresaId) — relatórios nunca misturam empresas.
import { NextRequest, NextResponse } from "next/server";
import chromiumServerless from "@sparticuz/chromium";
import { chromium, type Browser } from "playwright-core";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calcularNR01 } from "@/lib/nr01";
import { gerarHtmlRelatorioNR01 } from "@/lib/nr01-relatorio";

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

  // Numa rota de API devolvemos 401/403 explícitos (redirect() é para páginas).
  // Mesma regra do requireEmpresaAccess: ADMIN acessa qualquer empresa,
  // RH_MANAGER só a própria.
  const session = await auth();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const autorizado =
    user.role === "ADMIN" || (user.role === "RH_MANAGER" && user.empresaId === empresaId);
  if (!autorizado) {
    return NextResponse.json({ error: "Sem acesso a esta empresa." }, { status: 403 });
  }

  const pesquisa = await prisma.pesquisa.findFirst({
    where: { id: pesquisaId, empresaId, modelo: "NR01" },
    include: {
      empresa: { select: { nome: true } },
      perguntas: {
        select: { id: true, codigo: true, enunciado: true, dimensao: true, invertida: true },
      },
      _count: { select: { tokens: true } },
    },
  });
  if (!pesquisa) {
    return NextResponse.json(
      { error: "Avaliação NR-01 não encontrada nesta empresa." },
      { status: 404 },
    );
  }

  const respostas = await prisma.resposta.findMany({
    where: { pesquisaId },
    select: {
      setorNomeSnapshot: true,
      posicaoNomeSnapshot: true,
      itens: { select: { perguntaId: true, valorNumerico: true } },
    },
  });

  const resultado = calcularNR01(pesquisa.perguntas, respostas);
  const html = gerarHtmlRelatorioNR01({
    empresaNome: pesquisa.empresa.nome,
    pesquisaTitulo: pesquisa.titulo,
    pesquisaStatus: pesquisa.status,
    iniciadaEm: pesquisa.iniciadaEm,
    encerradaEm: pesquisa.encerradaEm,
    convites: pesquisa._count.tokens,
    resultado,
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

    const nomeArquivo = `relatorio-nr01-${pesquisa.empresa.nome.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("relatorio-pdf:", e);
    return NextResponse.json(
      { error: `Falha ao gerar o PDF: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  } finally {
    await browser?.close().catch(() => {});
  }
}
