import { prisma } from "@/lib/prisma";
import { requireDelegacoesAccess } from "@/lib/delegacoes-auth-guard";
import { paraLinha, SELECT_LISTA } from "@/lib/delegacoes/consultas";
import { STATUS_TERMINAIS } from "@/lib/delegacoes/estados";
import { sistemasPermitidos } from "@/lib/permissoes/efetivas";
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
      // Aqui NÃO se usa APENAS_ATIVAS: o RASCUNHO é meu e precisa aparecer,
      // senão salvar rascunho grava algo que nenhuma tela lista depois — e o
      // único botão de "Enviar ao responsável" mora no detalhe, inalcançável
      // sem link. Encerradas e canceladas continuam fora.
      where: {
        AND: [{ solicitanteId: usuario.id }, { status: { notIn: [...STATUS_TERMINAIS] } }],
      },
      select: SELECT_LISTA,
      orderBy: { prazo: "asc" },
    }),
    // Quem pode receber demanda. `telegramChatId` vem junto para a tela AVISAR
    // (não bloquear) que a pessoa ainda não é cobrável pelo bot — decisão da
    // Direção de 28/08/2026.
    prisma.user.findMany({
      where: { ativo: true },
      select: {
        id: true,
        nome: true,
        role: true,
        colaborador: { select: { telegramChatId: true } },
      },
      orderBy: { nome: "asc" },
    }),
    prisma.marca.findMany({
      where: { ativo: true },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  const demandas = linhas.map((d) => paraLinha(d));

  // SÓ quem consegue entrar no módulo pode ser responsável. Delegar a quem a
  // guarda redireciona grava uma demanda que a pessoa nunca vê, nunca aceita e
  // nunca entrega — ela fica presa em "aguardando aceite" para sempre, e o
  // relógio do aceite corre contra alguém que não foi avisado de nada. É o
  // mesmo cuidado que a Central de Pendências documenta ao montar a lista de
  // responsáveis dela. A pergunta é feita a `sistemasPermitidos`, a mesma
  // fonte da guarda — não a uma lista de papéis copiada, que divergiria.
  const alcancam = await Promise.all(
    usuarios.map(async (u) => (await sistemasPermitidos(u)).includes("delegacoes")),
  );

  return (
    <DelegadasView
      demandas={demandas}
      usuarios={usuarios
        .filter((_, i) => alcancam[i])
        .map((u) => ({
          id: u.id,
          nome: u.nome,
          temTelegram: !!u.colaborador?.telegramChatId,
        }))}
      marcas={marcas}
    />
  );
}
