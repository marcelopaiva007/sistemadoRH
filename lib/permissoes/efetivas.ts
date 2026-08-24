import { prisma } from "@/lib/prisma";
import { algumGrantCobre, sistemasDosGrants } from "@/lib/permissoes/catalogo";

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
 * Na Onda 2 é isto que substitui `modulosDoPapel`.
 */
export async function sistemasDoUsuario(userId: string): Promise<string[]> {
  return sistemasDosGrants(await grantsDoUsuario(userId));
}
