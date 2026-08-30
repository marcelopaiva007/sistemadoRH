import { duracaoEmTexto, fracaoEmTexto, type Painel } from "@/lib/delegacoes/painel-entregas";

// O RELATÓRIO DA DIREÇÃO (pedido do CEO em 29/08/2026, ao ver que o volume de
// demandas vai crescer): a versão com HISTÓRICO e EXPORTÁVEL do que "Como
// andam as entregas" já mostra ao vivo em Delegadas por mim — mesma conta
// (lib/delegacoes/painel-entregas.ts::montarPainelEntregas), mas para o GRUPO
// INTEIRO (não só o que o usuário logado delegou) e com um período fixo em
// vez de "sempre tudo".
//
// Módulo PURO: só decide a janela válida e serializa `Painel` para CSV. Quem
// consulta o banco e monta o `Painel` é a tela (relatorio/page.tsx) e a rota
// de exportação (api/delegacoes/relatorio/csv/route.ts) — os dois chamam a
// MESMA query e o mesmo `montarPainelEntregas`, então tela e CSV nunca
// divergem.

/** Períodos oferecidos — mesmo padrão de app/(app)/rh/[empresaId]/auditoria. */
export const JANELAS_VALIDAS = [7, 30, 90] as const;
export type JanelaDias = (typeof JANELAS_VALIDAS)[number];

export function janelaValida(valor: unknown): JanelaDias {
  const n = Number.parseInt(String(valor ?? ""), 10);
  return (JANELAS_VALIDAS as readonly number[]).includes(n) ? (n as JanelaDias) : 30;
}

/**
 * `Painel` para CSV (Excel abre com `lib/csv.ts::gerarCsv`, que já cuida de
 * BOM/separador/fórmula). Uma linha por pessoa, mais a linha de totais no
 * final — mesmas colunas que a tabela mostra na tela.
 */
export function linhasParaCsv(painel: Painel): { colunas: string[]; linhas: string[][] } {
  const colunas = [
    "Pessoa",
    "Com ela agora",
    "Atrasadas",
    "Entregou no prazo",
    "Devoluções",
    "Repactuou",
    "Tempo até entregar",
    "Horas estimadas (média)",
    "Dentro da estimativa",
  ];

  const linhaCsv = (l: Painel["totais"]): string[] => [
    l.nome,
    String(l.abertas),
    String(l.atrasadas),
    fracaoEmTexto(l.noPrazo, l.entregues),
    String(l.devolucoes),
    String(l.repactuadas),
    duracaoEmTexto(l.horasMediaEntrega),
    duracaoEmTexto(l.horasEstimadasMedia),
    fracaoEmTexto(l.dentroEstimativa, l.comEstimativa),
  ];

  const linhas = painel.linhas.map(linhaCsv);
  if (painel.linhas.length > 1) linhas.push(linhaCsv(painel.totais));

  return { colunas, linhas };
}
