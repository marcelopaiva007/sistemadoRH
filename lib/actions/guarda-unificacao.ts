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
// Por isso a checagem é DUPLA: alcance (o que a pessoa vê) e coesão (tudo na
// mesma marca).
//
// Precisão sobre o que existia antes: o painel "Semelhantes" NUNCA teve filtro
// de empresa — nem no cliente. O único filtro por empresa da tela vivia no
// diálogo de unificação SIMPLES (setores-table.tsx), e mesmo esse era só do
// cliente, que não é guarda. O agrupador (lib/setores-semelhantes.ts,
// lib/cargos-semelhantes.ts) passou a montar cada grupo dentro de UMA marca,
// para o botão do painel nunca oferecer uma fusão que esta guarda vai recusar.

export type AlvoDaFusao = { id: string; nome: string; empresaId: string; marcaId: string };

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

  // 2) Coesão: fusão NUNCA atravessa MARCA — e a fronteira é a MARCA, não o
  //    CNPJ. É o escopo que o resto do sistema já usa para setor e cargo:
  //    `validarSetorEPosicaoDaMarca` (rh-colaboradores.ts) aceita de propósito
  //    um setor de CNPJ IRMÃO da mesma marca, e a mensagem de lá é literalmente
  //    "Setor inválido para essa marca". Unificar "Marketing" dos 5 CNPJs da LM
  //    Telecom é operação legítima e comum; a primeira versão desta guarda
  //    travava no CNPJ e teria transformado o painel "Semelhantes" em botão
  //    morto para o caso mais frequente.
  //    Atravessar MARCA é que é o dano: joga colaboradores para o guarda-chuva
  //    de outra marca e faz toda tela escopada por marca contá-los errado.
  const forasteiros = alvos.filter((a) => a.marcaId !== destino.marcaId);
  if (forasteiros.length > 0) {
    return {
      ok: false,
      error:
        `Só dá para unificar ${rotulo}s da MESMA marca. ` +
        `${forasteiros.length} do grupo selecionado pertence(m) a outra marca — ` +
        `unifique dentro de cada marca separadamente.`,
    };
  }

  return { ok: true, destino, origens: alvos.filter((a) => a.id !== destinoId) };
}

// A marca vem junto do CNPJ: o alcance se confere por empresa (é o que
// `empresasVisiveis` devolve), mas a coesão se confere por marca.
const SELECAO = {
  id: true,
  nome: true,
  empresaId: true,
  empresa: { select: { marcaId: true } },
} as const;

const achatar = (r: { id: string; nome: string; empresaId: string; empresa: { marcaId: string } }): AlvoDaFusao => ({
  id: r.id,
  nome: r.nome,
  empresaId: r.empresaId,
  marcaId: r.empresa.marcaId,
});

/** Os setores pedidos, com CNPJ e marca de cada um. */
export async function carregarSetores(ids: string[]): Promise<AlvoDaFusao[]> {
  const rs = await prisma.setor.findMany({ where: { id: { in: ids } }, select: SELECAO });
  return rs.map(achatar);
}

/** Os cargos pedidos, com CNPJ e marca de cada um. */
export async function carregarPosicoes(ids: string[]): Promise<AlvoDaFusao[]> {
  const rs = await prisma.posicao.findMany({ where: { id: { in: ids } }, select: SELECAO });
  return rs.map(achatar);
}
