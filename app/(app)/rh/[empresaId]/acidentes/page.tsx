import { empresasVisiveis, requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { AcidentesView } from "./acidentes-view";

// Visão consolidada de acidentes de trabalho / CAT da empresa. A CAT pendente
// vem primeiro: é o item com prazo legal mais curto (1 dia útil) e o que mais
// pega numa fiscalização quando fica para trás.
export default async function AcidentesPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ empresas?: string }>;
}) {
  const { empresaId } = await params;
  const { empresas: empresasParam } = await searchParams;
  const usuario = await requireEmpresaAccess(empresaId);

  const visiveis = await empresasVisiveis(usuario);
  // Mesma regra de filtro-empresas.tsx::useFiltroEmpresas: sem filtro na URL,
  // tudo que o usuário enxerga; com filtro, a INTERSEÇÃO — id digitado à mão não
  // vira acesso.
  const pedidas = (empresasParam ?? "").split(",").filter(Boolean);
  const escopo = pedidas.length === 0 ? visiveis : pedidas.filter((id) => visiveis.includes(id));

  const acidentes = await prisma.acidenteTrabalho.findMany({
    where: { empresaId: { in: escopo } },
    orderBy: [{ catEmitida: "asc" }, { dataHora: "desc" }],
    select: {
      id: true,
      empresaId: true,
      dataHora: true,
      tipo: true,
      descricao: true,
      houveAfastamento: true,
      catEmitida: true,
      catNumero: true,
      situacao: true,
      colaboradorId: true,
      colaborador: {
        select: { nome: true, setor: { select: { nome: true } }, empresa: { select: { nome: true } } },
      },
    },
  });

  const catsPendentes = acidentes.filter((a) => !a.catEmitida).length;
  const emInvestigacao = acidentes.filter((a) => a.situacao !== "CONCLUIDO").length;

  return (
    <AcidentesView
      acidentes={acidentes}
      resumo={{ total: acidentes.length, catsPendentes, emInvestigacao }}
    />
  );
}
