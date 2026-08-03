// Cache do resultado geral de NR-01 (campo Pesquisa.nivelGeralCache/indiceGeralCache).
// Existe pra tirar da tela de Relatórios a conta que uma pesquisa FINISHED não
// muda mais — refazer sempre a mesma soma a cada visita é desperdício puro.
import { prisma } from "@/lib/prisma";
import { calcularNR01, type NivelRisco } from "@/lib/nr01";

export type NivelGeralNR01 = { nivel: NivelRisco; indice: number } | null;

async function calcularNivelGeral(pesquisaId: string): Promise<NivelGeralNR01> {
  const [perguntas, respostas] = await Promise.all([
    prisma.pergunta.findMany({
      where: { pesquisaId },
      select: { id: true, codigo: true, enunciado: true, dimensao: true, invertida: true },
    }),
    prisma.resposta.findMany({
      where: { pesquisaId },
      select: {
        setorNomeSnapshot: true,
        posicaoNomeSnapshot: true,
        itens: { select: { perguntaId: true, valorNumerico: true } },
      },
    }),
  ]);
  if (respostas.length === 0) return null;
  const resultado = calcularNR01(perguntas, respostas);
  if (resultado.geral.amostraInsuficiente) return null;
  return { nivel: resultado.geral.nivelGeral, indice: Math.round(resultado.geral.indiceGeral100) };
}

// Chamado no instante em que a pesquisa vira FINISHED (alterarStatusPesquisa) —
// a única transição em que faz sentido gravar o cache, porque é a última vez
// que o resultado pode mudar.
export async function gravarCacheNR01(pesquisaId: string): Promise<void> {
  const nivel = await calcularNivelGeral(pesquisaId);
  await prisma.pesquisa.update({
    where: { id: pesquisaId },
    data: {
      nivelGeralCache: nivel?.nivel ?? null,
      indiceGeralCache: nivel?.indice ?? null,
    },
  });
}

// Lê o cache de uma pesquisa FINISHED já carregada; se estiver vazio (pesquisa
// encerrada antes deste cache existir), calcula uma vez e grava pra próxima
// visita já sair rápida. Falha ao gravar não deve derrubar a tela de
// relatórios — o número já foi calculado, só não persistiu desta vez.
export async function nivelGeralComBackfill(pesquisa: {
  id: string;
  modelo: string;
  status: string;
  nivelGeralCache: string | null;
  indiceGeralCache: number | null;
}): Promise<NivelGeralNR01> {
  if (pesquisa.modelo !== "NR01") return null;

  if (pesquisa.status === "FINISHED") {
    if (pesquisa.nivelGeralCache) {
      return { nivel: pesquisa.nivelGeralCache as NivelRisco, indice: pesquisa.indiceGeralCache ?? 0 };
    }
    const nivel = await calcularNivelGeral(pesquisa.id);
    if (nivel) {
      prisma.pesquisa
        .update({
          where: { id: pesquisa.id },
          data: { nivelGeralCache: nivel.nivel, indiceGeralCache: nivel.indice },
        })
        .catch(() => {});
    }
    return nivel;
  }

  // ACTIVE/DRAFT: respostas ainda podem mudar, sempre ao vivo.
  return calcularNivelGeral(pesquisa.id);
}
