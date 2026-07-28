import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { CONVITES_NA_PESQUISA } from "@/lib/pesquisa-numeros";
import { PesquisasTable } from "./pesquisas-table";

export default async function PesquisasPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  const pesquisas = await prisma.pesquisa.findMany({
    where: { empresaId },
    orderBy: { createdAt: "desc" },
    include: {
      // Excluídos não contam como convite em lugar nenhum.
      _count: {
        select: { perguntas: true, tokens: { where: CONVITES_NA_PESQUISA }, respostas: true },
      },
    },
  });

  return <PesquisasTable empresaId={empresaId} pesquisas={pesquisas} />;
}
