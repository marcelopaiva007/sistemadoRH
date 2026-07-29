import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { CONVITES_NA_PESQUISA } from "@/lib/pesquisa-numeros";
import { calcularNR01 } from "@/lib/nr01";
import { DashboardNR01View } from "./dashboard-view";

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ pesquisa?: string }>;
}) {
  const { empresaId } = await params;
  const { pesquisa: pesquisaIdParam } = await searchParams;
  await requireEmpresaAccess(empresaId);

  // Busca ambas: NR01 e CLIMA
  const [pesquisasNR01, pesquisasClima] = await Promise.all([
    prisma.pesquisa.findMany({
      where: { empresaId, modelo: "NR01" },
      orderBy: { createdAt: "desc" },
      select: { id: true, titulo: true, status: true, _count: { select: { respostas: true } } },
    }),
    prisma.pesquisa.findMany({
      where: { empresaId, modelo: "CLIMA" },
      orderBy: { createdAt: "desc" },
      select: { id: true, titulo: true, status: true, _count: { select: { respostas: true } } },
    }),
  ]);

  // Se tiver pesquisa de Clima ACTIVE, prioriza; senão volta para NR01
  const climaAtiva = pesquisasClima.find((p) => p.status === "ACTIVE");
  const selecionada =
    (pesquisaIdParam ? pesquisasNR01.concat(pesquisasClima).find((p) => p.id === pesquisaIdParam) : null) ||
    climaAtiva ||
    pesquisasNR01[0] ||
    null;

  if (!selecionada) {
    return <DashboardNR01View pesquisas={[]} resultado={null} pesquisaSelecionada={null} convites={0} empresaId={empresaId} />;
  }

  // Se for Clima, redireciona para a página de Resultados da pesquisa
  if (selecionada.id === climaAtiva?.id || pesquisasClima.find((p) => p.id === selecionada.id)) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Pesquisa de Clima Organizacional</p>
        <a
          href={`/rh/${empresaId}/pesquisas/${selecionada.id}/resultados`}
          className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Ver resultados
        </a>
      </div>
    );
  }

  // Segue com NR01
  const [convites, perguntas, respostas] = await Promise.all([
    prisma.surveyToken.count({
      where: { pesquisaId: selecionada.id, ...CONVITES_NA_PESQUISA },
    }),
    prisma.pergunta.findMany({
      where: { pesquisaId: selecionada.id },
      select: { id: true, codigo: true, enunciado: true, dimensao: true, invertida: true },
    }),
    prisma.resposta.findMany({
      where: { pesquisaId: selecionada.id },
      select: {
        setorNomeSnapshot: true,
        posicaoNomeSnapshot: true,
        itens: { select: { perguntaId: true, valorNumerico: true } },
      },
    }),
  ]);

  const resultado = calcularNR01(perguntas, respostas);

  return (
    <DashboardNR01View
      empresaId={empresaId}
      pesquisas={[...pesquisasNR01, ...pesquisasClima].map((p) => ({ id: p.id, titulo: p.titulo, status: p.status }))}
      pesquisaSelecionada={selecionada.id}
      convites={convites}
      resultado={resultado}
    />
  );
}
