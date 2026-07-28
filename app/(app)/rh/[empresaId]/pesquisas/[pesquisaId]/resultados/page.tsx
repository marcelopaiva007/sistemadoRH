import { notFound } from "next/navigation";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { CONVITES_NA_PESQUISA } from "@/lib/pesquisa-numeros";
import { ResultadosView } from "../resultados-view";

export default async function ResultadosPage({
  params,
}: {
  params: Promise<{ empresaId: string; pesquisaId: string }>;
}) {
  const { empresaId, pesquisaId } = await params;
  await requireEmpresaAccess(empresaId);

  const pesquisa = await prisma.pesquisa.findFirst({
    where: { id: pesquisaId, empresaId },
    select: { id: true, anonima: true },
  });
  if (!pesquisa) notFound();

  const [convites, respostas] = await Promise.all([
    prisma.surveyToken.count({ where: { pesquisaId, ...CONVITES_NA_PESQUISA } }),
    prisma.resposta.findMany({
      where: { pesquisaId },
      include: { itens: { include: { pergunta: true } } },
    }),
  ]);

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
      const dimensao = item.pergunta.dimensaoGPTW ?? "GERAL";
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
      mediaPorDimensao={mediaPorDimensao}
      mediaPorSetor={mediaPorSetor}
    />
  );
}
