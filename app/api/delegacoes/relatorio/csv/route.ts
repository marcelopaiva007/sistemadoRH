import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDelegacoesAccess } from "@/lib/delegacoes-auth-guard";
import { ehDirecao, paraPainel, SELECT_PAINEL } from "@/lib/delegacoes/consultas";
import { montarPainelEntregas } from "@/lib/delegacoes/painel-entregas";
import { janelaValida, linhasParaCsv } from "@/lib/delegacoes/relatorio";
import { gerarCsv } from "@/lib/csv";

export const runtime = "nodejs";

/**
 * Exportação do Relatório da Direção — MESMA query e MESMA agregação da tela
 * (app/(app)/delegacoes/relatorio/page.tsx), para o CSV nunca divergir do que
 * a tela mostra. Mesmo molde de app/api/rh/[empresaId]/indicadores/csv/route.ts.
 */
export async function GET(req: Request) {
  const usuario = await requireDelegacoesAccess();
  if (!ehDirecao(usuario)) redirect("/delegacoes");

  const dias = new URL(req.url).searchParams.get("dias");
  const janelaDias = janelaValida(dias);

  const agora = new Date();
  const inicioJanela = new Date(agora);
  inicioJanela.setDate(inicioJanela.getDate() - (janelaDias - 1));
  inicioJanela.setHours(0, 0, 0, 0);

  const linhas = await prisma.demanda.findMany({
    where: { createdAt: { gte: inicioJanela } },
    select: SELECT_PAINEL,
  });

  const painel = montarPainelEntregas(linhas.map((d) => paraPainel(d)), agora);
  const { colunas, linhas: linhasCsv } = linhasParaCsv(painel);
  const corpo = gerarCsv(colunas, linhasCsv);

  const nomeArquivo = `relatorio-delegacoes-${janelaDias}dias.csv`;

  return new NextResponse(corpo, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
