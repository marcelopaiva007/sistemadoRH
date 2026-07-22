import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { ColaboradoresTable } from "./colaboradores-table";

export default async function ColaboradoresPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  const [colaboradores, setores, posicoes] = await Promise.all([
    prisma.colaborador.findMany({
      where: { empresaId },
      orderBy: [{ ativo: "desc" }, { nome: "asc" }],
      include: { setor: true, posicao: true },
    }),
    prisma.setor.findMany({ where: { empresaId, ativo: true }, orderBy: { nome: "asc" } }),
    prisma.posicao.findMany({ where: { empresaId, ativo: true }, orderBy: { nome: "asc" } }),
  ]);

  return (
    <ColaboradoresTable empresaId={empresaId} colaboradores={colaboradores} setores={setores} posicoes={posicoes} />
  );
}
