import { notFound } from "next/navigation";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { CONVITES_NA_PESQUISA } from "@/lib/pesquisa-numeros";
import { calcularClima, calcularNPS, compararCiclos, classificarScore, classificarNPS } from "@/lib/clima";
import { DashboardClimaView } from "./dashboard-clima-view";

export default async function DashboardClimaPage({
  params,
}: {
  params: Promise<{ empresaId: string; pesquisaId: string }>;
}) {
  const { empresaId, pesquisaId } = await params;
  await requireEmpresaAccess(empresaId);

  const pesquisa = await prisma.pesquisa.findFirst({
    where: { id: pesquisaId, empresaId, modelo: "CLIMA" },
    include: {
      empresa: { select: { nome: true } },
      perguntas: {
        where: { tipo: "NPS_10" },
        select: { id: true },
      },
    },
  });
  if (!pesquisa) notFound();

  const [convites, respostas] = await Promise.all([
    prisma.surveyToken.count({ where: { pesquisaId, ...CONVITES_NA_PESQUISA } }),
    prisma.resposta.findMany({
      where: { pesquisaId },
      include: {
        itens: { include: { pergunta: true } },
      },
    }),
  ]);

  const perguntaIdsNPS = pesquisa.perguntas.map((p) => p.id);
  const itensNPS =
    perguntaIdsNPS.length > 0
      ? respostas.flatMap((r) =>
          r.itens
            .filter((i) => perguntaIdsNPS.includes(i.perguntaId))
            .map((i) => ({ valorNumerico: i.valorNumerico })),
        )
      : undefined;

  const { resultado } = calcularClima({
    respostas: respostas.map((r) => ({
      setorNomeSnapshot: r.setorNomeSnapshot,
      itens: r.itens.map((i) => ({
        pergunta: { dimensaoGPTW: i.pergunta.dimensaoGPTW, dimensao: i.pergunta.dimensao },
        valorNumerico: i.valorNumerico,
      })),
    })),
    perguntaNPS: itensNPS,
  });

  // Ciclo anterior
  const ciclosAnteriores = await prisma.pesquisa.findMany({
    where: { empresaId, modelo: "CLIMA", encerradaEm: { not: null }, id: { not: pesquisaId } },
    orderBy: { encerradaEm: "desc" },
    take: 1,
    include: {
      respostas: {
        include: { itens: { include: { pergunta: true } } },
      },
    },
  });

  let comparativo = null;
  if (ciclosAnteriores.length > 0) {
    const anterior = ciclosAnteriores[0];
    const { resultado: resultadoAnterior } = calcularClima({
      respostas: anterior.respostas.map((r) => ({
        setorNomeSnapshot: r.setorNomeSnapshot,
        itens: r.itens.map((i) => ({
          pergunta: { dimensaoGPTW: i.pergunta.dimensaoGPTW, dimensao: i.pergunta.dimensao },
          valorNumerico: i.valorNumerico,
        })),
      })),
    });
    comparativo = compararCiclos(resultado, resultadoAnterior);
  }

  return (
    <DashboardClimaView
      pesquisa={pesquisa}
      empresaId={empresaId}
      convites={convites}
      resultado={resultado}
      comparativo={comparativo}
    />
  );
}
