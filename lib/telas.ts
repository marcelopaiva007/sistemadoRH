import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { AreaProcessos } from "@/lib/processos/areas";

// TELAS QUE CADA USUÁRIO VÊ (v1.207.0, pedido do CEO em 13/11/2026).
//
// O admin marca, no cadastro ou na edição do usuário, quais abas do topo a
// pessoa enxerga: só uma, duas, ou todas. É um RECORTE em cima dos perfis — a
// tela marcada aqui só aparece se o perfil também der acesso ao sistema dela;
// tela desmarcada some da barra E é barrada na rota (guardas de RH e de
// Frota/Contratos), não só escondida.
//
// Lista vazia no banco = sem recorte (todas). É o estado de toda conta criada
// antes da v1.207.0, e é como a tela grava "todas marcadas" — assim uma tela
// nova que entrar aqui no futuro aparece para quem já tinha tudo.
//
// Delegações fica fora da lista de propósito: é aberta a todo usuário
// (decisão de 09/09/2026, components/modulos.ts).

export * from "@/lib/telas-catalogo";
import { telasEfetivas, type TelaSlug } from "@/lib/telas-catalogo";

/** Deduplicado por request, como `grantsDoUsuario` — as guardas chamam várias vezes. */
export const telasDoUsuario = cache(async (userId: string): Promise<TelaSlug[]> => {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { telas: true } });
  return telasEfetivas(u?.telas);
});

/** As áreas de Frota/Contratos que esta conta vê. */
export async function areasProcessosPermitidas(userId: string | undefined): Promise<AreaProcessos[]> {
  const telas = userId ? await telasDoUsuario(userId) : telasEfetivas([]);
  return (["frota", "contratos"] as const).filter((a) => telas.includes(a));
}
