"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// O filtro de marca/CNPJ mora na URL (?empresas=id1,id2). Já morou em
// sessionStorage e não funcionava: o seletor ficava no layout, as tabelas nas
// páginas, e storage não avisa ninguém quando muda — marcar um CNPJ só trocava
// o rótulo do botão. useSearchParams é reativo e resolve isso; de brinde o
// filtro sobrevive ao F5 e o link fica compartilhável.
//
// A interface do filtro é o seletor da barra de topo
// (components/seletor-marca-empresa.tsx). Antes era uma árvore na lateral
// (lista-empresas.tsx, removida) e, antes dela, um painel de checkboxes — dois
// controles parecidos ao mesmo tempo sempre confundiram mais do que ajudaram.
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
      // replace e não push: filtrar não é navegação, não deve encher o
      // histórico a ponto de o "voltar" do navegador virar desfazer-filtro.
      router.replace(
        urlDoFiltro({
          empresaIds,
          pathname,
          busca: searchParams.toString(),
          empresaIdAtual,
        }),
        { scroll: false },
      );
    },
    [router, pathname, searchParams, empresaIdAtual],
  );

  return { selecionadas, aplicar };
}

/**
 * Para onde ir ao aplicar uma seleção de CNPJs, dentro de um módulo escopado
 * por empresa (/rh/<empresa>, /processos/<empresa> — ver components/modulos.ts).
 *
 * Função pura e exportada de propósito: esta conta erra CALADO quando erra (ver
 * scripts/test-troca-empresa-caminho.ts), e ela tem dois donos — a árvore de
 * filtro das telas (`aplicar`, acima) e o seletor da barra de topo
 * (components/seletor-marca-empresa.tsx). Enquanto foram duas cópias, uma
 * ganhou correção que a outra não teve.
 *
 * Lista VAZIA é "todas as marcas": apaga o filtro e devolve à visão consolidada
 * do grupo.
 *
 * O <empresaId> do caminho SEGUE a seleção. Ele é o CNPJ em que os formulários
 * de criação gravam ("Abrir competência" na Folha, "Novo Colaborador") e o que
 * as telas escopadas por marca usam (Pendências, Colaboradores). Deixá-lo numa
 * empresa fora da seleção zerava essas telas — interseção vazia — e fazia o
 * cadastro novo cair no CNPJ errado sem dizer nada. Quando a seleção já contém
 * o CNPJ atual, ele fica: não se pula de CNPJ à toa.
 */
export function urlDoFiltro({
  empresaIds,
  pathname,
  busca,
  empresaIdAtual,
}: {
  empresaIds: string[];
  pathname: string;
  /** `searchParams.toString()` — os outros filtros da tela são preservados. */
  busca: string;
  empresaIdAtual: string;
}): string {
  const params = new URLSearchParams(busca);
  if (empresaIds.length === 0) params.delete(PARAM);
  else params.set(PARAM, empresaIds.join(","));

  const destino =
    empresaIds.length === 0 || empresaIds.includes(empresaIdAtual)
      ? empresaIdAtual
      : empresaIds[0];

  const base = trocarEmpresaNoCaminho(pathname, empresaIdAtual, destino);
  // Vírgula literal, não %2C. `URLSearchParams.toString()` escapa a vírgula, e
  // o resto do sistema não: os links da tela inicial e dos cartões de
  // pendência montam `?empresas=${ids.join(",")}` à mão. Os dois funcionam
  // (quem lê usa `searchParams.get`, que decodifica), mas a mesma URL aparecia
  // escrita de dois jeitos conforme o caminho que a gerou — e URL de filtro
  // aqui é feita para ser copiada e colada. Vírgula é caractere permitido em
  // query string (RFC 3986, sub-delims).
  const query = params.toString().replace(/%2C/g, ",");
  return query ? `${base}?${query}` : base;
}

// Id de recurso do Prisma (cuid): 20+ caracteres, só minúsculas e dígitos.
// Sub-tela estática do módulo — `ferias/programadas`, `avaliacoes/painel`,
// `pesquisas/<id>/resultados` — nunca chega perto disso (a maior tem 15).
function pareceIdDeRecurso(segmento: string): boolean {
  return /^[a-z0-9_]{20,}$/.test(segmento);
}

// /<modulo>/<atual>/colaboradores -> /<modulo>/<novo>/colaboradores,
// preservando a tela em que a pessoa está.
//
// Só troca o segmento quando ele é mesmo o id da empresa atual: /rh/meu-setor e
// /rh/empresas também casam com /rh/<algo>, e trocar às cegas quebraria essas
// rotas.
//
// O NOME DO MÓDULO não entra na conta de propósito. Até 23/08/2026 havia um
// `partes[1] !== "rh"` aqui, e com o segundo módulo (Processos & Ativos) ele
// passaria a recusar caladamente toda troca de CNPJ feita lá dentro — a URL
// ficaria no CNPJ antigo enquanto o `?empresas=` ia para o novo, que é o par
// descasado responsável pelo defeito de escopo da v1.105.0. Conferir
// `partes[2] === atual` já basta e cobre qualquer módulo: `atual` é sempre um
// id de empresa real, e nenhuma rota fora de módulo tem um cuid no 2º segmento.
//
// O id de RECURSO no caminho é cortado ao trocar de empresa: a ficha
// /rh/<A>/colaboradores/<id> vira /rh/<B>/colaboradores, e não uma ficha
// inexistente. Toda rota de detalhe do módulo busca por { id, empresaId }
// (colaboradores/[colaboradorId], folha/[competenciaId], vagas/[vagaId],
// avaliacoes/[cicloId], pesquisas/[pesquisaId]) e cai em notFound() quando o
// recurso é da empresa anterior — como a navegação é `replace`, o 404 ainda
// comia o Voltar do navegador. Sub-tela estática não tem cara de id e fica.
//
// Exportada: o seletor da barra de topo (components/seletor-marca-empresa.tsx)
// reusa esta mesma troca de segmento em vez de duplicá-la.
export function trocarEmpresaNoCaminho(pathname: string, atual: string, novo: string): string {
  const partes = pathname.split("/");
  if (partes[2] !== atual) return pathname;
  // Empresa não mudou (ex.: só limpar o filtro): o recurso aberto continua
  // válido, então nada de cortar o caminho e jogar a pessoa fora da ficha.
  if (atual === novo) return pathname;
  partes[2] = novo;
  const corte = partes.findIndex((p, i) => i > 2 && pareceIdDeRecurso(p));
  return (corte === -1 ? partes : partes.slice(0, corte)).join("/");
}
