import { notFound, redirect } from "next/navigation";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { marcaDaEmpresa } from "@/lib/escopo-marca";
import { carregarAnalisePesquisa } from "@/lib/pesquisa-analise-dados";
import { DashboardPesquisaView } from "./dashboard-pesquisa-view";

/**
 * Dashboard de análise gerencial — vale para TODA pesquisa.
 *
 * Clima e NR-01 já tinham painel próprio, mais especializado (dimensões GPTW;
 * matriz de risco do PGR), e continuam sendo o destino deles: esta rota só
 * redireciona. Para os demais tipos (eNPS, Onboarding, Desligamento e o que
 * vier) o painel é este, alimentado por lib/pesquisa-analise.ts — o mesmo
 * motor do Relatório PDF.
 */
export default async function DashboardPesquisaPage({
  params,
}: {
  params: Promise<{ empresaId: string; pesquisaId: string }>;
}) {
  const { empresaId, pesquisaId } = await params;
  await requireEmpresaAccess(empresaId);
  const marcaId = await marcaDaEmpresa(empresaId);

  const tipo = await prisma.pesquisa.findFirst({
    where: { id: pesquisaId, marcaId },
    select: { modelo: true },
  });
  if (!tipo) notFound();
  if (tipo.modelo === "CLIMA") redirect(`/rh/${empresaId}/pesquisas/${pesquisaId}/dashboard-clima`);
  if (tipo.modelo === "NR01") redirect(`/rh/${empresaId}/dashboard?pesquisa=${pesquisaId}`);

  const dados = await carregarAnalisePesquisa(pesquisaId, marcaId);
  if (!dados) notFound();

  return <DashboardPesquisaView empresaId={empresaId} pesquisa={dados.pesquisa} analise={dados.analise} />;
}
