import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { PosicoesTable } from "./posicoes-table";

export default async function PosicoesPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  const posicoes = await prisma.posicao.findMany({
    where: { empresaId },
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    include: { _count: { select: { colaboradores: true } } },
  });

  return <PosicoesTable empresaId={empresaId} posicoes={posicoes} />;
}
