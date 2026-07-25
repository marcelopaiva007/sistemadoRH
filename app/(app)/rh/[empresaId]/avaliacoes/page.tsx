import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { AvaliacoesView } from "./avaliacoes-view";

// Lista de ciclos de avaliação de desempenho da empresa. Cada ciclo abre numa
// página própria (o detalhe fica grande: avaliações, nine-box, avaliador
// extra) — aqui é só o painel de controle para criar/acompanhar/encerrar.
export default async function AvaliacoesPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  const [ciclos, contagens] = await Promise.all([
    prisma.cicloAvaliacao.findMany({
      where: { empresaId },
      orderBy: { dataInicio: "desc" },
      select: { id: true, nome: true, tipo: true, dataInicio: true, dataFim: true, encerrado: true },
    }),
    prisma.avaliacaoDesempenho.groupBy({
      by: ["cicloId", "status"],
      where: { empresaId },
      _count: true,
    }),
  ]);

  const progresso = new Map<string, { total: number; concluidas: number }>();
  for (const c of contagens) {
    const atual = progresso.get(c.cicloId) ?? { total: 0, concluidas: 0 };
    atual.total += c._count;
    if (c.status === "CONCLUIDA") atual.concluidas += c._count;
    progresso.set(c.cicloId, atual);
  }

  return (
    <AvaliacoesView
      empresaId={empresaId}
      ciclos={ciclos.map((c) => ({ ...c, progresso: progresso.get(c.id) ?? { total: 0, concluidas: 0 } }))}
    />
  );
}
