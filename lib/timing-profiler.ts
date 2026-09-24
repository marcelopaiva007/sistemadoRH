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
  const start = Date.now();
  
  return {
    label,
    start,
    marca: (tipo: "query" | "compute" | "other" = "other") => ({
      fim: () => {
        const duracao = Date.now() - start;
        events.push({ label, duracao, timestamp: Date.now(), marca: tipo });
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
  const inicio = Date.now();
  try {
    const resultado = await promise;
    const duracao = Date.now() - inicio;
    events.push({ label, duracao, timestamp: Date.now(), marca });
    return resultado;
  } catch (erro) {
    const duracao = Date.now() - inicio;
    events.push({ label: `${label} (ERRO)`, duracao, timestamp: Date.now(), marca });
    throw erro;
  }
}

export function obterEventos(): TimerEvent[] {
  return [...events];
}

export function limparEventos(): void {
  events.length = 0;
}

export function resumo(): {
  total: number;
  queries: number;
  computes: number;
  outros: number;
} {
  return {
    total: events.reduce((sum, e) => sum + e.duracao, 0),
    queries: events.filter(e => e.marca === "query").reduce((sum, e) => sum + e.duracao, 0),
    computes: events.filter(e => e.marca === "compute").reduce((sum, e) => sum + e.duracao, 0),
    outros: events.filter(e => e.marca === "other").reduce((sum, e) => sum + e.duracao, 0),
  };
}
