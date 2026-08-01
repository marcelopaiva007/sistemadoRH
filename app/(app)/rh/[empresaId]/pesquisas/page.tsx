import { requireEmpresaAccess, empresasVisiveis } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { CONVITES_NA_PESQUISA } from "@/lib/pesquisa-numeros";
import { PesquisasTable } from "./pesquisas-table";

export default async function PesquisasPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const usuario = await requireEmpresaAccess(empresaId);

  // Busca de todos os CNPJs que o usuário enxerga, e não só do que está no
  // caminho: quem tem pesquisa em seis empresas e abre a tela com "Todas as
  // marcas" marcado via uma pesquisa só e conclui que as outras sumiram. Quem
  // recorta é o filtro da lateral, no cliente — mesmo desenho de
  // colaboradores/setores/posições.
  const empresasDoUsuario = await empresasVisiveis(usuario);

  // Os convites vêm de um groupBy, e não de um `_count` filtrado dentro do
  // findMany: a contagem de relação com `where` é o tipo de coisa que passa no
  // type-check e devolve o total cru se algo mudar por baixo. Aqui a condição
  // está na consulta, onde dá para conferir.
  const [ativosPorEmpresa, pesquisas, convitesPorPesquisa] = await Promise.all([
    // Quantos colaboradores existem hoje, por CNPJ. É o número que dá sentido
    // aos outros dois: 205 convites sobre 208 cadastrados diz que a lista está
    // em dia; sobre 260, diz que falta gerar convite para muita gente. Por
    // empresa, porque cada linha da tabela pode ser de um CNPJ diferente.
    prisma.colaborador.groupBy({
      by: ["empresaId"],
      where: { empresaId: { in: empresasDoUsuario }, ativo: true },
      _count: { _all: true },
    }),
    prisma.pesquisa.findMany({
      where: { empresaId: { in: empresasDoUsuario } },
      orderBy: { createdAt: "desc" },
      include: {
        empresa: { select: { id: true, nome: true } },
        _count: { select: { perguntas: true, respostas: true } },
      },
    }),
    prisma.surveyToken.groupBy({
      by: ["pesquisaId"],
      where: { pesquisa: { empresaId: { in: empresasDoUsuario } }, ...CONVITES_NA_PESQUISA },
      _count: { _all: true },
    }),
  ]);

  const convites = new Map(convitesPorPesquisa.map((g) => [g.pesquisaId, g._count._all]));
  const colaboradoresAtivos = Object.fromEntries(
    ativosPorEmpresa.map((g) => [g.empresaId, g._count._all]),
  );

  return (
    <PesquisasTable
      empresaId={empresaId}
      empresasDoUsuario={empresasDoUsuario}
      colaboradoresAtivos={colaboradoresAtivos}
      pesquisas={pesquisas.map((p) => ({
        ...p,
        _count: { ...p._count, tokens: convites.get(p.id) ?? 0 },
      }))}
    />
  );
}
