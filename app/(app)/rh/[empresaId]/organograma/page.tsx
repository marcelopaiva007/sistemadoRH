import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { OrganogramaView } from "./organograma-view";

// Organograma vivo: montado na hora a partir de Colaborador.supervisorId, não
// de um desenho que alguém mantém à parte — muda sozinho quando uma
// movimentação troca o líder de alguém.
export default async function OrganogramaPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  // O organograma é da MARCA inteira, não do CNPJ da URL. Quem lidera quem não
  // respeita fronteira de CNPJ no grupo: um supervisor da RSM tem gente da
  // BRNET e da BR SISTEMAS embaixo. Filtrando por empresa, a hierarquia
  // aparecia picotada — cada CNPJ mostrava um pedaço e ninguém via a estrutura.
  const empresa = await prisma.empresa.findUniqueOrThrow({
    where: { id: empresaId },
    select: { marcaId: true, marca: { select: { nome: true } } },
  });
  const empresasDaMarca = await prisma.empresa.findMany({
    where: { marcaId: empresa.marcaId, ativo: true },
    select: { id: true },
  });

  const colaboradores = await prisma.colaborador.findMany({
    where: { empresaId: { in: empresasDaMarca.map((e) => e.id) }, ativo: true },
    orderBy: { nome: "asc" },
    select: {
      id: true,
      nome: true,
      supervisorId: true,
      setor: { select: { nome: true } },
      posicao: { select: { nome: true } },
      // Com vários CNPJs na mesma árvore, saber de qual cada pessoa é deixa de
      // ser detalhe e vira informação.
      empresa: { select: { nome: true } },
    },
  });

  return (
    <OrganogramaView
      empresaId={empresaId}
      colaboradores={colaboradores}
      marcaNome={empresa.marca.nome}
      totalCnpjs={empresasDaMarca.length}
    />
  );
}
