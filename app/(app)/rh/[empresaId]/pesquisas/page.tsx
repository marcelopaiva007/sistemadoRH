import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { PesquisasTable } from "./pesquisas-table";

export default async function PesquisasPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  const pesquisas = await prisma.pesquisa.findMany({
    where: { empresaId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { perguntas: true, tokens: true, respostas: true } } },
  });

  return <PesquisasTable empresaId={empresaId} pesquisas={pesquisas} />;
}
