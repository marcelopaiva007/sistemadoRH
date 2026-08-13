// Funções puras e tipos de produtividade da equipe de RH.
// Este arquivo NÃO importa o Prisma nem pacotes de banco (pg/adapter-pg),
// permitindo importação segura em Client Components ("use client").

export type LinhaProdutividadeDia = {
  usuarioId: string;
  usuarioNome: string;
  usuarioRole: string | null;
  /** "YYYY-MM-DD" no fuso de Brasília — nunca UTC, ou a virada do dia mente. */
  dia: string;
  totalAcoes: number;
  primeiraAcao: Date;
  ultimaAcao: Date;
  aprovados: number;
  reprovados: number;
};

export type ResumoProdutividadePessoa = {
  usuarioId: string;
  usuarioNome: string;
  usuarioRole: string | null;
  diasComAtividade: number;
  totalAcoes: number;
  aprovados: number;
  reprovados: number;
};

export type ResumoProdutividadeComRanking = ResumoProdutividadePessoa & {
  posicao: number;
};

/**
 * Aplica o ranking de produtividade (1º, 2º, 3º...) baseado no total de ações.
 * Empates no volume de ações compartilham a mesma posição.
 */
export function aplicarRanking(
  resumo: ResumoProdutividadePessoa[],
): ResumoProdutividadeComRanking[] {
  const ordenado = [...resumo].sort(
    (a, b) => b.totalAcoes - a.totalAcoes || a.usuarioNome.localeCompare(b.usuarioNome, "pt-BR"),
  );

  let rankAtual = 1;
  return ordenado.map((item, idx, arr) => {
    if (idx > 0 && item.totalAcoes < arr[idx - 1].totalAcoes) {
      rankAtual = idx + 1;
    }
    return {
      ...item,
      posicao: rankAtual,
    };
  });
}

/** Dias úteis (seg–sex) entre duas datas, incluindo as duas pontas. */
export function diasUteisNoIntervalo(de: Date, ate: Date): number {
  let contagem = 0;
  const cursor = new Date(de);
  cursor.setUTCHours(0, 0, 0, 0);
  const fim = new Date(ate);
  fim.setUTCHours(0, 0, 0, 0);
  while (cursor <= fim) {
    const diaSemana = cursor.getUTCDay();
    if (diaSemana !== 0 && diaSemana !== 6) contagem++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return contagem;
}
