// As fichas encerradas por transferência no GRUPO inteiro — a matéria-prima de
// `marcarTransferencias` (lib/transferencia.ts) para reconhecer a CHEGADA por
// transferência num CNPJ.
//
// Por que o grupo inteiro e não só o que o usuário enxerga: a regra é do
// grupo ("transferência não conta como admissão"), e quem vê só uma marca
// também não pode ver a chegada de um colega transferido de outra marca
// virar "contratação". O que sai daqui é usado só para MARCAR fichas que o
// usuário já enxerga — nenhum campo da ficha de origem (nome, CNPJ, data)
// chega à tela. É diferente de `destinoDaTransferencia`, que MOSTRA o CNPJ de
// destino e por isso procura só no que o usuário vê.
//
// Memorizado por requisição e por grupo: o Painel, o Placar e o Painel do
// setor pedem a mesma lista na mesma navegação.
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { grupoDaEmpresa } from "@/lib/grupo";
import { MOTIVO_TRANSFERENCIA, type SaidaPorTransferencia } from "@/lib/transferencia";

const SELECT_SAIDA = {
  id: true,
  empresaId: true,
  cpf: true,
  dataAdmissao: true,
  dataDesligamento: true,
  transferidoParaEmpresaId: true,
} as const;

const saidasDoGrupo = cache(async (grupoId: string): Promise<SaidaPorTransferencia[]> =>
  prisma.colaborador.findMany({
    // CNPJ desativado entra também: a ficha de origem de uma transferência
    // antiga pode estar numa empresa que já fechou.
    where: { motivoDesligamento: MOTIVO_TRANSFERENCIA, empresa: { marca: { grupoId } } },
    select: SELECT_SAIDA,
  }),
);

/**
 * Saídas por transferência do grupo dos CNPJs do recorte. Todos os CNPJs de um
 * recorte são do mesmo grupo (o escopo nunca atravessa a parede de sociedade,
 * ver `empresasVisiveis`), então o primeiro basta. Sem grupo resolvido, cai
 * para o próprio recorte — melhor reconhecer parte das transferências do que
 * nenhuma.
 */
export async function saidasPorTransferenciaDoGrupo(empresaIds: string[]): Promise<SaidaPorTransferencia[]> {
  if (empresaIds.length === 0) return [];
  const grupoId = await grupoDaEmpresa(empresaIds[0]);
  if (grupoId) return saidasDoGrupo(grupoId);
  return prisma.colaborador.findMany({
    where: { motivoDesligamento: MOTIVO_TRANSFERENCIA, empresaId: { in: empresaIds } },
    select: SELECT_SAIDA,
  });
}
