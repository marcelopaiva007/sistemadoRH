import { notFound } from "next/navigation";
import { empresasVisiveis, requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { marcaDaEmpresa } from "@/lib/escopo-marca";
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
  const usuario = await requireEmpresaAccess(empresaId);

  // A pesquisa é da marca, mas a LISTA de convidados mostra só quem é de CNPJ
  // que o usuário enxerga (25/11/2026). Era a marca inteira: um RH de um CNPJ
  // via nome, canal e erro de envio de funcionário de CNPJ irmão que não
  // alcança em nenhuma outra tela. Para quem vê a marca toda, nada muda.
  const [marcaId, visiveis] = await Promise.all([
    marcaDaEmpresa(empresaId),
    empresasVisiveis(usuario),
  ]);

  const pesquisa = await prisma.pesquisa.findFirst({
    where: { id: pesquisaId, marcaId },
    select: { id: true, titulo: true, descricao: true, anonima: true, status: true, modelo: true },
  });
  if (!pesquisa) notFound();

  const [tokens, semConvite] = await Promise.all([
    prisma.surveyToken.findMany({
      where: { pesquisaId, colaborador: { empresaId: { in: visiveis } } },
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
    // ativos, que diz se vale clicar em "Gerar convites". Sobre a MARCA, o
    // mesmo universo do botão — por CNPJ ele diria "lista completa" com
    // quatro CNPJs da marca ainda sem convite nenhum. Recortado aos CNPJs
    // visíveis, como a lista acima — o número tem que bater com o que a
    // pessoa consegue conferir na tela.
    prisma.colaborador.count({
      where: {
        empresa: { marcaId },
        empresaId: { in: visiveis },
        ativo: true,
        tokens: { none: { pesquisaId } },
      },
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
