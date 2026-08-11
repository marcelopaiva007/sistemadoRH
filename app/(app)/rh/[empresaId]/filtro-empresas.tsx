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
export function useControleFiltro(empresaIdAtual: string) {
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

      // Filtrar por UM CNPJ também entra nele. O caminho carrega a "empresa
      // atual", que é quem recebe cadastro novo: filtrar por Centrysol com o
      // caminho em RSM fazia "Novo Colaborador" criar em RSM, calado. Com
      // vários CNPJs não há para onde entrar, e o caminho fica onde está.
      const base =
        empresaIds.length === 1
          ? trocarEmpresaNoCaminho(pathname, empresaIdAtual, empresaIds[0])
          : pathname;

      // replace e não push: filtrar não é navegação, não deve encher o
      // histórico a ponto de o "voltar" do navegador virar desfazer-filtro.
      router.replace(query ? `${base}?${query}` : base, { scroll: false });
    },
    [router, pathname, searchParams, empresaIdAtual],
  );

  return { selecionadas, aplicar };
}

// /rh/<atual>/colaboradores -> /rh/<novo>/colaboradores, preservando a tela em
// que a pessoa está.
//
// Só troca o segmento quando ele é mesmo o id da empresa atual: /rh/meu-setor e
// /rh/empresas também casam com /rh/<algo>, e trocar às cegas quebraria essas
// rotas.
function trocarEmpresaNoCaminho(pathname: string, atual: string, novo: string): string {
  const partes = pathname.split("/");
  if (partes[1] !== "rh" || partes[2] !== atual) return pathname;
  partes[2] = novo;
  return partes.join("/");
}
