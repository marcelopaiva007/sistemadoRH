import { prisma } from "@/lib/prisma";
import { requireDelegacoesAccess } from "@/lib/delegacoes-auth-guard";
import { paraLinha, paraPainel, SELECT_LISTA, SELECT_PAINEL } from "@/lib/delegacoes/consultas";
import { STATUS_TERMINAIS } from "@/lib/delegacoes/estados";
import { montarPainelEntregas } from "@/lib/delegacoes/painel-entregas";
import { quemAlcancaSistema } from "@/lib/permissoes/efetivas";
import { PAPEL_PORTAL } from "@/lib/delegacoes/acesso-colaborador";
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

  const [linhas, linhasPainel, usuarios, marcas, colaboradores, favoritos] = await Promise.all([
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
    // O painel de entregas quer o HISTÓRICO inteiro — inclusive ENCERRADA,
    // que a lista acima esconde de propósito. Sem filtro de status: quem não
    // conta (RASCUNHO, CANCELADA) é descartado dentro de montarPainelEntregas.
    prisma.demanda.findMany({
      where: { solicitanteId: usuario.id },
      select: SELECT_PAINEL,
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
  const painel = montarPainelEntregas(linhasPainel.map((d) => paraPainel(d)));

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
      painel={painel}
      usuarios={[
        // Quem opera o sistema: recebe demanda e responde nas telas normais.
        ...usuarios
          .filter((u) => alcancam.has(u.id))
          .map((u) => ({
            tipo: "USUARIO" as const,
            idEhFicha: false,
            id: u.id,
            nome: u.nome,
            temTelegram: !!u.colaborador?.telegramChatId,
            favorito: favoritoIds.has(u.id),
          })),
        // Quem JÁ TEM acesso de portal (recebeu alguma demanda antes). Sem
        // esta fatia a pessoa SUMIA da lista depois da primeira demanda: ela
        // deixa de contar como "só ficha" (passa a ter usuário) e não entra em
        // `alcancam`, porque o papel de portal não alcança módulo nenhum de
        // propósito. Era impossível delegar duas vezes para a mesma pessoa.
        ...usuarios
          .filter((u) => u.role === PAPEL_PORTAL)
          .map((u) => ({
            tipo: "COLABORADOR" as const,
            // Já tem acesso: o id é de USUÁRIO.
            idEhFicha: false,
            id: u.id,
            nome: u.nome,
            temTelegram: !!u.colaborador?.telegramChatId,
            favorito: favoritoIds.has(u.id),
          })),
        // Quem só tem ficha e nunca recebeu nada: o acesso de portal é criado
        // na hora da primeira demanda — por isso o id aqui é o da FICHA.
        ...colaboradores
          .filter((c) => !c.usuario)
          .map((c) => ({
            tipo: "COLABORADOR" as const,
            // Ainda não tem acesso: o id é da FICHA, e quem o converte é a
            // action (garantirAcessoDoColaborador).
            idEhFicha: true,
            id: c.id,
            nome: c.nome,
            temTelegram: !!c.telegramChatId,
            favorito: false,
          })),
      ]
        // FAVORITOS PRIMEIRO — pedido da Direção em 29/08/2026. Quem delega
        // dezenas de coisas por dia manda para as mesmas pessoas; deixá-las no
        // meio de 235 nomes em ordem alfabética obriga a procurar toda vez.
        // Dentro de cada grupo (favorito ou não), USUÁRIO antes de
        // COLABORADOR — pedido da Direção em 29/08/2026: quem opera o sistema
        // primeiro, quem responde só pelo portal depois. Por fim, alfabética.
        .sort((a, b) => {
          if (a.favorito !== b.favorito) return a.favorito ? -1 : 1;
          if (a.tipo !== b.tipo) return a.tipo === "USUARIO" ? -1 : 1;
          return a.nome.localeCompare(b.nome, "pt-BR");
        })}
      marcas={marcas}
    />
  );
}
