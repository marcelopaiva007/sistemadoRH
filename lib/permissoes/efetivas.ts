import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { algumGrantCobre, sistemasDosGrants } from "@/lib/permissoes/catalogo";
import { modulosDoPapel } from "@/components/modulos";

// O conjunto EFETIVO de permissões de um usuário, e a pergunta "ele pode?".
//
// Onda 1: nada aqui é chamado por guarda nenhuma ainda. Existe para o teste
// provar equivalência com o acesso de hoje, e para a Onda 2 plugar `requerer`
// nas telas. Onda 1 = fundação sem efeito na tela.
//
// O conjunto efetivo é a UNIÃO dos grants dos perfis ativos do usuário. Ajustes
// avulsos por usuário (conceder/tirar uma permissão pontual) são da Onda 2 —
// nesta onda o modelo é só "perfil", que é o que reproduz o estado atual.

/**
 * Os grants (curinga ou exatos) que os perfis ativos deste usuário somam.
 *
 * `cache()` do React DEDUPLICA a consulta dentro do mesmo request: o
 * enforcement chama `sistemasPermitidos` três vezes por carga de tela (layout
 * da área, layout do módulo, e a page), e sem o cache eram três
 * `userPerfil.findMany` idênticos ao banco por navegação. Com o cache, um só.
 * Importa especialmente porque o banco já estourou cota uma vez este mês —
 * enforcement não pode triplicar a consulta mais quente do sistema.
 */
export const grantsDoUsuario = cache(async (userId: string): Promise<string[]> => {
  const vinculos = await prisma.userPerfil.findMany({
    where: { userId, perfil: { ativo: true } },
    select: { perfil: { select: { grants: true } } },
  });
  const grants = new Set<string>();
  for (const v of vinculos) {
    for (const g of v.perfil.grants.split(",").map((s) => s.trim()).filter(Boolean)) {
      grants.add(g);
    }
  }
  return [...grants];
});

/** Este usuário tem a permissão `sistema:area:acao`? (sem contar escopo) */
export async function temPermissao(userId: string, permissao: string): Promise<boolean> {
  return algumGrantCobre(await grantsDoUsuario(userId), permissao);
}

/**
 * Os sistemas (slugs) que este usuário alcança — para o seletor do topo passar
 * a mostrar "o que a pessoa recebeu", não "o que o papel dela permitiria".
 * Onda 2b: é isto que substitui `modulosDoPapel` na barra e nas guardas.
 */
export async function sistemasDoUsuario(userId: string): Promise<string[]> {
  return sistemasDosGrants(await grantsDoUsuario(userId));
}

/**
 * Este usuário alcança o sistema (`rh` ou `processos`)? — a pergunta do
 * enforcement de módulo. "Alcança" = tem ao menos uma permissão daquele
 * sistema, o que os perfis-semente garantem para o acesso de hoje.
 *
 * Onda 2b liga isto às guardas de módulo. Até aqui era só descrição (a barra
 * mostrava/escondia); agora BLOQUEIA de verdade — um perfil "só RH" não entra
 * em /processos nem por URL direta.
 */
export async function usuarioAlcancaSistema(userId: string, slug: string): Promise<boolean> {
  return (await sistemasDoUsuario(userId)).includes(slug);
}

/**
 * Os sistemas que ESTE usuário pode acessar — a fonte única do enforcement de
 * módulo (barra e guardas).
 *
 * REDE DE SEGURANÇA DA TRANSIÇÃO: usuário SEM perfil nenhum cai de volta no
 * PAPEL (`modulosDoPapel`). Sem isto, ligar o enforcement trancaria fora
 * qualquer conta criada depois do seed e ainda sem perfil atribuído — e
 * "ninguém perde acesso" é a promessa da onda. Quando todo mundo tiver perfil,
 * o ramo de fallback nunca mais roda.
 */
export async function sistemasPermitidos(user: { id?: string; role: string }): Promise<string[]> {
  const porPapel = () => modulosDoPapel(user.role).map((m) => m.slug);
  if (!user.id) return porPapel();
  const grants = await grantsDoUsuario(user.id);
  if (grants.length === 0) return porPapel();
  return sistemasDosGrants(grants);
}

/**
 * A mesma pergunta de `sistemasPermitidos`, para MUITAS pessoas de uma vez.
 *
 * Existe porque a versão de uma pessoa faz uma consulta por chamada, e a tela
 * de delegar precisa saber isso de TODO mundo que pode receber demanda. Com os
 * cinco usuários de escritório de hoje o laço passava despercebido; com os
 * acessos de portal dos funcionários seriam ~350 consultas por carregamento —
 * num banco que já estourou cota este mês. Aqui são DUAS, sempre.
 *
 * Devolve um Set com os ids que alcançam `slug`. Mantém a rede de segurança da
 * transição: quem não tem perfil nenhum cai no papel, igual à versão unitária —
 * as duas precisam responder o mesmo, senão a tela mostra uma lista e a guarda
 * aplica outra.
 */
export async function quemAlcancaSistema(
  usuarios: { id: string; role: string }[],
  slug: string,
): Promise<Set<string>> {
  const alcancam = new Set<string>();
  if (usuarios.length === 0) return alcancam;

  const vinculos = await prisma.userPerfil.findMany({
    where: { userId: { in: usuarios.map((u) => u.id) }, perfil: { ativo: true } },
    select: { userId: true, perfil: { select: { grants: true } } },
  });

  const grantsPorUsuario = new Map<string, string[]>();
  for (const v of vinculos) {
    const lista = grantsPorUsuario.get(v.userId) ?? [];
    for (const g of v.perfil.grants.split(",").map((s) => s.trim()).filter(Boolean)) {
      lista.push(g);
    }
    grantsPorUsuario.set(v.userId, lista);
  }

  for (const u of usuarios) {
    const grants = grantsPorUsuario.get(u.id) ?? [];
    const slugs =
      grants.length === 0 ? modulosDoPapel(u.role).map((m) => m.slug) : sistemasDosGrants(grants);
    if (slugs.includes(slug)) alcancam.add(u.id);
  }
  return alcancam;
}
