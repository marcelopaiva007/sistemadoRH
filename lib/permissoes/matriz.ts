import { SISTEMAS } from "@/lib/permissoes/catalogo";

// A ponte entre os GRANTS gravados (curinga ou exatos) e o ESTADO da matriz de
// caixas na tela. Pura e testável de propósito — é a parte fácil de errar do
// editor de perfis: um curinga que não expande direito concede ou esconde
// acesso sem ninguém ver.
//
// Três níveis, do mais largo ao mais fino:
//   total          → grant "*"
//   sistemaTudo[s] → grant "<s>:*" (inclui telas futuras daquele sistema)
//   exatas         → permissões exatas marcadas
// Um curinga mais largo COBRE os de baixo: com `total`, tudo aparece marcado.

export type EstadoMatriz = {
  total: boolean;
  sistemaTudo: Record<string, boolean>;
  exatas: Set<string>;
};

export function grantsParaEstado(grants: string[]): EstadoMatriz {
  const total = grants.includes("*");
  const sistemaTudo: Record<string, boolean> = {};
  for (const s of SISTEMAS) sistemaTudo[s.slug] = grants.includes(`${s.slug}:*`);
  const exatas = new Set(grants.filter((g) => g !== "*" && !g.endsWith(":*")));
  return { total, sistemaTudo, exatas };
}

export function estadoParaGrants(e: EstadoMatriz): string[] {
  if (e.total) return ["*"];
  const grants: string[] = [];
  for (const s of SISTEMAS) {
    if (e.sistemaTudo[s.slug]) grants.push(`${s.slug}:*`);
  }
  // Só as exatas de sistemas que NÃO estão em "tudo" — senão o grant do sistema
  // inteiro e a permissão exata falariam a mesma coisa duas vezes.
  for (const p of e.exatas) {
    const slug = p.split(":")[0];
    if (!e.sistemaTudo[slug]) grants.push(p);
  }
  return grants;
}
