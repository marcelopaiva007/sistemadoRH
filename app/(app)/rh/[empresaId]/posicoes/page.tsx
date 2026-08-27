import { requireEmpresaAccess, empresasVisiveis } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { PosicoesTable } from "./posicoes-table";

export default async function PosicoesPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const usuario = await requireEmpresaAccess(empresaId);

  const empresasDoUsuario = await empresasVisiveis(usuario);

  const [posicoes, empresas] = await Promise.all([
    prisma.posicao.findMany({
      where: { empresaId: { in: empresasDoUsuario } },
      orderBy: [{ ativo: "desc" }, { empresaId: "asc" }, { nome: "asc" }],
      include: {
        // Só ATIVOS contam na tela — mesma ordem do dono aplicada em Setores.
        _count: { select: { colaboradores: { where: { ativo: true } }, vagas: true } },
        empresa: { select: { id: true, nome: true, marcaId: true } },
      },
    }),
    prisma.empresa.findMany({
      where: { id: { in: empresasDoUsuario } },
      select: { id: true, nome: true, marcaId: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  const vinculosPorPosicao = await prisma.colaborador.groupBy({
    by: ["posicaoId"],
    where: { empresaId: { in: empresasDoUsuario } },
    _count: { _all: true },
  });
  const totalPorPosicao = new Map(vinculosPorPosicao.map((v) => [v.posicaoId, v._count._all]));

  return (
    <PosicoesTable
      empresaId={empresaId}
      empresasDoUsuario={empresasDoUsuario}
      posicoes={posicoes.map((p) => ({ ...p, vinculadosTotais: totalPorPosicao.get(p.id) ?? 0 }))}
      empresas={empresas}
    />
  );
}
