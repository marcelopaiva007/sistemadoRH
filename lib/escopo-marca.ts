import { prisma } from "@/lib/prisma";

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

export async function empresasDaMesmaMarca(empresaId: string): Promise<string[]> {
  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { marcaId: true },
  });
  if (!empresa) return [empresaId];

  const irmas = await prisma.empresa.findMany({
    where: { marcaId: empresa.marcaId, ativo: true },
    select: { id: true },
  });
  const ids = irmas.map((e) => e.id);
  return ids.length > 0 ? ids : [empresaId];
}
