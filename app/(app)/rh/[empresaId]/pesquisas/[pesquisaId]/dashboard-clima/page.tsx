import { notFound } from "next/navigation";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { CONVITES_NA_PESQUISA } from "@/lib/pesquisa-numeros";
import { calcularClima, compararCiclos, extrairEvolucao, type RespostaPrisma } from "@/lib/clima";
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
    },
  });
  if (!pesquisa) notFound();

  const [convites, respostas, perguntas] = await Promise.all([
    prisma.surveyToken.count({ where: { pesquisaId, ...CONVITES_NA_PESQUISA } }),
    prisma.resposta.findMany({
      where: { pesquisaId },
      include: {
        itens: { include: { pergunta: true } },
      },
    }),
    prisma.pergunta.findMany({
      where: { pesquisaId },
      select: { id: true, dimensaoGPTW: true, dimensao: true, enunciado: true, tipo: true },
    }),
  ]);

  const respostasTipadas: RespostaPrisma[] = respostas.map((r) => ({
    setorNomeSnapshot: r.setorNomeSnapshot,
    sexoSnapshot: r.sexoSnapshot,
    faixaEtariaSnapshot: r.faixaEtariaSnapshot,
    itens: r.itens.map((i) => ({
      pergunta: {
        id: i.pergunta.id,
        enunciado: i.pergunta.enunciado,
        dimensaoGPTW: i.pergunta.dimensaoGPTW,
        dimensao: i.pergunta.dimensao,
        tipo: i.pergunta.tipo,
      },
      valorNumerico: i.valorNumerico,
      valorTexto: i.valorTexto,
    })),
  }));

  const { resultado } = calcularClima({ respostas: respostasTipadas, perguntas });

  // Último ciclo anterior para comparativo
  const cicloAnterior = await prisma.pesquisa.findFirst({
    where: { empresaId, modelo: "CLIMA", encerradaEm: { not: null }, id: { not: pesquisaId } },
    orderBy: { encerradaEm: "desc" },
    include: {
      respostas: { include: { itens: { include: { pergunta: true } } } },
    },
  });

  let comparativo = null;
  if (cicloAnterior) {
    const respostasAnterior: RespostaPrisma[] = cicloAnterior.respostas.map((r) => ({
      setorNomeSnapshot: r.setorNomeSnapshot,
      sexoSnapshot: r.sexoSnapshot,
      faixaEtariaSnapshot: r.faixaEtariaSnapshot,
      itens: r.itens.map((i) => ({
        pergunta: {
          id: i.pergunta.id,
          enunciado: i.pergunta.enunciado,
          dimensaoGPTW: i.pergunta.dimensaoGPTW,
          dimensao: i.pergunta.dimensao,
          tipo: i.pergunta.tipo,
        },
        valorNumerico: i.valorNumerico,
        valorTexto: i.valorTexto,
      })),
    }));
    const { resultado: resultadoAnterior } = calcularClima({
      respostas: respostasAnterior,
      perguntas: [],
    });
    comparativo = compararCiclos(resultado, resultadoAnterior);
  }

  // Evolução dos últimos 5 ciclos
  const ciclosHistorico = await prisma.pesquisa.findMany({
    where: { empresaId, modelo: "CLIMA", encerradaEm: { not: null } },
    orderBy: { encerradaEm: "desc" },
    take: 5,
    include: {
      respostas: { include: { itens: { include: { pergunta: true } } } },
    },
  });

  const evolucao = extrairEvolucao(
    ciclosHistorico
      .map((c) => ({
        titulo: c.titulo,
        encerradaEm: c.encerradaEm!,
        respostas: c.respostas.map((r) => ({
          setorNomeSnapshot: r.setorNomeSnapshot,
          sexoSnapshot: r.sexoSnapshot,
          faixaEtariaSnapshot: r.faixaEtariaSnapshot,
          itens: r.itens.map((i) => ({
            pergunta: {
              id: i.pergunta.id,
              enunciado: i.pergunta.enunciado,
              dimensaoGPTW: i.pergunta.dimensaoGPTW,
              dimensao: i.pergunta.dimensao,
              tipo: i.pergunta.tipo,
            },
            valorNumerico: i.valorNumerico,
            valorTexto: i.valorTexto,
          })),
        })),
      })),
    // só do atual + históricos
  );

  return (
    <DashboardClimaView
      pesquisa={pesquisa}
      empresaId={empresaId}
      convites={convites}
      resultado={resultado}
      comparativo={comparativo}
      evolucao={evolucao}
    />
  );
}
