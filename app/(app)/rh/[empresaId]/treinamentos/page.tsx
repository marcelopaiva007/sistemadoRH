import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { TreinamentosView } from "./treinamentos-view";

// Catálogo de treinamentos (não-NR — a capacitação obrigatória de segurança
// já vive em Conformidade desde a Fase 2) e a matriz de competências, que é
// só uma leitura sobre quem participou de que treinamento e o que ele
// desenvolve.
export default async function TreinamentosPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  await requireEmpresaAccess(empresaId);

  const [treinamentos, participacoes] = await Promise.all([
    prisma.treinamento.findMany({
      where: { empresaId },
      orderBy: [{ ativo: "desc" }, { nome: "asc" }],
      select: {
        id: true,
        nome: true,
        descricao: true,
        categoria: true,
        cargaHoraria: true,
        competencias: true,
        ativo: true,
        _count: { select: { participacoes: true } },
      },
    }),
    prisma.participacaoTreinamento.findMany({
      where: { empresaId, presente: true },
      select: {
        colaboradorId: true,
        colaborador: { select: { nome: true } },
        treinamento: { select: { competencias: true } },
      },
    }),
  ]);

  const matriz = new Map<string, { nome: string; competencias: Set<string> }>();
  for (const p of participacoes) {
    const atual = matriz.get(p.colaboradorId) ?? { nome: p.colaborador.nome, competencias: new Set<string>() };
    for (const c of p.treinamento.competencias) atual.competencias.add(c);
    matriz.set(p.colaboradorId, atual);
  }
  const linhasMatriz = [...matriz.entries()]
    .map(([colaboradorId, v]) => ({ colaboradorId, nome: v.nome, competencias: [...v.competencias] }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  return <TreinamentosView empresaId={empresaId} treinamentos={treinamentos} matriz={linhasMatriz} />;
}
