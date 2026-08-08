// Gera o Relatório de Clima Organizacional (GPTW) em PDF.
// Mesmo padrão do relatorio-pdf de NR-01.
import { NextRequest, NextResponse } from "next/server";
import { type Browser } from "playwright-core";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { CONVITES_NA_PESQUISA } from "@/lib/pesquisa-numeros";
import { gerarHtmlRelatorioClima } from "@/lib/clima-relatorio";
import { calcularClima, compararCiclos, extrairEvolucao, gerarAnaliseExecutiva, type RespostaPrisma } from "@/lib/clima";
import { launchChromium } from "@/lib/pdf-browser";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ empresaId: string; pesquisaId: string }> },
) {
  const { empresaId, pesquisaId } = await params;

  const session = await auth();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const autorizado =
    user.role === "ADMIN" || user.empresas.some((e) => e.empresaId === empresaId && e.ativo);
  if (!autorizado) {
    return NextResponse.json({ error: "Sem acesso a esta empresa." }, { status: 403 });
  }

  const pesquisa = await prisma.pesquisa.findFirst({
    where: { id: pesquisaId, empresaId, modelo: "CLIMA" },
    include: { empresa: { select: { nome: true } } },
  });
  if (!pesquisa) {
    return NextResponse.json(
      { error: "Pesquisa de clima não encontrada nesta empresa." },
      { status: 404 },
    );
  }

  const [convites, respostas, perguntas] = await Promise.all([
    prisma.surveyToken.count({ where: { pesquisaId, ...CONVITES_NA_PESQUISA } }),
    prisma.resposta.findMany({
      where: { pesquisaId },
      include: { itens: { include: { pergunta: true } } },
    }),
    prisma.pergunta.findMany({
      where: { pesquisaId },
      select: { id: true, dimensaoGPTW: true, dimensao: true, enunciado: true, tipo: true },
    }),
  ]);

  const respostasTipadas: RespostaPrisma[] = respostas.map((r) => ({
    setorNomeSnapshot: r.setorNomeSnapshot,
    sexoSnapshot: r.sexoSnapshot,
    faixaEtariaSnapshot: r.faixaEtariaSnapshot,
    itens: r.itens.map((i) => ({
      pergunta: {
        id: i.pergunta.id,
        enunciado: i.pergunta.enunciado,
        dimensaoGPTW: i.pergunta.dimensaoGPTW,
        dimensao: i.pergunta.dimensao,
        tipo: i.pergunta.tipo,
      },
      valorNumerico: i.valorNumerico,
      valorTexto: i.valorTexto,
    })),
  }));

  const { resultado } = calcularClima({ respostas: respostasTipadas, perguntas });

  // Ciclo anterior
  const cicloAnterior = await prisma.pesquisa.findFirst({
    where: { empresaId, modelo: "CLIMA", encerradaEm: { not: null }, id: { not: pesquisaId } },
    orderBy: { encerradaEm: "desc" },
    include: { respostas: { include: { itens: { include: { pergunta: true } } } } },
  });

  let comparativo = null;
  if (cicloAnterior) {
    const respostasAnterior: RespostaPrisma[] = cicloAnterior.respostas.map((r) => ({
      setorNomeSnapshot: r.setorNomeSnapshot,
      sexoSnapshot: r.sexoSnapshot,
      faixaEtariaSnapshot: r.faixaEtariaSnapshot,
      itens: r.itens.map((i) => ({
        pergunta: {
          id: i.pergunta.id,
          enunciado: i.pergunta.enunciado,
          dimensaoGPTW: i.pergunta.dimensaoGPTW,
          dimensao: i.pergunta.dimensao,
          tipo: i.pergunta.tipo,
        },
        valorNumerico: i.valorNumerico,
        valorTexto: i.valorTexto,
      })),
    }));
    const { resultado: resultadoAnterior } = calcularClima({
      respostas: respostasAnterior,
      perguntas: [],
    });
    comparativo = compararCiclos(resultado, resultadoAnterior);
  }

  // Enriquece análise executiva
  const participacaoPct = convites > 0 ? Math.round((resultado.totalRespostas / convites) * 100) : 0;
  resultado.analiseExecutiva = gerarAnaliseExecutiva(resultado, comparativo, participacaoPct);

  // Evolução histórica
  const ciclosHistorico = await prisma.pesquisa.findMany({
    where: { empresaId, modelo: "CLIMA", encerradaEm: { not: null } },
    orderBy: { encerradaEm: "desc" },
    take: 5,
    include: { respostas: { include: { itens: { include: { pergunta: true } } } } },
  });

  const evolucao = extrairEvolucao(
    ciclosHistorico.map((c) => ({
      titulo: c.titulo,
      encerradaEm: c.encerradaEm!,
      respostas: c.respostas.map((r) => ({
        setorNomeSnapshot: r.setorNomeSnapshot,
        sexoSnapshot: r.sexoSnapshot,
        faixaEtariaSnapshot: r.faixaEtariaSnapshot,
        itens: r.itens.map((i) => ({
          pergunta: {
            id: i.pergunta.id,
            enunciado: i.pergunta.enunciado,
            dimensaoGPTW: i.pergunta.dimensaoGPTW,
            dimensao: i.pergunta.dimensao,
            tipo: i.pergunta.tipo,
          },
          valorNumerico: i.valorNumerico,
          valorTexto: i.valorTexto,
        })),
      })),
    })),
  );

  const html = gerarHtmlRelatorioClima({
    empresaNome: pesquisa.empresa.nome,
    pesquisaTitulo: pesquisa.titulo,
    pesquisaStatus: pesquisa.status,
    iniciadaEm: pesquisa.iniciadaEm,
    encerradaEm: pesquisa.encerradaEm,
    convites,
    resultado,
    comparativo,
    evolucao,
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
