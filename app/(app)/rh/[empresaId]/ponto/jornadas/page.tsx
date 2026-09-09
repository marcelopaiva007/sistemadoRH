import { prisma } from "@/lib/prisma";
import { EscalasView } from "../escalas-view";

/**
 * Jornadas e escalas de trabalho. Era a aba "Jornadas & Escalas"; virou página
 * em v1.170.0.
 */
export default async function PontoJornadasPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;

  // TODAS as jornadas, não só as ativas: a inativa precisa aparecer
  // (acinzentada) para poder ser reativada — filtrar aqui a tornava
  // irrecuperável pela tela. Ativas primeiro.
  const jornadas = await prisma.jornadaTrabalho.findMany({
    where: { empresaId },
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
  });

  return <EscalasView empresaId={empresaId} jornadas={jornadas} />;
}
