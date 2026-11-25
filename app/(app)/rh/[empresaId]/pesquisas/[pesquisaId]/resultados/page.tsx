import { notFound } from "next/navigation";
import { apurarPorPergunta } from "@/lib/pesquisa-apuracao";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { marcaDaEmpresa } from "@/lib/escopo-marca";
import { CONVITES_NA_PESQUISA } from "@/lib/pesquisa-numeros";
import { calcularResultadoEnps } from "@/lib/pesquisa-enps-resultado";
import { AMOSTRA_MINIMA_ANONIMATO } from "@/lib/constants-rh";
import { ResultadosView } from "../resultados-view";

export default async function ResultadosPage({
  params,
}: {
  params: Promise<{ empresaId: string; pesquisaId: string }>;
}) {
  const { empresaId, pesquisaId } = await params;
  await requireEmpresaAccess(empresaId);

  const pesquisa = await prisma.pesquisa.findFirst({
    where: { id: pesquisaId, marcaId: await marcaDaEmpresa(empresaId) },
    select: { id: true, anonima: true, modelo: true },
  });
  if (!pesquisa) notFound();

  const [convites, respostas, perguntas] = await Promise.all([
    prisma.surveyToken.count({ where: { pesquisaId, ...CONVITES_NA_PESQUISA } }),
    prisma.resposta.findMany({
      where: { pesquisaId },
      include: { itens: { include: { pergunta: true } } },
    }),
    // Com as opções: múltipla escolha se lê pela DISTRIBUIÇÃO, e o rótulo de
    // cada opção mora aqui, não na resposta (que guarda só o opcaoId).
    prisma.pergunta.findMany({
      where: { pesquisaId },
      select: {
        id: true, ordem: true, enunciado: true, tipo: true,
        opcoes: { select: { id: true, texto: true, ordem: true } },
      },
      orderBy: { ordem: "asc" },
    }),
  ]);

  // Apuração pergunta a pergunta. Os gráficos de dimensão/setor abaixo só
  // enxergam nota numérica — múltipla escolha e texto livre ficavam invisíveis
  // (ver lib/pesquisa-apuracao.ts).
  const porPergunta = apurarPorPergunta(
    perguntas,
    respostas.flatMap((r) =>
      r.itens.map((i) => ({
        perguntaId: i.perguntaId,
        valorNumerico: i.valorNumerico,
        valorTexto: i.valorTexto,
        opcaoId: i.opcaoId,
      })),
    ),
  );

  // P05-ENPS: 1 pergunta de nota (0-10) + 2 abertas — os gráficos genéricos
  // de dimensão/setor abaixo não fazem sentido pra esse formato.
  const resultadoEnps =
    pesquisa.modelo === "P05-ENPS"
      ? calcularResultadoEnps(
          respostas.flatMap((r) => r.itens.filter((i) => i.pergunta.tipo === "NPS_10")),
        )
      : null;

  // Médias por dimensão e por setor (26/11/2026):
  // - só escalas de concordância/frequência entram (LIKERT_5, FREQ_0_4) — a
  //   nota NPS (0-10) puxava a média de 1-5 para cima;
  // - `respostas` conta PESSOAS (Resposta distintas), não itens;
  // - setor com menos pessoas que o piso de anonimato não manda média ao
  //   navegador: vai só o nome e a contagem, em `setoresSemAmostra`.
  const TIPOS_NA_MEDIA = new Set(["LIKERT_5", "FREQ_0_4"]);
  type Acumulador = { soma: number; qtd: number; pessoas: Set<string> };
  const porDimensao = new Map<string, Acumulador>();
  const porSetor = new Map<string, Acumulador>();
  const acumular = (mapa: Map<string, Acumulador>, chave: string, valor: number, pessoa: string) => {
    const atual = mapa.get(chave) ?? { soma: 0, qtd: 0, pessoas: new Set<string>() };
    atual.soma += valor;
    atual.qtd += 1;
    atual.pessoas.add(pessoa);
    mapa.set(chave, atual);
  };

  for (const resposta of respostas) {
    for (const item of resposta.itens) {
      if (item.valorNumerico == null || !TIPOS_NA_MEDIA.has(item.pergunta.tipo)) continue;
      // Usa dimensaoGPTW se existir, senão dimensão do modelo NR-01, senão "GERAL"
      const dimensao = item.pergunta.dimensaoGPTW || item.pergunta.dimensao || "GERAL";
      acumular(porDimensao, dimensao, item.valorNumerico, resposta.id);
      acumular(porSetor, resposta.setorNomeSnapshot, item.valorNumerico, resposta.id);
    }
  }

  const mediaPorDimensao = [...porDimensao.entries()].map(([dimensao, v]) => ({
    dimensao,
    media: v.soma / v.qtd,
    respostas: v.pessoas.size,
  }));

  const mediaPorSetor = [...porSetor.entries()]
    .filter(([, v]) => v.pessoas.size >= AMOSTRA_MINIMA_ANONIMATO)
    .map(([setor, v]) => ({ setor, media: v.soma / v.qtd, respostas: v.pessoas.size }));
  const setoresSemAmostra = [...porSetor.entries()]
    .filter(([, v]) => v.pessoas.size < AMOSTRA_MINIMA_ANONIMATO)
    .map(([setor, v]) => ({ setor, respostas: v.pessoas.size }));

  return (
    <ResultadosView
      totalRespostas={respostas.length}
      convites={convites}
      anonima={pesquisa.anonima}
      porPergunta={porPergunta}
      mediaPorDimensao={mediaPorDimensao}
      mediaPorSetor={mediaPorSetor}
      setoresSemAmostra={setoresSemAmostra}
      resultadoEnps={resultadoEnps}
    />
  );
}
