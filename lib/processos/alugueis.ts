import { somarMesesUTC } from "@/lib/datas";

// As regras do recebimento de aluguéis — a parte pura, testável.
//
// Escopo escolhido pelo dono do sistema: "recebi / não recebi por mês". O
// coração é gerar as PARCELAS de um contrato de receita — uma por mês entre o
// início e o fim (ou até um horizonte, para contrato sem fim marcado).

/** Contrato de aluguel é o que recebe dinheiro: categoria RECEITA. */
export const CATEGORIA_RECEITA = "RECEITA";

/**
 * As competências (mês a mês) que um contrato de aluguel deveria ter, do início
 * ao fim. Cada competência é o dia 1 do mês, em UTC — é chave de mês, não data
 * de pagamento.
 *
 * `dia1DoMes` do início: uma locação que começa em 10/03 gera a parcela de
 * MARÇO (competência 01/03), não uma parcela quebrada — a régua é mensal.
 *
 * Contrato sem `dataFim` (indeterminado) para no `horizonte` — não faz sentido
 * gerar parcelas até o infinito; a tela estende conforme o tempo passa.
 */
export function competenciasDoContrato(
  dataInicio: Date,
  dataFim: Date | null,
  horizonte: Date,
): Date[] {
  // Contrato COM fim gera o termo inteiro — uma locação de 5 anos precisa das
  // 60 parcelas agora, não 12. O horizonte só serve ao contrato SEM fim
  // (indeterminado), que não tem um fim natural para parar.
  const fim = dataFim ?? horizonte;
  const primeira = dia1DoMes(dataInicio);
  const ultima = dia1DoMes(fim);
  const saida: Date[] = [];
  let atual = primeira;
  // Guarda contra laço infinito: no máximo ~50 anos de meses.
  for (let i = 0; atual <= ultima && i < 600; i++) {
    saida.push(atual);
    atual = somarMesesUTC(atual, 1);
  }
  return saida;
}

/** O dia 1 do mês de uma data, em UTC. */
export function dia1DoMes(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/**
 * O vencimento de uma competência: o `diaVencimento` daquele mês. Se o mês não
 * tem o dia (dia 31 em fevereiro), cai no último dia do mês — nunca escorrega
 * para o mês seguinte, o que adiantaria a cobrança de propósito.
 */
export function vencimentoDaCompetencia(competencia: Date, diaVencimento: number): Date {
  const ano = competencia.getUTCFullYear();
  const mes = competencia.getUTCMonth();
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const dia = Math.min(Math.max(diaVencimento, 1), ultimoDia);
  return new Date(Date.UTC(ano, mes, dia));
}

/** Rótulo "mar/2026" de uma competência. */
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export function rotuloCompetencia(competencia: Date): string {
  return `${MESES_CURTOS[competencia.getUTCMonth()]}/${competencia.getUTCFullYear()}`;
}

/**
 * O resumo de uma lista de parcelas — o que a tela e o painel mostram.
 * `hoje` entra como parâmetro para a conta ser pura (e testável).
 */
export function resumoRecebimentos(
  parcelas: { vencimento: Date; recebidoEm: Date | null; valorPrevisto: number; valorRecebido: number | null }[],
  hoje: Date,
): {
  aReceber: number;
  recebido: number;
  emAtraso: number;
  qtdEmAtraso: number;
  qtdEmAberto: number;
} {
  let aReceber = 0;
  let recebido = 0;
  let emAtraso = 0;
  let qtdEmAtraso = 0;
  let qtdEmAberto = 0;
  for (const p of parcelas) {
    if (p.recebidoEm) {
      recebido += p.valorRecebido ?? p.valorPrevisto;
    } else {
      aReceber += p.valorPrevisto;
      qtdEmAberto++;
      if (p.vencimento < hoje) {
        emAtraso += p.valorPrevisto;
        qtdEmAtraso++;
      }
    }
  }
  return { aReceber, recebido, emAtraso, qtdEmAtraso, qtdEmAberto };
}
