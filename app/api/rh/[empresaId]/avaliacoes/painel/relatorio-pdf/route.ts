// Gera o Relatório de Avaliação de Desempenho (visão consolidada da
// campanha) em PDF. Mesmo padrão de relatorio-clima-pdf: HTML server-side
// renderizado por Chromium headless.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { empresasVisiveis } from "@/lib/rh-auth-guard";
import { empresasDaMesmaMarca } from "@/lib/escopo-marca";
import { calcularPainelAvaliacao } from "@/lib/avaliacao-painel";
import { gerarHtmlRelatorioAvaliacao } from "@/lib/avaliacao-relatorio";
import { responderComHtmlRelatorio } from "@/lib/pdf-browser";

export const runtime = "nodejs";
export const maxDuration = 60;

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

  // Verifica acesso: ADMIN, DIRETORIA, acesso direto, ou acesso via marca
  if (user.role === "ADMIN" || user.role === "DIRETORIA") {
    // ADMIN e DIRETORIA têm acesso a tudo
  } else if (!user.empresas.some((e) => e.empresaId === empresaId && e.ativo)) {
    // Sem acesso direto à empresa, verifica acesso por marca
    const idsDaMarca = await empresasDaMesmaMarca(empresaId);
    const temAcessoMarca = idsDaMarca.some(id => user.empresas.some(e => e.empresaId === id && e.ativo));
    if (!temAcessoMarca) {
      return NextResponse.json({ error: "Sem acesso a esta empresa." }, { status: 403 });
    }
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

  return responderComHtmlRelatorio(html, `Relatório de Avaliação de Desempenho - ${campanha}`);
}
