import { notFound } from "next/navigation";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { opcoesDoCatalogo } from "@/lib/catalogos";
import { CicloDetalhe } from "./ciclo-detalhe";

export default async function CicloAvaliacaoPage({
  params,
}: {
  params: Promise<{ empresaId: string; cicloId: string }>;
}) {
  const { empresaId, cicloId } = await params;
  await requireEmpresaAccess(empresaId);

  const ciclo = await prisma.cicloAvaliacao.findFirst({ where: { id: cicloId, empresaId } });
  if (!ciclo) notFound();

  const [avaliacoes, colaboradores] = await Promise.all([
    prisma.avaliacaoDesempenho.findMany({
      where: { cicloId },
      orderBy: [{ colaboradorId: "asc" }, { tipoAvaliador: "asc" }],
      select: {
        id: true,
        colaboradorId: true,
        tipoAvaliador: true,
        avaliadorId: true,
        avaliadorNome: true,
        notaFinal: true,
        potencial: true,
        pontosFortes: true,
        pontosDesenvolvimento: true,
        comentarios: true,
        status: true,
        concluidaEm: true,
        colaborador: { select: { nome: true, setor: { select: { nome: true } } } },
        notas: { select: { competencia: true, nota: true } },
      },
    }),
    prisma.colaborador.findMany({
      where: { empresaId, ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
  ]);

  const competenciasDisponiveis = await opcoesDoCatalogo(empresaId, "COMPETENCIA");

  return (
    <CicloDetalhe
      empresaId={empresaId}
      ciclo={ciclo}
      avaliacoes={avaliacoes}
      colaboradores={colaboradores}
      competenciasDisponiveis={competenciasDisponiveis}
    />
  );
}
