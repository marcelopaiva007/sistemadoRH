import { prisma } from "@/lib/prisma";
import { requireDelegacoesAccess } from "@/lib/delegacoes-auth-guard";
import { APENAS_ATIVAS, paraLinha, SELECT_LISTA } from "@/lib/delegacoes/consultas";
import { DelegadasView } from "./delegadas-view";

/**
 * DELEGADAS POR MIM — o que eu cobro dos outros, e a porta de criar demanda.
 *
 * `solicitanteId = eu`, sempre. A fila que importa aqui é a das ENTREGUES:
 * demanda entregue fica parada esperando MEU aceite, e enquanto eu não olho, o
 * responsável já fez a parte dele — é o único ponto do fluxo em que a demora é
 * de quem pediu. Por isso ela vem no topo, separada.
 */
export default async function DelegadasPage() {
  const usuario = await requireDelegacoesAccess();

  const [linhas, usuarios, marcas] = await Promise.all([
    prisma.demanda.findMany({
      where: { AND: [{ solicitanteId: usuario.id }, APENAS_ATIVAS] },
      select: SELECT_LISTA,
      orderBy: { prazo: "asc" },
    }),
    // Quem pode receber demanda: usuário ativo do sistema. `telegramChatId`
    // vem junto para a tela AVISAR (não bloquear) que aquela pessoa ainda não
    // é cobrável pelo bot — decisão da Direção de 28/08/2026.
    prisma.user.findMany({
      where: { ativo: true },
      select: { id: true, nome: true, colaborador: { select: { telegramChatId: true } } },
      orderBy: { nome: "asc" },
    }),
    prisma.marca.findMany({
      where: { ativo: true },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  const demandas = linhas.map((d) => paraLinha(d));

  return (
    <DelegadasView
      demandas={demandas}
      usuarios={usuarios.map((u) => ({
        id: u.id,
        nome: u.nome,
        temTelegram: !!u.colaborador?.telegramChatId,
      }))}
      marcas={marcas}
    />
  );
}
