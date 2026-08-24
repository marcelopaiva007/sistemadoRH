import { prisma } from "@/lib/prisma";

// A guarda das FUSÕES de setor e de cargo.
//
// Existe porque as quatro funções de unificar (rh-setores.ts e rh-posicoes.ts)
// validavam só o `empresaId` da ROTA e nunca os ALVOS. Dois danos por esse
// buraco, e o primeiro acontecia com UM CLIQUE, sem má intenção:
//
//  1. Os painéis "Setores/Cargos Semelhantes" agrupam por NOME, e a tela é
//     consolidada: "Área Técnica" existe em 7 CNPJs de 3 marcas diferentes.
//     Unificar migrava os colaboradores de todos eles para um setor de UM CNPJ
//     e apagava os outros seis. A invariante `colaborador.empresaId ===
//     setor.empresaId` — que sustenta toda tela escopada por marca — ia junto.
//  2. Como "use server" é endpoint público, um POST à mão unificava quaisquer
//     dois registros do banco, inclusive de CNPJ que a pessoa não enxerga.
//
// Por isso a checagem é DUPLA: alcance (o que a pessoa vê) e coesão (tudo no
// mesmo CNPJ). O filtro que existia em setores-table.tsx era só do cliente, e
// cliente não é guarda.

export type AlvoDaFusao = { id: string; nome: string; empresaId: string };

type Resultado =
  | { ok: true; destino: AlvoDaFusao; origens: AlvoDaFusao[] }
  | { ok: false; error: string };

/**
 * Valida os alvos de uma fusão e devolve-os já carregados.
 *
 * `carregar` é injetado porque setor e cargo (Posicao) são tabelas diferentes
 * com a mesma regra — passar a query mantém a regra em um lugar só sem
 * inventar abstração sobre o Prisma.
 */
export async function validarFusao(
  /** Os CNPJs que a pessoa alcança — resolvidos pela action, com
   *  `empresasVisiveis`. Injetado em vez de buscado aqui para esta regra ficar
   *  pura e testável sem banco (scripts/test-guarda-unificacao.ts). */
  visiveis: string[],
  origemIds: string[],
  destinoId: string,
  carregar: (ids: string[]) => Promise<AlvoDaFusao[]>,
  rotulo: "setor" | "cargo",
): Promise<Resultado> {
  const ids = [...new Set([...origemIds, destinoId])];
  const alvos = await carregar(ids);

  const destino = alvos.find((a) => a.id === destinoId);
  if (!destino) return { ok: false, error: `O ${rotulo} de destino não foi encontrado.` };

  const faltando = ids.filter((id) => !alvos.some((a) => a.id === id));
  if (faltando.length > 0) {
    return { ok: false, error: `Há ${rotulo}(s) que não existem mais — recarregue a tela.` };
  }

  // 1) Alcance: nada fora do que a pessoa enxerga.
  if (alvos.some((a) => !visiveis.includes(a.empresaId))) {
    return { ok: false, error: `Há ${rotulo}(s) fora do seu acesso.` };
  }

  // 2) Coesão: fusão NUNCA atravessa CNPJ. Não é excesso de zelo — é o que
  //    impede um colaborador de acabar num setor de outra empresa, o que faria
  //    toda tela escopada por marca contá-lo sob a marca errada.
  const forasteiros = alvos.filter((a) => a.empresaId !== destino.empresaId);
  if (forasteiros.length > 0) {
    return {
      ok: false,
      error:
        `Só dá para unificar ${rotulo}s do MESMO CNPJ. ` +
        `${forasteiros.length} do grupo selecionado pertence(m) a outra empresa — ` +
        `unifique dentro de cada CNPJ separadamente.`,
    };
  }

  return { ok: true, destino, origens: alvos.filter((a) => a.id !== destinoId) };
}

/** Os setores pedidos, com o CNPJ de cada um. */
export function carregarSetores(ids: string[]): Promise<AlvoDaFusao[]> {
  return prisma.setor.findMany({
    where: { id: { in: ids } },
    select: { id: true, nome: true, empresaId: true },
  });
}

/** Os cargos pedidos, com o CNPJ de cada um. */
export function carregarPosicoes(ids: string[]): Promise<AlvoDaFusao[]> {
  return prisma.posicao.findMany({
    where: { id: { in: ids } },
    select: { id: true, nome: true, empresaId: true },
  });
}
