import { empresasVisiveis, requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { DesligamentosView } from "./desligamentos-view";

// Visão consolidada dos desligamentos: quem saiu, quanto do checklist de saída
// já foi concluído e se a entrevista de desligamento já foi feita. Isso é o
// que falta rastrear depois que a data de desligamento é preenchida na ficha
// — o motivo formal em si já mora lá (Fase 1).
export default async function DesligamentosPage({
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

  const colaboradores = await prisma.colaborador.findMany({
    where: { empresaId: { in: escopo }, dataDesligamento: { not: null } },
    orderBy: { dataDesligamento: "desc" },
    select: {
      id: true,
      nome: true,
      empresaId: true,
      empresa: { select: { nome: true } },
      dataDesligamento: true,
      motivoDesligamento: true,
      checklistDispensado: true,
      setor: { select: { nome: true } },
      checklistDesligamento: { select: { concluido: true } },
      entrevistaDesligamento: { select: { id: true } },
    },
  });

  const desligamentos = colaboradores.map((c) => ({
    id: c.id,
    nome: c.nome,
    empresaId: c.empresaId,
    empresaNome: c.empresa.nome,
    dataDesligamento: c.dataDesligamento!,
    motivoDesligamento: c.motivoDesligamento,
    setorNome: c.setor.nome,
    checklistTotal: c.checklistDesligamento.length,
    checklistConcluido: c.checklistDesligamento.filter((i) => i.concluido).length,
    checklistDispensado: c.checklistDispensado,
    temEntrevista: c.entrevistaDesligamento !== null,
  }));

  // Dispensado não conta como pendência — é justamente o que resolve o "sem
  // como cobrar" de quem saiu antes do sistema existir (ver rh-offboarding.ts).
  const semChecklist = desligamentos.filter(
    (d) => d.checklistTotal === 0 && !d.checklistDispensado,
  ).length;
  const checklistPendente = desligamentos.filter(
    (d) => d.checklistTotal > 0 && d.checklistConcluido < d.checklistTotal,
  ).length;
  const semEntrevista = desligamentos.filter((d) => !d.temEntrevista).length;

  return (
    <DesligamentosView
      desligamentos={desligamentos}
      resumo={{ total: desligamentos.length, semChecklist, checklistPendente, semEntrevista }}
    />
  );
}
