import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { opcoesDoCatalogo } from "@/lib/catalogos";
import { MetasView } from "./metas-view";

// Metas por pessoa ou por setor, nunca as duas (constraint no banco). PDI é
// por colaborador e vive na ficha — aqui é só a visão consolidada de metas
// da empresa inteira.
export default async function MetasPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  const [metas, colaboradores, setores, statusDisponiveis] = await Promise.all([
    prisma.meta.findMany({
      where: { empresaId },
      orderBy: [{ dataFim: "asc" }],
      select: {
        id: true,
        titulo: true,
        descricao: true,
        dataInicio: true,
        dataFim: true,
        progresso: true,
        status: true,
        colaborador: { select: { id: true, nome: true } },
        setor: { select: { id: true, nome: true } },
      },
    }),
    prisma.colaborador.findMany({
      where: { empresaId, ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
    prisma.setor.findMany({
      where: { empresaId, ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
    opcoesDoCatalogo(empresaId, "STATUS_META"),
  ]);

  return (
    <MetasView
      empresaId={empresaId}
      metas={metas}
      colaboradores={colaboradores}
      setores={setores}
      statusDisponiveis={statusDisponiveis}
    />
  );
}
