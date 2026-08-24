import { requireEmpresaAccess, empresasVisiveis } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { SetoresTable } from "./setores-table";

export default async function SetoresPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const usuario = await requireEmpresaAccess(empresaId);

  const empresasDoUsuario = await empresasVisiveis(usuario);

  const [setores, empresas] = await Promise.all([
    prisma.setor.findMany({
      where: { empresaId: { in: empresasDoUsuario } },
      orderBy: [{ ativo: "desc" }, { empresaId: "asc" }, { nome: "asc" }],
      include: {
        _count: { select: { colaboradores: true, vagas: true, metas: true } },
        empresa: { select: { id: true, nome: true, marcaId: true } },
      },
    }),
    prisma.empresa.findMany({
      where: { id: { in: empresasDoUsuario } },
      select: { id: true, nome: true, marcaId: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  return (
    <SetoresTable
      empresaId={empresaId}
      empresasDoUsuario={empresasDoUsuario}
      setores={setores}
      empresas={empresas}
    />
  );
}
