import { notFound } from "next/navigation";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { ConvitesView } from "../convites-view";

// A lista de convidados. É a tela pesada da pesquisa (uma linha por pessoa),
// e por isso mora numa rota só dela: quem abre a pesquisa para ver o resultado
// não paga por carregar 205 registros.
export default async function ConvitesPage({
  params,
}: {
  params: Promise<{ empresaId: string; pesquisaId: string }>;
}) {
  const { empresaId, pesquisaId } = await params;
  await requireEmpresaAccess(empresaId);

  const pesquisa = await prisma.pesquisa.findFirst({
    where: { id: pesquisaId, empresaId },
    select: { id: true, titulo: true, descricao: true, anonima: true, status: true, modelo: true },
  });
  if (!pesquisa) notFound();

  const [tokens, semConvite] = await Promise.all([
    prisma.surveyToken.findMany({
      where: { pesquisaId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        status: true,
        canal: true,
        erro: true,
        enviadoEm: true,
        colaborador: { select: { id: true, nome: true } },
      },
    }),
    // Quantos ativos ainda não têm convite: é esse número, e não o total de
    // ativos, que diz se vale clicar em "Gerar convites".
    prisma.colaborador.count({
      where: { empresaId, ativo: true, tokens: { none: { pesquisaId } } },
    }),
  ]);

  return (
    <ConvitesView
      empresaId={empresaId}
      pesquisa={pesquisa}
      tokens={tokens}
      semConvite={semConvite}
    />
  );
}
