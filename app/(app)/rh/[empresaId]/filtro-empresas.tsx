"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// O filtro de marca/CNPJ mora na URL (?empresas=id1,id2). Já morou em
// sessionStorage e não funcionava: o seletor ficava no layout, as tabelas nas
// páginas, e storage não avisa ninguém quando muda — marcar um CNPJ só trocava
// o rótulo do botão. useSearchParams é reativo e resolve isso; de brinde o
// filtro sobrevive ao F5 e o link fica compartilhável.
//
// A interface do filtro é a árvore de marcas/CNPJs (lista-empresas.tsx). Houve
// um segundo controle, um painel de checkboxes, que fazia o mesmo papel — dois
// controles parecidos na mesma lateral confundiam mais do que ajudavam.
export const PARAM = "empresas";

type ReadonlyURLSearchParams = ReturnType<typeof useSearchParams>;

function lerFiltro(searchParams: ReadonlyURLSearchParams): string[] {
  return (searchParams.get(PARAM) ?? "").split(",").filter(Boolean);
}

/**
 * Empresas que a tela atual deve mostrar. Sem filtro na URL, devolve tudo que o
 * usuário enxerga — a visão consolidada do grupo é o padrão.
 */
export function useFiltroEmpresas(usuarioEmpresas: string[]) {
  const searchParams = useSearchParams();
  const bruto = searchParams.get(PARAM) ?? "";
  // Chaves em texto, não os arrays: quem consome põe o retorno em dependência
  // de useEffect que chama setState. Devolver array novo a cada render fecha o
  // laço render -> efeito -> setState -> render e congela a tela — foi o que
  // aconteceu na 1.12.9.
  const chaveUsuario = usuarioEmpresas.join(",");

  return useMemo(() => {
    const todas = chaveUsuario ? chaveUsuario.split(",") : [];
    const filtro = bruto.split(",").filter(Boolean);
    if (filtro.length === 0) return todas;
    // Interseção: um CNPJ digitado na URL à mão não vira acesso.
    return filtro.filter((id) => todas.includes(id));
  }, [bruto, chaveUsuario]);
}

/**
 * Estado do filtro + como trocá-lo. Para quem desenha a interface do filtro.
 */
export function useControleFiltro() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selecionadas = lerFiltro(searchParams);

  const aplicar = useCallback(
    (empresaIds: string[]) => {
      const params = new URLSearchParams(searchParams.toString());
      if (empresaIds.length === 0) params.delete(PARAM);
      else params.set(PARAM, empresaIds.join(","));
      const query = params.toString();
      // replace e não push: filtrar não é navegação, não deve encher o
      // histórico a ponto de o "voltar" do navegador virar desfazer-filtro.
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return { selecionadas, aplicar };
}
