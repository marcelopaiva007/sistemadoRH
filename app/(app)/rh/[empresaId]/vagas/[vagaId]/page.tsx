import { notFound } from "next/navigation";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { VagaDetalhe } from "./vaga-detalhe";

export default async function VagaPage({
  params,
}: {
  params: Promise<{ empresaId: string; vagaId: string }>;
}) {
  const { empresaId, vagaId } = await params;
  await requireEmpresaAccess(empresaId);

  const vaga = await prisma.vaga.findFirst({
    where: { id: vagaId, empresaId },
    include: { setor: { select: { nome: true } }, posicao: { select: { nome: true } } },
  });
  if (!vaga) notFound();

  const candidaturas = await prisma.candidatura.findMany({
    where: { vagaId },
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      etapa: true,
      motivo: true,
      colaboradorId: true,
      createdAt: true,
      candidato: {
        select: {
          id: true,
          nome: true,
          email: true,
          telefone: true,
          cidade: true,
          origem: true,
          arquivo: { select: { id: true, nome: true } },
        },
      },
    },
  });

  return <VagaDetalhe empresaId={empresaId} vaga={vaga} candidaturas={candidaturas} />;
}
