import { notFound } from "next/navigation";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { PesquisaDetalheView } from "./pesquisa-detalhe-view";

export default async function PesquisaDetalhePage({
  params,
}: {
  params: Promise<{ empresaId: string; pesquisaId: string }>;
}) {
  const { empresaId, pesquisaId } = await params;
  await requireEmpresaAccess(empresaId);

  const pesquisa = await prisma.pesquisa.findFirst({
    where: { id: pesquisaId, empresaId },
    include: {
      perguntas: { orderBy: { ordem: "asc" }, include: { opcoes: { orderBy: { ordem: "asc" } } } },
      tokens: { include: { colaborador: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!pesquisa) notFound();

  const colaboradoresAtivos = await prisma.colaborador.count({ where: { empresaId, ativo: true } });

  const respostas = await prisma.resposta.findMany({
    where: { pesquisaId },
    include: { itens: { include: { pergunta: true } } },
  });

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
    .map(([chave, v]) => ({ dimensao: chave.replace("dimensao:", ""), media: v.soma / v.qtd, respostas: v.qtd }));

  const mediaPorSetor = [...somaPorChave.entries()]
    .filter(([chave]) => chave.startsWith("setor:"))
    .map(([chave, v]) => ({ setor: chave.replace("setor:", ""), media: v.soma / v.qtd, respostas: v.qtd }));

  return (
    <PesquisaDetalheView
      empresaId={empresaId}
      pesquisa={pesquisa}
      colaboradoresAtivos={colaboradoresAtivos}
      totalRespostas={respostas.length}
      mediaPorDimensao={mediaPorDimensao}
      mediaPorSetor={mediaPorSetor}
    />
  );
}
