import { notFound } from "next/navigation";
import { apurarPorPergunta } from "@/lib/pesquisa-apuracao";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { marcaDaEmpresa } from "@/lib/escopo-marca";
import { CONVITES_NA_PESQUISA } from "@/lib/pesquisa-numeros";
import { calcularResultadoEnps } from "@/lib/pesquisa-enps-resultado";
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

  const somaPorChave = new Map<string, { soma: number; qtd: number }>();
  const acumular = (chave: string, valor: number) => {
    const atual = somaPorChave.get(chave) ?? { soma: 0, qtd: 0 };
    atual.soma += valor;
    atual.qtd += 1;
    somaPorChave.set(chave, atual);
  };

  for (const resposta of respostas) {
    for (const item of resposta.itens) {
      if (item.valorNumerico == null) continue;
      // Usa dimensaoGPTW se existir, senão dimensão do modelo NR-01, senão "GERAL"
      const dimensao = item.pergunta.dimensaoGPTW || item.pergunta.dimensao || "GERAL";
      acumular(`dimensao:${dimensao}`, item.valorNumerico);
      acumular(`setor:${resposta.setorNomeSnapshot}`, item.valorNumerico);
    }
  }

  const mediaPorDimensao = [...somaPorChave.entries()]
    .filter(([chave]) => chave.startsWith("dimensao:"))
    .map(([chave, v]) => ({
      dimensao: chave.replace("dimensao:", ""),
      media: v.soma / v.qtd,
      respostas: v.qtd,
    }));

  const mediaPorSetor = [...somaPorChave.entries()]
    .filter(([chave]) => chave.startsWith("setor:"))
    .map(([chave, v]) => ({
      setor: chave.replace("setor:", ""),
      media: v.soma / v.qtd,
      respostas: v.qtd,
    }));

  return (
    <ResultadosView
      totalRespostas={respostas.length}
      convites={convites}
      anonima={pesquisa.anonima}
      porPergunta={porPergunta}
      mediaPorDimensao={mediaPorDimensao}
      mediaPorSetor={mediaPorSetor}
      resultadoEnps={resultadoEnps}
    />
  );
}
