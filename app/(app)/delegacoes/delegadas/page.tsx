import { prisma } from "@/lib/prisma";
import { requireDelegacoesAccess } from "@/lib/delegacoes-auth-guard";
import { paraLinha, SELECT_LISTA } from "@/lib/delegacoes/consultas";
import { STATUS_TERMINAIS } from "@/lib/delegacoes/estados";
import { quemAlcancaSistema } from "@/lib/permissoes/efetivas";
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

  const [linhas, usuarios, marcas, colaboradores, favoritos] = await Promise.all([
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
    // Funcionários da folha: qualquer um pode receber demanda (decisão da
    // Direção em 29/08/2026). Quem já é usuário do sistema é filtrado abaixo
    // para não aparecer duas vezes na mesma lista.
    prisma.colaborador.findMany({
      where: { ativo: true },
      select: { id: true, nome: true, telegramChatId: true, usuario: { select: { id: true } } },
      orderBy: { nome: "asc" },
    }),
    // A lista de favoritos é de cada um — a de quem está logado.
    prisma.delegacaoFavorito.findMany({
      where: { userId: usuario.id },
      select: { favoritoId: true },
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
  // Uma consulta para todos, não uma por pessoa: ver `quemAlcancaSistema`.
  const alcancam = await quemAlcancaSistema(usuarios, "delegacoes");
  const favoritoIds = new Set(favoritos.map((f) => f.favoritoId));

  return (
    <DelegadasView
      demandas={demandas}
      usuarios={[
        // Quem opera o sistema: recebe demanda e responde nas telas normais.
        ...usuarios
          .filter((u) => alcancam.has(u.id))
          .map((u) => ({
            tipo: "USUARIO" as const,
            id: u.id,
            nome: u.nome,
            temTelegram: !!u.colaborador?.telegramChatId,
            favorito: favoritoIds.has(u.id),
          })),
        // Quem só tem ficha: responde pelo PORTAL. O acesso é criado na hora
        // da primeira demanda — por isso o id aqui é o da FICHA, não de um
        // usuário que ainda não existe.
        ...colaboradores
          .filter((c) => !c.usuario)
          .map((c) => ({
            tipo: "COLABORADOR" as const,
            id: c.id,
            nome: c.nome,
            temTelegram: !!c.telegramChatId,
            favorito: false,
          })),
      ].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))}
      marcas={marcas}
    />
  );
}
