// Transferência entre CNPJs do grupo (v1.184.0).
//
// A pessoa que muda de CNPJ fica com DUAS fichas: a antiga, encerrada, e a
// nova, ativa (Colaborador é @@unique([empresaId, cpf]) e 33 tabelas escopam
// por empresaId — mover a ficha de empresa não é opção). Até aqui a ficha
// antiga só podia ser encerrada como "Desligado", com um motivo de rescisão
// que não aconteceu, e a varredura de duplicatas tratava o par como cadastro
// em dobro. O motivo TRANSFERENCIA_GRUPO + `transferidoParaEmpresaId` dão
// nome ao caso: a ficha antiga aparece como "Transferido", com o CNPJ de
// destino, e a data da transferência é a própria `dataDesligamento`.
//
// O destino NÃO é escolhido numa lista: é o CNPJ onde existe a ficha ATIVA com
// o mesmo CPF. Isso amarra o registro ao fato (a ficha nova tem de existir) e
// evita um destino digitado errado. Busca só entre as empresas que o usuário
// enxerga — sem isso, marcar transferência viraria um jeito de descobrir em
// qual CNPJ de outra marca um CPF trabalha.

import type { Cliente } from "@/lib/prisma";

export const MOTIVO_TRANSFERENCIA = "TRANSFERENCIA_GRUPO";

export function ehTransferencia(motivo: string | null | undefined): boolean {
  return motivo === MOTIVO_TRANSFERENCIA;
}

export type DestinoTransferencia =
  | { ok: true; empresaId: string; empresaNome: string }
  | { ok: false; error: string };

/**
 * O CNPJ para onde a pessoa foi: a empresa da ficha ATIVA com o mesmo CPF,
 * fora da empresa de origem, dentro do que o usuário enxerga.
 */
export async function destinoDaTransferencia(
  cliente: Cliente,
  colaborador: { id: string; empresaId: string; cpf: string | null },
  empresasDoUsuario: string[],
): Promise<DestinoTransferencia> {
  if (!colaborador.cpf) {
    return {
      ok: false,
      error: "Para registrar transferência, a ficha precisa ter CPF — é por ele que o sistema acha a ficha no CNPJ novo.",
    };
  }
  const candidatas = await cliente.colaborador.findMany({
    where: {
      cpf: colaborador.cpf,
      ativo: true,
      id: { not: colaborador.id },
      empresaId: { not: colaborador.empresaId, in: empresasDoUsuario },
    },
    select: { empresaId: true, empresa: { select: { nome: true } } },
  });
  if (candidatas.length === 0) {
    return {
      ok: false,
      error:
        "Não há ficha ATIVA com este CPF em outro CNPJ. Cadastre a pessoa no CNPJ novo primeiro e depois registre a transferência aqui.",
    };
  }
  if (candidatas.length > 1) {
    return {
      ok: false,
      error: `Este CPF está ativo em ${candidatas.length} outros CNPJs (${candidatas
        .map((c) => c.empresa.nome)
        .join(", ")}). Encerre a ficha que sobra antes de registrar a transferência.`,
    };
  }
  return { ok: true, empresaId: candidatas[0].empresaId, empresaNome: candidatas[0].empresa.nome };
}
