import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { SetoresTable } from "./setores-table";

export default async function SetoresPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  const setores = await prisma.setor.findMany({
    where: { empresaId },
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    include: { _count: { select: { colaboradores: true } } },
  });

  return <SetoresTable empresaId={empresaId} setores={setores} />;
}
