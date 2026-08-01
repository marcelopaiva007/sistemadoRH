// Gera o Relatório de Avaliação de Desempenho (visão consolidada da
// campanha) em PDF. Mesmo padrão de relatorio-clima-pdf: HTML server-side
// renderizado por Chromium headless.
import { NextRequest, NextResponse } from "next/server";
import chromiumServerless from "@sparticuz/chromium";
import { chromium, type Browser } from "playwright-core";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { empresasVisiveis } from "@/lib/rh-auth-guard";
import { calcularPainelAvaliacao } from "@/lib/avaliacao-painel";
import { gerarHtmlRelatorioAvaliacao } from "@/lib/avaliacao-relatorio";

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
  req: NextRequest,
  { params }: { params: Promise<{ empresaId: string }> },
) {
  const { empresaId } = await params;
  const campanha = req.nextUrl.searchParams.get("campanha");
  if (!campanha) {
    return NextResponse.json({ error: "Informe a campanha (?campanha=)." }, { status: 400 });
  }

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

  // Mesmo alcance da tela: todos os CNPJs que o usuário enxerga, não só o da
  // URL — o relatório é da campanha inteira.
  const empresasDoUsuario = await empresasVisiveis(user);

  const ciclos = await prisma.cicloAvaliacao.findMany({
    where: { empresaId: { in: empresasDoUsuario }, nome: campanha },
    select: { id: true },
  });
  if (ciclos.length === 0) {
    return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 });
  }

  const [avaliacoes, empresas] = await Promise.all([
    prisma.avaliacaoDesempenho.findMany({
      where: { cicloId: { in: ciclos.map((c) => c.id) } },
      select: {
        empresaId: true,
        tipoAvaliador: true,
        status: true,
        notaFinal: true,
        colaborador: { select: { id: true, nome: true, setor: { select: { nome: true } } } },
      },
    }),
    prisma.empresa.findMany({
      where: { id: { in: empresasDoUsuario } },
      select: { id: true, nome: true },
    }),
  ]);

  const nomeDaEmpresa = new Map(empresas.map((e) => [e.id, e.nome]));
  const dados = calcularPainelAvaliacao(avaliacoes, (id) => nomeDaEmpresa.get(id) ?? "—");

  const html = gerarHtmlRelatorioAvaliacao({ campanha, geradoEm: new Date(), dados });

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

    const nomeArquivo = `relatorio-avaliacao-${campanha.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("relatorio-avaliacao-pdf:", e);
    return NextResponse.json(
      { error: `Falha ao gerar o PDF: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  } finally {
    await browser?.close().catch(() => {});
  }
}
