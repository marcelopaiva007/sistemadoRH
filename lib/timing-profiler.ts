/**
 * Profiler de Performance — Mede timing de queries e funções
 * Uso em server components/actions para diagnóstico de gargalos
 */

type TimerEvent = {
  label: string;
  duracao: number; // ms
  timestamp: number;
  marca: "query" | "compute" | "other";
};

const events: TimerEvent[] = [];

export function iniciarTimer(label: string) {
  return {
    label,
    start: Date.now(),
    marca: (marca: "query" | "compute" | "other" = "other") => ({
      fim: () => {
        const duracao = Date.now() - this.start;
        events.push({ label, duracao, timestamp: Date.now(), marca });
        return duracao;
      },
    }),
  };
}

export async function medirPromise<T>(
  label: string,
  promise: Promise<T>,
  marca: "query" | "compute" | "other" = "query"
): Promise<T> {
  const start = Date.now();
  try {
    const result = await promise;
    const duracao = Date.now() - start;
    events.push({ label, duracao, timestamp: Date.now(), marca });
    return result;
  } catch (error) {
    const duracao = Date.now() - start;
    events.push({ label: `${label} (ERROR)`, duracao, timestamp: Date.now(), marca });
    throw error;
  }
}

export function obterRelatorio() {
  // Ordena por tempo (maior primeiro)
  const ordenado = [...events].sort((a, b) => b.duracao - a.duracao);

  const total = events.reduce((sum, e) => sum + e.duracao, 0);
  const queries = events.filter((e) => e.marca === "query");
  const compute = events.filter((e) => e.marca === "compute");

  return {
    total,
    quantidadeOps: events.length,
    duracao_queries: queries.reduce((sum, e) => sum + e.duracao, 0),
    duracao_compute: compute.reduce((sum, e) => sum + e.duracao, 0),
    operacoes_lentas: ordenado.slice(0, 10).map((e) => ({
      label: e.label,
      duracao: `${e.duracao}ms`,
      percentual: `${((e.duracao / total) * 100).toFixed(1)}%`,
    })),
    operacoes: ordenado.map((e) => ({
      label: e.label,
      duracao: e.duracao,
      marca: e.marca,
    })),
  };
}

export function limparEventos() {
  events.length = 0;
}

export function formatarRelatorio(relatorio: ReturnType<typeof obterRelatorio>) {
  const texto = `
╔════════════════════════════════════════════════════════════╗
║           PROFILER DE PERFORMANCE - RELATÓRIO               ║
╚════════════════════════════════════════════════════════════╝

⏱️  TEMPO TOTAL:        ${relatorio.total}ms
📊 TOTAL DE OPS:       ${relatorio.quantidadeOps}

🗂️  QUERIES:            ${relatorio.duracao_queries}ms (${((relatorio.duracao_queries / relatorio.total) * 100).toFixed(1)}%)
⚙️  COMPUTAÇÃO:        ${relatorio.duracao_compute}ms (${((relatorio.duracao_compute / relatorio.total) * 100).toFixed(1)}%)

🚨 TOP 10 OPERAÇÕES LENTAS:
${relatorio.operacoes_lentas
  .map(
    (op, i) => `  ${i + 1}. ${op.label}
     └─ ${op.duracao} (${op.percentual})`
  )
  .join("\n")}

📋 TODAS AS OPERAÇÕES:
${relatorio.operacoes.map((op) => `  ${op.label}: ${op.duracao}ms [${op.marca}]`).join("\n")}
  `;

  return texto;
}
