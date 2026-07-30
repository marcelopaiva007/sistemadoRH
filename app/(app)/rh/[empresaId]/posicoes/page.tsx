import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { PosicoesTable } from "./posicoes-table";

export default async function PosicoesPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const usuario = await requireEmpresaAccess(empresaId);

  // Buscar de todas as empresas que o usuário tem acesso
  const empresasDoUsuario = usuario.empresas.map((e) => e.empresaId);

  const posicoes = await prisma.posicao.findMany({
    where: { empresaId: { in: empresasDoUsuario } },
    orderBy: [{ ativo: "desc" }, { empresaId: "asc" }, { nome: "asc" }],
    include: {
      _count: { select: { colaboradores: true } },
      empresa: { select: { id: true, nome: true } },
    },
  });

  return <PosicoesTable empresaId={empresaId} empresasDoUsuario={empresasDoUsuario} posicoes={posicoes} />;
}
