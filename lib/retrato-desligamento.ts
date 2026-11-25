// Retrato da estrutura no momento do desligamento (model RetratoDesligamento).
//
// Chamado de DENTRO da transação de cada action que registra um desligamento
// novo — toggleColaboradorAtivo, atualizarFicha (bloco "Vínculo") — para que
// o retrato e a saída nasçam juntos ou não nasçam. Não é chamado na correção
// de data/motivo da lista de Desligamentos: corrigir um desligamento antigo
// não é o momento da saída, e o setor de hoje não é o da época.
//
// Lê a ficha como está no instante da chamada. Setor, cargo e líder não mudam
// por causa do desligamento, então a ordem em relação ao update da ficha não
// altera o resultado.

import type { Cliente } from "@/lib/prisma";

/**
 * Setores que não são setor: o balde de quem a importação não conseguiu
 * atribuir ("Não definido") e o arquivo oculto dos desligados históricos
 * ("Demitidos", 27/08/2026). Mesma lista que lib/painel-setor.ts usa nos avisos.
 */
const SETORES_SEM_SETOR = ["não definido", "nao definido", "demitidos"];

export function ehSetorSemSetor(nome: string): boolean {
  return SETORES_SEM_SETOR.includes(nome.trim().toLowerCase());
}

/**
 * O setor em que a ficha CONTA nas análises de desligamento.
 *
 * - Ativo: o setor atual.
 * - Desligado com retrato: o setor do dia da saída — é para isso que o retrato
 *   existe. Exceção: retrato em "Não definido"/"Demitidos" cede ao setor atual,
 *   senão o RH corrigir o setor da ficha depois não consertaria a conta.
 * - Desligado sem retrato (todo desligamento anterior à v1.213.0): o setor
 *   atual da ficha, como sempre foi — a tela avisa.
 */
export function setorParaContas(f: {
  ativo: boolean;
  setor: { nome: string };
  retratoDesligamento?: { setorNome: string } | null;
}): string {
  const retrato = f.retratoDesligamento;
  if (!f.ativo && retrato && !ehSetorSemSetor(retrato.setorNome)) return retrato.setorNome;
  return f.setor.nome;
}

export async function gravarRetratoDesligamento(
  cliente: Cliente,
  colaboradorId: string,
  quem: { id?: string | null; name?: string | null } | null | undefined,
): Promise<void> {
  const c = await cliente.colaborador.findUnique({
    where: { id: colaboradorId },
    select: {
      empresaId: true,
      dataAdmissao: true,
      setorId: true,
      setor: { select: { nome: true } },
      posicaoId: true,
      posicao: { select: { nome: true } },
      supervisorId: true,
      supervisor: { select: { nome: true } },
    },
  });
  if (!c) return;

  const dados = {
    empresaId: c.empresaId,
    setorId: c.setorId,
    setorNome: c.setor.nome,
    posicaoId: c.posicaoId,
    posicaoNome: c.posicao.nome,
    supervisorId: c.supervisorId,
    supervisorNome: c.supervisor?.nome ?? null,
    dataAdmissao: c.dataAdmissao,
    registradoEm: new Date(),
    registradoPorId: quem?.id ?? null,
    registradoPorNome: quem?.name ?? null,
  };

  // Desligar de novo quem foi reativado: o retrato vale para a saída mais
  // recente, que é a que a ficha (dataDesligamento) descreve.
  await cliente.retratoDesligamento.upsert({
    where: { colaboradorId },
    create: { colaboradorId, ...dados },
    update: dados,
  });
}
