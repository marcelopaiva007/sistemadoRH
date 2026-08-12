import { prisma } from "@/lib/prisma";
import { PontoView } from "./ponto-view";

export default async function PontoPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;

  const [pontos, colaboradores, config] = await Promise.all([
    prisma.ponto.findMany({
      where: { empresaId },
      include: {
        colaborador: {
          select: { id: true, nome: true, setor: { select: { nome: true } } },
        },
      },
      orderBy: { dataHora: "desc" },
      take: 500,
    }),
    prisma.colaborador.findMany({
      where: { empresaId, ativo: true },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
    prisma.configuracaoPonto.findUnique({
      where: { empresaId },
    }),
  ]);

  return (
    <PontoView
      pontos={pontos}
      colaboradores={colaboradores}
      config={config}
      empresaId={empresaId}
    />
  );
}
