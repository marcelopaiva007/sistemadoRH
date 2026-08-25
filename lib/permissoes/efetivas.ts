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

/** Os grants (curinga ou exatos) que os perfis ativos deste usuário somam. */
export async function grantsDoUsuario(userId: string): Promise<string[]> {
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
}

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
