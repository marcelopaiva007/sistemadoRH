import { notFound } from "next/navigation";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { PerguntasView } from "../perguntas-view";

export default async function PerguntasPage({
  params,
}: {
  params: Promise<{ empresaId: string; pesquisaId: string }>;
}) {
  const { empresaId, pesquisaId } = await params;
  await requireEmpresaAccess(empresaId);

  const pesquisa = await prisma.pesquisa.findFirst({
    where: { id: pesquisaId, empresaId },
    select: {
      id: true,
      titulo: true,
      descricao: true,
      anonima: true,
      status: true,
      modelo: true,
      perguntas: {
        orderBy: { ordem: "asc" },
        include: { opcoes: { orderBy: { ordem: "asc" } } },
      },
    },
  });
  if (!pesquisa) notFound();

  return <PerguntasView empresaId={empresaId} pesquisa={pesquisa} />;
}
