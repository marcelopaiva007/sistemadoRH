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
        _count: { select: { colaboradores: true, vagas: true } },
        empresa: { select: { id: true, nome: true } },
      },
    }),
    prisma.empresa.findMany({
      where: { id: { in: empresasDoUsuario } },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  return (
    <PosicoesTable
      empresaId={empresaId}
      empresasDoUsuario={empresasDoUsuario}
      posicoes={posicoes}
      empresas={empresas}
    />
  );
}
