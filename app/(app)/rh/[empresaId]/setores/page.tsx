import { requireEmpresaAccess, empresasVisiveis } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { SetoresTable } from "./setores-table";

export default async function SetoresPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const usuario = await requireEmpresaAccess(empresaId);

  // Buscar de todas as empresas que o usuário tem acesso
  const empresasDoUsuario = await empresasVisiveis(usuario);

  const setores = await prisma.setor.findMany({
    where: { empresaId: { in: empresasDoUsuario } },
    orderBy: [{ ativo: "desc" }, { empresaId: "asc" }, { nome: "asc" }],
    include: {
      _count: { select: { colaboradores: true } },
      empresa: { select: { id: true, nome: true } },
    },
  });

  return <SetoresTable empresaId={empresaId} empresasDoUsuario={empresasDoUsuario} setores={setores} />;
}
