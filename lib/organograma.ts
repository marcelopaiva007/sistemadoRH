import { prisma } from "@/lib/prisma";

/**
 * Sobe a cadeia de liderança a partir de `inicioId`; true se achar `alvoId`.
 *
 * Compartilhada entre a edição direta do líder na ficha do colaborador
 * (lib/actions/rh-colaboradores.ts) e o registro de movimentação
 * (lib/actions/rh-movimentacoes.ts) — trocar o líder é trocar o líder,
 * não importa qual tela fez a chamada, e as duas não podem discordar sobre
 * o que é um ciclo.
 *
 * Sem "use server" de propósito: um arquivo com essa diretiva vira uma
 * server action pública para CADA função exportada; isto aqui é um
 * utilitário interno, não uma ação chamável do cliente.
 */
export async function criariCiclo(alvoId: string, inicioId: string): Promise<boolean> {
  let atualId: string | null = inicioId;
  // Limite de segurança: nenhuma empresa real tem 50 níveis de hierarquia: é
  // uma rede contra um ciclo já existente no banco entrar em loop infinito.
  for (let i = 0; i < 50 && atualId; i++) {
    if (atualId === alvoId) return true;
    const atual: { supervisorId: string | null } | null = await prisma.colaborador.findUnique({
      where: { id: atualId },
      select: { supervisorId: true },
    });
    atualId = atual?.supervisorId ?? null;
  }
  return false;
}
