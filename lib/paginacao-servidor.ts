// Paginação no SERVIDOR (26/11/2026): a página vem da URL (?pagina=), o banco
// devolve só a fatia com take/skip e uma contagem total. É o par de
// lib/use-paginacao.ts, que fatia no navegador uma lista que já veio inteira —
// serve para lista pequena por natureza; esta serve para histórico que só
// cresce (logs, multas, demandas), onde mandar tudo ao navegador era o custo.
//
// Funções puras, sem Prisma e sem React, para dar para testar sem banco
// (scripts/test-paginacao.ts). Paginar NÃO mexe no recorte de empresas: quem
// chama monta o `where` com o escopo de sempre e só acrescenta take/skip.

/** Lê `?pagina=`: inteiro ≥ 1; lixo, vazio, zero ou negativo viram 1. */
export function lerPagina(param: string | string[] | undefined): number {
  const bruto = Array.isArray(param) ? param[0] : param;
  const n = Number.parseInt(bruto ?? "", 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export interface Fatia {
  /** Página efetiva, já presa entre 1 e totalPaginas. */
  pagina: number;
  totalPaginas: number;
  skip: number;
  take: number;
  /** Posição (1-based) do primeiro e do último item da página; 0 e 0 sem itens. */
  de: number;
  ate: number;
  total: number;
}

/**
 * Calcula a fatia a partir da página pedida e do total contado no banco.
 * Página além do fim cai na última (filtro que estreitou a lista não deixa a
 * tela vazia sem explicação) — por isso o total tem de vir ANTES do findMany.
 */
export function fatiar(paginaPedida: number, total: number, porPagina: number): Fatia {
  const tamanho = Math.max(1, Math.floor(porPagina));
  const totalSeguro = Math.max(0, Math.floor(total));
  const totalPaginas = Math.max(1, Math.ceil(totalSeguro / tamanho));
  const pagina = Math.min(Math.max(1, Math.floor(paginaPedida) || 1), totalPaginas);
  const skip = (pagina - 1) * tamanho;
  const ate = Math.min(skip + tamanho, totalSeguro);
  return {
    pagina,
    totalPaginas,
    skip,
    take: tamanho,
    de: totalSeguro === 0 ? 0 : skip + 1,
    ate,
    total: totalSeguro,
  };
}

/** "1–50 de 1.234" — o resumo à esquerda da paginação. */
export function resumoDaFatia(f: Pick<Fatia, "de" | "ate" | "total">): string {
  const n = (v: number) => v.toLocaleString("pt-BR");
  if (f.total === 0) return "Nenhum registro";
  return `${n(f.de)}–${n(f.ate)} de ${n(f.total)}`;
}

/**
 * Monta o `?...` de um link de página mantendo os outros filtros da URL.
 * Valor vazio/undefined sai da URL; `pagina` 1 também (é o padrão), para o
 * link "voltar à primeira" ser o mesmo endereço de quem abriu a tela limpa.
 */
export function hrefComPagina(
  params: Record<string, string | undefined | null>,
  pagina: number,
): string {
  const usp = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    if (chave === "pagina") continue;
    if (valor !== undefined && valor !== null && valor !== "") usp.set(chave, valor);
  }
  if (pagina > 1) usp.set("pagina", String(pagina));
  const qs = usp.toString();
  return qs ? `?${qs}` : "?";
}

/**
 * Números a desenhar na barra: no máximo a primeira, a última e as vizinhas
 * da atual, com "..." nos buracos — mesma regra de components/padroes/paginacao.tsx.
 */
export function numerosDaPaginacao(pagina: number, totalPaginas: number): (number | "...")[] {
  const numeros: (number | "...")[] = [];
  for (let n = 1; n <= totalPaginas; n++) {
    if (n === 1 || n === totalPaginas || Math.abs(n - pagina) <= 1) numeros.push(n);
    else if (numeros[numeros.length - 1] !== "...") numeros.push("...");
  }
  return numeros;
}

/**
 * Aviso de lista com teto (tabela pequena por natureza, que não ganhou
 * paginação): null quando coube tudo; senão "Mostrando N de M ...".
 */
export function avisoDeLimite(mostrando: number, total: number, oQue: string): string | null {
  if (total <= mostrando) return null;
  const n = (v: number) => v.toLocaleString("pt-BR");
  return `Mostrando ${n(mostrando)} de ${n(total)} ${oQue}.`;
}
