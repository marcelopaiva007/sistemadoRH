import { prisma, type Cliente } from "@/lib/prisma";

/**
 * Os CNPJs da mesma marca do CNPJ informado.
 *
 * A tela inicial e o organograma são da MARCA, não do CNPJ do endereço: no
 * grupo, quem lidera quem e o que exige ação não respeitam fronteira de CNPJ —
 * um supervisor da RSM tem gente da BRNET embaixo, e o RH cobra a pendência de
 * todo mundo no mesmo lugar. Contar por CNPJ mostrava um pedaço e escondia o
 * resto, sem dizer que estava escondendo.
 *
 * Devolve sempre pelo menos o próprio id, para o caso de uma empresa sem marca
 * ou desativada não zerar a tela.
 */
/**
 * A marca de um CNPJ.
 *
 * Para o que já é modelado por marca — hoje `Pesquisa.marcaId` — filtrar direto
 * por `marcaId` é mais barato e mais claro do que expandir para a lista de
 * CNPJs irmãos: é uma coluna indexada em vez de um `IN` que cresce junto com o
 * grupo.
 */
export async function marcaDaEmpresa(empresaId: string): Promise<string> {
  const empresa = await prisma.empresa.findUniqueOrThrow({
    where: { id: empresaId },
    select: { marcaId: true },
  });
  return empresa.marcaId;
}

// `cliente` existe para o smoke poder rodar dentro de uma transação com
// rollback (mesmo padrão de lib/pendencias.ts) — produção nunca passa nada e
// usa o prisma global.
export async function empresasDaMesmaMarca(empresaId: string, cliente: Cliente = prisma): Promise<string[]> {
  const empresa = await cliente.empresa.findUnique({
    where: { id: empresaId },
    select: { marcaId: true },
  });
  if (!empresa) return [empresaId];

  const irmas = await cliente.empresa.findMany({
    where: { marcaId: empresa.marcaId, ativo: true },
    select: { id: true },
  });
  const ids = irmas.map((e) => e.id);
  return ids.length > 0 ? ids : [empresaId];
}

/**
 * Os CNPJs da marca de `empresaId` que o usuário enxerga — a interseção de
 * `empresasDaMesmaMarca` com `empresasVisiveis` (lib/rh-auth-guard.ts), que
 * quem chama já calculou.
 *
 * Criado em 26/11/2026 para o clima: a pesquisa é da MARCA, e o ciclo
 * anterior, o histórico e o Meu Setor buscavam só pelo CNPJ do caminho — a
 * pesquisa de 2025 criada na RSM sumia do comparativo de quem abriu a de 2026
 * pela BRNET, e o dashboard mostrava "primeiro ciclo" sem dizer nada. A
 * interseção com o visível é regra de escopo, não enfeite: a lista de pesquisas
 * só mostra as criadas em CNPJ visível, e o comparativo não pode trazer o que a
 * lista esconde.
 */
export async function cnpjsVisiveisDaMarca(
  empresaId: string,
  visiveis: readonly string[],
  cliente: Cliente = prisma,
): Promise<string[]> {
  const daMarca = await empresasDaMesmaMarca(empresaId, cliente);
  return daMarca.filter((id) => visiveis.includes(id));
}

/**
 * O nome que descreve um conjunto de CNPJs — para título de relatório e nome
 * de arquivo exportado, não para tela (a tela usa o seletor do topo, que já
 * sabe o rótulo certo sem ir ao banco de novo).
 *
 * Existe porque as rotas de exportação de Indicadores (`csv`, `relatorio-pdf`)
 * assumiam que `empresaIds` era sempre uma marca inteira — verdade enquanto a
 * rota só sabia expandir para `empresasDaMesmaMarca`. Em 23/08/2026 elas
 * passaram a seguir o filtro `?empresas=` da tela (que pode ser o grupo
 * inteiro, uma marca ou um único CNPJ), e usar sempre `marca.nome` no título
 * viraria um relatório de "LM Telecom" cujos números são, na verdade, do
 * grupo inteiro — o tipo de número plausível e errado que este sistema evita.
 */
export async function rotuloDoEscopo(empresaIds: string[]): Promise<string> {
  if (empresaIds.length === 0) return "Nenhuma empresa";
  if (empresaIds.length === 1) {
    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaIds[0] },
      select: { nome: true },
    });
    return empresa?.nome ?? "Empresa";
  }
  const empresas = await prisma.empresa.findMany({
    where: { id: { in: empresaIds } },
    select: { marcaId: true, marca: { select: { nome: true } } },
  });
  const marcasDistintas = new Set(empresas.map((e) => e.marcaId));
  if (marcasDistintas.size === 1) return empresas[0]?.marca.nome ?? "Empresa";
  return "Grupo inteiro";
}
