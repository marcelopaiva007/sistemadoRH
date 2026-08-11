"use client";

import { useState } from "react";

/**
 * Padrão do sistema para lista longa client-side (Colaboradores, Férias,
 * Candidatos, Meu time...): 20 itens por página, sem servidor envolvido —
 * a lista inteira já veio da consulta, só a exibição é fatiada.
 */
export const ITENS_POR_PAGINA_PADRAO = 20;

/**
 * Pagina uma lista já filtrada/ordenada no cliente.
 *
 * Clampa em vez de useEffect: a lista de entrada pode encolher entre renders
 * (troca de filtro, de empresa na lateral) e a página não pode ficar presa
 * além do fim — nasceu em app/(app)/rh/[empresaId]/ferias/ferias-view.tsx e
 * virou hook quando a mesma necessidade apareceu em outras 7 telas.
 *
 * Chame `resetar()` sempre que um filtro/busca/ordenação mudar a lista de
 * entrada — senão dá pra sobrar numa página vazia depois de estreitar.
 */
export function usePaginacao<T>(itens: readonly T[], porPagina = ITENS_POR_PAGINA_PADRAO) {
  const [pagina, setPagina] = useState(1);

  const totalPaginas = Math.max(1, Math.ceil(itens.length / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * porPagina;
  const itensDaPagina = itens.slice(inicio, inicio + porPagina);

  return {
    itensDaPagina,
    paginaAtual,
    totalPaginas,
    porPagina,
    total: itens.length,
    irPara: setPagina,
    resetar: () => setPagina(1),
  };
}
