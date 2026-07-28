import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { CONVITES_NA_PESQUISA } from "@/lib/pesquisa-numeros";
import { PesquisasTable } from "./pesquisas-table";

export default async function PesquisasPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  // Os convites vêm de um groupBy, e não de um `_count` filtrado dentro do
  // findMany: a contagem de relação com `where` é o tipo de coisa que passa no
  // type-check e devolve o total cru se algo mudar por baixo. Aqui a condição
  // está na consulta, onde dá para conferir.
  const [pesquisas, convitesPorPesquisa] = await Promise.all([
    prisma.pesquisa.findMany({
      where: { empresaId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { perguntas: true, respostas: true } } },
    }),
    prisma.surveyToken.groupBy({
      by: ["pesquisaId"],
      where: { pesquisa: { empresaId }, ...CONVITES_NA_PESQUISA },
      _count: { _all: true },
    }),
  ]);

  const convites = new Map(convitesPorPesquisa.map((g) => [g.pesquisaId, g._count._all]));

  return (
    <PesquisasTable
      empresaId={empresaId}
      pesquisas={pesquisas.map((p) => ({
        ...p,
        _count: { ...p._count, tokens: convites.get(p.id) ?? 0 },
      }))}
    />
  );
}
