import { requireGestorSetor } from "@/lib/rh-auth-guard";
import { prisma } from "@/lib/prisma";
import { AMOSTRA_MINIMA_ANONIMATO } from "@/lib/constants-rh";
import { MeuSetorView } from "./meu-setor-view";

export default async function MeuSetorPage() {
  const user = await requireGestorSetor();

  const setor = await prisma.setor.findUnique({ where: { id: user.setorId } });
  if (!setor) {
    return <p className="text-muted-foreground">Setor não encontrado.</p>;
  }

  const pesquisas = await prisma.pesquisa.findMany({
    where: { empresaId: user.empresaId, status: { in: ["ACTIVE", "FINISHED"] } },
    orderBy: { createdAt: "desc" },
    include: {
      perguntas: true,
      respostas: { where: { setorNomeSnapshot: setor.nome }, include: { itens: { include: { pergunta: true } } } },
    },
  });

  const resultados = pesquisas.map((p) => {
    const somaPorDimensao = new Map<string, { soma: number; qtd: number }>();
    for (const resposta of p.respostas) {
      for (const item of resposta.itens) {
        if (item.valorNumerico == null) continue;
        const dimensao = item.pergunta.dimensaoGPTW ?? "GERAL";
        const atual = somaPorDimensao.get(dimensao) ?? { soma: 0, qtd: 0 };
        atual.soma += item.valorNumerico;
        atual.qtd += 1;
        somaPorDimensao.set(dimensao, atual);
      }
    }
    return {
      id: p.id,
      titulo: p.titulo,
      totalRespostas: p.respostas.length,
      mediaPorDimensao: [...somaPorDimensao.entries()].map(([dimensao, v]) => ({
        dimensao,
        media: v.soma / v.qtd,
      })),
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Meu Setor — {setor.nome}</h1>
        <p className="text-muted-foreground">
          Resultados agregados das pesquisas de clima para o seu setor. Para preservar o
          anonimato, só exibimos números quando há pelo menos {AMOSTRA_MINIMA_ANONIMATO} respostas.
        </p>
      </div>
      <MeuSetorView resultados={resultados} />
    </div>
  );
}
