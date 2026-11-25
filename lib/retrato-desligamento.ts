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
