// Gera o Relatório Técnico NR-01/PGR em PDF (para envio ao engenheiro de SST).
// HTML de lib/nr01-relatorio.ts convertido via Chromium headless — em produção
// (Vercel/linux) usa @sparticuz/chromium; em dev local (Windows) usa o
// Chrome/Edge instalado. Sempre escopado à empresa da rota (requireEmpresaAccess
// + where empresaId) — relatórios nunca misturam empresas.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calcularNR01 } from "@/lib/nr01";
import { CONVITES_NA_PESQUISA } from "@/lib/pesquisa-numeros";
import { gerarHtmlRelatorioNR01 } from "@/lib/nr01-relatorio";
import { gerarHtmlRelatorioGeralPesquisa } from "@/lib/pesquisa-relatorio";
import { responderComHtmlRelatorio } from "@/lib/pdf-browser";

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
    where: { id: pesquisaId, empresaId },
    include: {
      empresa: { select: { nome: true } },
      perguntas: {
        select: { id: true, codigo: true, enunciado: true, dimensao: true, invertida: true },
      },
    },
  });
  if (!pesquisa) {
    return NextResponse.json(
      { error: "Pesquisa não encontrada nesta empresa." },
      { status: 404 },
    );
  }

  if (pesquisa.modelo === "CLIMA") {
    return NextResponse.redirect(
      new URL(`/api/rh/${empresaId}/pesquisas/${pesquisaId}/relatorio-clima-pdf`, _req.url),
    );
  }

  const [convites, respostas] = await Promise.all([
    prisma.surveyToken.count({ where: { pesquisaId, ...CONVITES_NA_PESQUISA } }),
    prisma.resposta.findMany({
      where: { pesquisaId },
      include: {
        itens: {
          include: {
            pergunta: {
              select: { id: true, enunciado: true, tipo: true, dimensao: true, dimensaoGPTW: true },
            },
          },
        },
      },
    }),
  ]);

  let html = "";
  if (pesquisa.modelo === "NR01") {
    const respostasCalc = respostas.map((r) => ({
      setorNomeSnapshot: r.setorNomeSnapshot,
      posicaoNomeSnapshot: r.posicaoNomeSnapshot,
      itens: r.itens.map((i) => ({ perguntaId: i.perguntaId, valorNumerico: i.valorNumerico })),
    }));
    const resultado = calcularNR01(pesquisa.perguntas, respostasCalc);
    html = gerarHtmlRelatorioNR01({
      empresaNome: pesquisa.empresa.nome,
      pesquisaTitulo: pesquisa.titulo,
      pesquisaStatus: pesquisa.status,
      iniciadaEm: pesquisa.iniciadaEm,
      encerradaEm: pesquisa.encerradaEm,
      convites,
      resultado,
    });
  } else {
    html = gerarHtmlRelatorioGeralPesquisa({
      empresaNome: pesquisa.empresa.nome,
      pesquisaTitulo: pesquisa.titulo,
      pesquisaModelo: pesquisa.modelo,
      pesquisaStatus: pesquisa.status,
      iniciadaEm: pesquisa.iniciadaEm,
      encerradaEm: pesquisa.encerradaEm,
      convites,
      respostas,
    });
  }

  return responderComHtmlRelatorio(html, `Relatório - ${pesquisa.empresa.nome}`);
}
