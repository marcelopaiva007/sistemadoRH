import { requireEmpresaAccess, empresasVisiveis } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { ColaboradoresTable } from "./colaboradores-table";

export default async function ColaboradoresPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const usuario = await requireEmpresaAccess(empresaId);

  // Buscar de todas as empresas que o usuário tem acesso
  const empresasDoUsuario = await empresasVisiveis(usuario);

  const [colaboradores, setores, posicoes] = await Promise.all([
    prisma.colaborador.findMany({
      where: { empresaId: { in: empresasDoUsuario } },
      orderBy: [{ ativo: "desc" }, { empresaId: "asc" }, { nome: "asc" }],
      include: { setor: true, posicao: true, empresa: { select: { id: true, nome: true } } },
    }),
    prisma.setor.findMany({ where: { empresaId: { in: empresasDoUsuario }, ativo: true }, orderBy: { nome: "asc" } }),
    prisma.posicao.findMany({ where: { empresaId: { in: empresasDoUsuario }, ativo: true }, orderBy: { nome: "asc" } }),
  ]);

  return (
    <ColaboradoresTable
      empresaId={empresaId}
      empresasDoUsuario={empresasDoUsuario}
      colaboradores={colaboradores}
      setores={setores}
      posicoes={posicoes}
    />
  );
}
