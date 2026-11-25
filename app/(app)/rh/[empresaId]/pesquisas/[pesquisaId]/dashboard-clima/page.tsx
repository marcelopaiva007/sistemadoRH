import { notFound } from "next/navigation";
import { empresasVisiveis, requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { cnpjsVisiveisDaMarca, marcaDaEmpresa } from "@/lib/escopo-marca";
import { CONVITES_NA_PESQUISA } from "@/lib/pesquisa-numeros";
import { calcularClima, compararCiclos, extrairEvolucao, gerarAnaliseExecutiva, type RespostaPrisma } from "@/lib/clima";
import { DashboardClimaView } from "./dashboard-clima-view";

export default async function DashboardClimaPage({
  params,
}: {
  params: Promise<{ empresaId: string; pesquisaId: string }>;
}) {
  const { empresaId, pesquisaId } = await params;
  const usuario = await requireEmpresaAccess(empresaId);

  // Pesquisa é da MARCA (26/11/2026): esta, o ciclo anterior e o histórico
  // saem da mesma marca do CNPJ do caminho, criadas em CNPJ que o usuário
  // enxerga — o mesmo recorte da lista de pesquisas. Antes o ciclo anterior e
  // o histórico filtravam pelo CNPJ do caminho e perdiam os ciclos criados no
  // CNPJ irmão.
  const [marcaId, cnpjsDaMarca] = await Promise.all([
    marcaDaEmpresa(empresaId),
    empresasVisiveis(usuario).then((visiveis) => cnpjsVisiveisDaMarca(empresaId, visiveis)),
  ]);
  const daMarcaVisivel = { marcaId, empresaId: { in: cnpjsDaMarca } };

  const pesquisa = await prisma.pesquisa.findFirst({
    where: { id: pesquisaId, ...daMarcaVisivel, modelo: "CLIMA" },
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
    where: { ...daMarcaVisivel, modelo: "CLIMA", encerradaEm: { not: null }, id: { not: pesquisaId } },
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

  // Enriquece análise executiva com comparativo + participação
  const participacaoPct = convites > 0 ? Math.round((resultado.totalRespostas / convites) * 100) : 0;
  resultado.analiseExecutiva = gerarAnaliseExecutiva(resultado, comparativo, participacaoPct);

  // Evolução dos últimos 5 ciclos
  const ciclosHistorico = await prisma.pesquisa.findMany({
    where: { ...daMarcaVisivel, modelo: "CLIMA", encerradaEm: { not: null } },
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
