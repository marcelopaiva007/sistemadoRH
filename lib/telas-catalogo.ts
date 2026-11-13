// Catálogo das telas por usuário — puro, sem banco, para a tela de cliente
// usar também. A explicação inteira está em lib/telas.ts.

export type TelaSlug = "rh" | "frota" | "contratos";

export const TELAS: { slug: TelaSlug; nome: string; descricao: string }[] = [
  { slug: "rh", nome: "Pessoas (RH)", descricao: "Colaboradores, ponto, folha, férias…" },
  { slug: "frota", nome: "Frota", descricao: "Veículos, multas, condutores, manutenções…" },
  { slug: "contratos", nome: "Contratos", descricao: "Contratos, contrapartes e aluguéis." },
];

const SLUGS = TELAS.map((t) => t.slug) as string[];

/** Limpa o que veio do formulário. Todas marcadas (ou nenhuma válida) vira `[]` = sem recorte. */
export function normalizarTelas(entrada: string[]): TelaSlug[] {
  const validas = [...new Set(entrada.filter((t) => SLUGS.includes(t)))] as TelaSlug[];
  if (validas.length === SLUGS.length) return [];
  return TELAS.map((t) => t.slug).filter((s) => validas.includes(s));
}

/** As telas efetivas de uma lista gravada: vazia = todas. */
export function telasEfetivas(gravadas: string[] | null | undefined): TelaSlug[] {
  const v = (gravadas ?? []).filter((t) => SLUGS.includes(t)) as TelaSlug[];
  return v.length === 0 ? TELAS.map((t) => t.slug) : v;
}

/**
 * Corta, da lista de sistemas que o perfil concede, os que as telas não
 * deixam ver. `processos` fica se Frota OU Contratos estiver marcada — a
 * divisão entre as duas é feita por área (`areasProcessosPermitidas`).
 */
export function recortarSistemas(sistemas: string[], telas: TelaSlug[]): string[] {
  return sistemas.filter((s) => {
    if (s === "rh") return telas.includes("rh");
    if (s === "processos") return telas.includes("frota") || telas.includes("contratos");
    return true;
  });
}

