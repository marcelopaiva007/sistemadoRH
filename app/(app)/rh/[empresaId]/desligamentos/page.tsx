import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { DesligamentosView } from "./desligamentos-view";

// Visão consolidada dos desligamentos: quem saiu, quanto do checklist de saída
// já foi concluído e se a entrevista de desligamento já foi feita. Isso é o
// que falta rastrear depois que a data de desligamento é preenchida na ficha
// — o motivo formal em si já mora lá (Fase 1).
export default async function DesligamentosPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  const colaboradores = await prisma.colaborador.findMany({
    where: { empresaId, dataDesligamento: { not: null } },
    orderBy: { dataDesligamento: "desc" },
    select: {
      id: true,
      nome: true,
      dataDesligamento: true,
      motivoDesligamento: true,
      setor: { select: { nome: true } },
      checklistDesligamento: { select: { concluido: true } },
      entrevistaDesligamento: { select: { id: true } },
    },
  });

  const desligamentos = colaboradores.map((c) => ({
    id: c.id,
    nome: c.nome,
    dataDesligamento: c.dataDesligamento!,
    motivoDesligamento: c.motivoDesligamento,
    setorNome: c.setor.nome,
    checklistTotal: c.checklistDesligamento.length,
    checklistConcluido: c.checklistDesligamento.filter((i) => i.concluido).length,
    temEntrevista: c.entrevistaDesligamento !== null,
  }));

  const semChecklist = desligamentos.filter((d) => d.checklistTotal === 0).length;
  const checklistPendente = desligamentos.filter(
    (d) => d.checklistTotal > 0 && d.checklistConcluido < d.checklistTotal,
  ).length;
  const semEntrevista = desligamentos.filter((d) => !d.temEntrevista).length;

  return (
    <DesligamentosView
      empresaId={empresaId}
      desligamentos={desligamentos}
      resumo={{ total: desligamentos.length, semChecklist, checklistPendente, semEntrevista }}
    />
  );
}
