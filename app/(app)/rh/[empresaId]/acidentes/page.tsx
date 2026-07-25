import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { AcidentesView } from "./acidentes-view";

// Visão consolidada de acidentes de trabalho / CAT da empresa. A CAT pendente
// vem primeiro: é o item com prazo legal mais curto (1 dia útil) e o que mais
// pega numa fiscalização quando fica para trás.
export default async function AcidentesPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  const acidentes = await prisma.acidenteTrabalho.findMany({
    where: { empresaId },
    orderBy: [{ catEmitida: "asc" }, { dataHora: "desc" }],
    select: {
      id: true,
      dataHora: true,
      tipo: true,
      descricao: true,
      houveAfastamento: true,
      catEmitida: true,
      catNumero: true,
      situacao: true,
      colaboradorId: true,
      colaborador: { select: { nome: true, setor: { select: { nome: true } } } },
    },
  });

  const catsPendentes = acidentes.filter((a) => !a.catEmitida).length;
  const emInvestigacao = acidentes.filter((a) => a.situacao !== "CONCLUIDO").length;

  return (
    <AcidentesView
      empresaId={empresaId}
      acidentes={acidentes}
      resumo={{ total: acidentes.length, catsPendentes, emInvestigacao }}
    />
  );
}
