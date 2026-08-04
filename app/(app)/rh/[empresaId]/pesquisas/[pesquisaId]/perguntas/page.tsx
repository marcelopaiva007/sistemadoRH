import { notFound } from "next/navigation";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { marcaDaEmpresa } from "@/lib/escopo-marca";
import { opcoesDoCatalogo } from "@/lib/catalogos";
import { PerguntasView } from "../perguntas-view";

export default async function PerguntasPage({
  params,
}: {
  params: Promise<{ empresaId: string; pesquisaId: string }>;
}) {
  const { empresaId, pesquisaId } = await params;
  await requireEmpresaAccess(empresaId);

  const pesquisa = await prisma.pesquisa.findFirst({
    where: { id: pesquisaId, marcaId: await marcaDaEmpresa(empresaId) },
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

  const dimensoesDisponiveis = await opcoesDoCatalogo(empresaId, "DIMENSAO_GPTW");

  return <PerguntasView empresaId={empresaId} pesquisa={pesquisa} dimensoesDisponiveis={dimensoesDisponiveis} />;
}
