/**
 * "Sem setor" e "sem cargo" no sistema não são FK nula — `setorId` e
 * `posicaoId` são obrigatórios no schema. São dois baldes com nome:
 *
 *   • "Não definido": o que a importação criou para quem veio sem setor/cargo;
 *   • "Demitidos": o arquivo OCULTO dos desligados históricos (27/08/2026). Um
 *     ATIVO ali está tão sem setor quanto no "Não definido".
 *
 * Esta lista é a regra única de quem CONTA (lacunasDaBase em lib/dashboard.ts,
 * cartão "Ativo sem setor definido" em lib/pendencias.ts) e de quem FILTRA a
 * lista (?lacuna=setor|cargo em Colaboradores). Até 28/09/2026 cada lado tinha
 * a sua cópia: a contagem ganhou "Demitidos" e o filtro não — a tela inicial
 * dizia "1 sem setor definido" e o clique abria a lista vazia.
 *
 * Pura, sem banco: roda também no navegador (colaboradores-table.tsx).
 */
export const BALDES_SEM_ESTRUTURA = ["Não definido", "Demitidos"] as const;

const CHAVES: readonly string[] = BALDES_SEM_ESTRUTURA.map((n) => n.toLowerCase());

/** Setor/cargo que é balde, não estrutura real. Sem diferenciar caixa, como a contagem. */
export function ehBaldeSemEstrutura(nome: string): boolean {
  return CHAVES.includes(nome.trim().toLowerCase());
}
