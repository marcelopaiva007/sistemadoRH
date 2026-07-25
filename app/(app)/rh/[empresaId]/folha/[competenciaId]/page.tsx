import { notFound } from "next/navigation";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { CompetenciaDetalhe } from "./competencia-detalhe";

export default async function CompetenciaPage({
  params,
}: {
  params: Promise<{ empresaId: string; competenciaId: string }>;
}) {
  const { empresaId, competenciaId } = await params;
  await requireEmpresaAccess(empresaId);

  const competencia = await prisma.competenciaFolha.findFirst({
    where: { id: competenciaId, empresaId },
  });
  if (!competencia) notFound();

  const [eventos, colaboradores] = await Promise.all([
    prisma.eventoFolha.findMany({
      where: { competenciaId },
      orderBy: [{ colaborador: { nome: "asc" } }, { tipo: "asc" }],
      select: {
        id: true,
        tipo: true,
        quantidade: true,
        valor: true,
        observacoes: true,
        origem: true,
        colaboradorId: true,
        colaborador: { select: { nome: true, matricula: true, cpf: true, setor: { select: { nome: true } } } },
      },
    }),
    prisma.colaborador.findMany({
      where: { empresaId, ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
  ]);

  return (
    <CompetenciaDetalhe
      empresaId={empresaId}
      competencia={competencia}
      eventos={eventos}
      colaboradores={colaboradores}
    />
  );
}
