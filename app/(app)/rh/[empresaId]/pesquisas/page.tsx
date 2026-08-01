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
  const [empresas, ativosPorEmpresa, pesquisas, convitesPorPesquisa] = await Promise.all([
    // A marca de cada CNPJ visível. É o que deixa o filtro da lateral — que
    // seleciona CNPJs — recortar uma lista cujo assunto é marca.
    prisma.empresa.findMany({
      where: { id: { in: empresasDoUsuario } },
      select: { id: true, marcaId: true },
    }),
    // Quantos colaboradores existem hoje, por CNPJ — somados por marca logo
    // abaixo. É o número que dá sentido aos outros dois: 205 convites sobre
    // 208 cadastrados diz que a lista está em dia; sobre 260, diz que falta
    // gerar convite para muita gente.
    prisma.colaborador.groupBy({
      by: ["empresaId"],
      where: { empresaId: { in: empresasDoUsuario }, ativo: true },
      _count: { _all: true },
    }),
    // Por marca, e não pelos CNPJs: a pesquisa pertence à marca, e uma criada
    // na RSM tem que aparecer para quem entrou por qualquer CNPJ da LM Telecom.
    prisma.pesquisa.findMany({
      where: { empresa: { id: { in: empresasDoUsuario } } },
      orderBy: { createdAt: "desc" },
      include: {
        marca: { select: { nome: true } },
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

  const marcaDoCnpj = Object.fromEntries(empresas.map((e) => [e.id, e.marcaId]));
  const colaboradoresAtivos: Record<string, number> = {};
  for (const g of ativosPorEmpresa) {
    const marcaId = marcaDoCnpj[g.empresaId];
    if (marcaId) colaboradoresAtivos[marcaId] = (colaboradoresAtivos[marcaId] ?? 0) + g._count._all;
  }

  return (
    <PesquisasTable
      empresaId={empresaId}
      empresasDoUsuario={empresasDoUsuario}
      marcaDoCnpj={marcaDoCnpj}
      colaboradoresAtivos={colaboradoresAtivos}
      pesquisas={pesquisas.map((p) => ({
        ...p,
        marcaNome: p.marca.nome,
        _count: { ...p._count, tokens: convites.get(p.id) ?? 0 },
      }))}
    />
  );
}
