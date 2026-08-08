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
import { responderComHtmlRelatorio } from "@/lib/pdf-browser";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ empresaId: string; pesquisaId: string }> },
) {
  const { empresaId, pesquisaId } = await params;

  // Numa rota de API devolvemos 401/403 explícitos (redirect() é para páginas).
  // Mesma regra do requireEmpresaAccess: ADMIN acessa qualquer empresa;
  // demais papéis precisam ter UserEmpresa ativo apontando para esta empresa.
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

  // Redireciona automaticamente pesquisas de clima para a rota dedicada de clima PDF
  if (pesquisa.modelo === "CLIMA") {
    return NextResponse.redirect(
      new URL(`/api/rh/${empresaId}/pesquisas/${pesquisaId}/relatorio-clima-pdf`, _req.url),
    );
  }

  // Convites sem os excluídos: o relatório do PGR vai para o engenheiro de SST
  // e o "respostas/convites" precisa bater com o que a tela mostra.
  const [convites, respostas] = await Promise.all([
    prisma.surveyToken.count({ where: { pesquisaId, ...CONVITES_NA_PESQUISA } }),
    prisma.resposta.findMany({
      where: { pesquisaId },
      select: {
        setorNomeSnapshot: true,
        posicaoNomeSnapshot: true,
        itens: { select: { perguntaId: true, valorNumerico: true } },
      },
    }),
  ]);

  const resultado = calcularNR01(pesquisa.perguntas, respostas);
  const html = gerarHtmlRelatorioNR01({
    empresaNome: pesquisa.empresa.nome,
    pesquisaTitulo: pesquisa.titulo,
    pesquisaStatus: pesquisa.status,
    iniciadaEm: pesquisa.iniciadaEm,
    encerradaEm: pesquisa.encerradaEm,
    convites,
    resultado,
  });

  return responderComHtmlRelatorio(html, `Relatório NR-01 - ${pesquisa.empresa.nome}`);
}
