import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { calcularNR01 } from "@/lib/nr01";
import { DashboardNR01View } from "./dashboard-view";

// Dashboard de Riscos Psicossociais (NR-01). Sempre escopado à empresa da
// rota; a pesquisa exibida pode ser trocada via ?pesquisa=<id> (sempre da
// mesma empresa — nunca mistura empresas).
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

  const pesquisasNR01 = await prisma.pesquisa.findMany({
    where: { empresaId, modelo: "NR01" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      titulo: true,
      status: true,
      _count: { select: { respostas: true, tokens: true } },
    },
  });

  const selecionada =
    pesquisasNR01.find((p) => p.id === pesquisaIdParam) ?? pesquisasNR01[0] ?? null;

  if (!selecionada) {
    return <DashboardNR01View pesquisas={[]} resultado={null} pesquisaSelecionada={null} convites={0} empresaId={empresaId} />;
  }

  const [perguntas, respostas] = await Promise.all([
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
      pesquisas={pesquisasNR01.map((p) => ({ id: p.id, titulo: p.titulo, status: p.status }))}
      pesquisaSelecionada={selecionada.id}
      convites={selecionada._count.tokens}
      resultado={resultado}
    />
  );
}
