import { prisma } from "@/lib/prisma";
import { PAPEL_PORTAL } from "@/lib/delegacoes/acesso-colaborador";

// A LISTA DE QUEM PODE RECEBER DEMANDA — extraída de delegadas/page.tsx em
// 31/08/2026, quando a tela de Reuniões passou a precisar da mesma lista.
// Uma fonte só: se a regra de quem entra mudar de novo (como mudou em
// 31/08/2026, quando os usuários do sistema saíram), muda num lugar.
//
// SÓ COLABORADORES — decisão da Direção em 31/08/2026: os usuários do sistema
// (contas de login) saíram da chamada da demanda, porque a cobrança pelo bot
// depende do Telegram e ele é vinculado à FICHA de colaborador. Um usuário
// puro (sem ficha) não é cobrável por lá; para voltar a receber demanda, o
// caminho é ter ficha de colaborador.

export type PessoaParaDelegar = {
  tipo: "COLABORADOR";
  /**
   * `true` quando `id` é de uma FICHA (pessoa que ainda não recebeu demanda
   * nenhuma). Depois da primeira, ela passa a ter acesso de portal e o id
   * vira de USUÁRIO — continuando "Colaborador" aos olhos de quem delega.
   */
  idEhFicha: boolean;
  id: string;
  nome: string;
  temTelegram: boolean;
  favorito: boolean;
  cargo: string | null;
  marcaNome: string | null;
};

/** A lista pronta: favoritos de `userId` primeiro, depois alfabética. */
export async function listarPessoasParaDelegar(userId: string): Promise<PessoaParaDelegar[]> {
  const [usuarios, colaboradores, favoritos] = await Promise.all([
    // Quem JÁ TEM acesso de portal (recebeu alguma demanda antes). Sem esta
    // fatia a pessoa SUMIA da lista depois da primeira demanda: ela deixa de
    // contar como "só ficha" (passa a ter usuário), e o papel de portal não
    // alcança módulo nenhum de propósito. Era impossível delegar duas vezes
    // para a mesma pessoa.
    prisma.user.findMany({
      where: { ativo: true, role: PAPEL_PORTAL },
      select: {
        id: true,
        nome: true,
        colaborador: {
          select: {
            telegramChatId: true,
            posicao: { select: { nome: true } },
            empresa: { select: { marca: { select: { nome: true } } } },
          },
        },
      },
      orderBy: { nome: "asc" },
    }),
    // Funcionários da folha: qualquer um pode receber demanda (decisão da
    // Direção em 29/08/2026). Quem já é usuário é filtrado abaixo para não
    // aparecer duas vezes.
    prisma.colaborador.findMany({
      where: { ativo: true },
      select: {
        id: true,
        nome: true,
        telegramChatId: true,
        usuario: { select: { id: true } },
        posicao: { select: { nome: true } },
        empresa: { select: { marca: { select: { nome: true } } } },
      },
      orderBy: { nome: "asc" },
    }),
    // A lista de favoritos é de cada um — a de quem está logado.
    prisma.delegacaoFavorito.findMany({
      where: { userId },
      select: { favoritoId: true },
    }),
  ]);

  const favoritoIds = new Set(favoritos.map((f) => f.favoritoId));

  return [
    ...usuarios.map((u) => ({
      tipo: "COLABORADOR" as const,
      // Já tem acesso: o id é de USUÁRIO.
      idEhFicha: false,
      id: u.id,
      nome: u.nome,
      temTelegram: !!u.colaborador?.telegramChatId,
      favorito: favoritoIds.has(u.id),
      cargo: u.colaborador?.posicao?.nome ?? null,
      marcaNome: u.colaborador?.empresa.marca.nome ?? null,
    })),
    // Quem só tem ficha e nunca recebeu nada: o acesso de portal é criado na
    // hora da primeira demanda — por isso o id aqui é o da FICHA.
    ...colaboradores
      .filter((c) => !c.usuario)
      .map((c) => ({
        tipo: "COLABORADOR" as const,
        idEhFicha: true,
        id: c.id,
        nome: c.nome,
        temTelegram: !!c.telegramChatId,
        favorito: false,
        cargo: c.posicao.nome,
        marcaNome: c.empresa.marca.nome,
      })),
  ]
    // FAVORITOS PRIMEIRO — pedido da Direção em 29/08/2026: quem delega manda
    // para as mesmas pessoas o dia inteiro. Depois, alfabética.
    .sort((a, b) => {
      if (a.favorito !== b.favorito) return a.favorito ? -1 : 1;
      return a.nome.localeCompare(b.nome, "pt-BR");
    });
}
