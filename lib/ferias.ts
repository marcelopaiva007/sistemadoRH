// Motor de férias CLT.
//
// Os períodos aquisitivos NÃO ficam no banco: são derivados aqui a partir da
// data de admissão e das solicitações registradas. Assim não existe tabela para
// um cron manter em dia, e corrigir uma data de admissão errada recalcula tudo.
//
// Regras aplicadas (CLT art. 129–137):
//   * cada 12 meses trabalhados fecham um período aquisitivo de 30 dias;
//   * o período concessivo é o ano seguinte ao fim do aquisitivo — passou disso,
//     as férias estão VENCIDAS e o pagamento é em dobro (art. 137);
//   * o abono pecuniário (venda) é de até 1/3, ou seja 10 dias (art. 143);
//   * o gozo pode ser fracionado em até 3 períodos, nenhum menor que 5 dias e
//     um deles com no mínimo 14 dias (art. 134 §1º).
//
// Fora do escopo por ora: redução do direito por faltas injustificadas
// (art. 130) — o saldo assume os 30 dias cheios.
import {
  diferencaEmDiasUTC,
  hojeUTC,
  inicioDoDiaUTC,
  mesmoDiaUTC,
  somarAnosUTC,
  somarDiasUTC,
} from "@/lib/datas";

export const DIAS_FERIAS_POR_PERIODO = 30;
export const MAXIMO_DIAS_ABONO = 10;
export const MINIMO_DIAS_FRACAO = 5;
export const MINIMO_DIAS_FRACAO_PRINCIPAL = 14;
export const MAXIMO_FRACOES = 3;

// A partir de quantos dias do fim do período concessivo o período entra no
// painel de alertas como "vencendo".
export const DIAS_ALERTA_FERIAS = 90;

export type StatusPeriodo = "EM_CURSO" | "DISPONIVEL" | "VENCENDO" | "VENCIDO" | "CONCLUIDO";

export type SolicitacaoParaCalculo = {
  periodoAquisitivoInicio: Date;
  dias: number;
  diasAbono: number;
  status: string;
};

export type PeriodoAquisitivo = {
  inicio: Date;
  fim: Date;
  /** Último dia do período concessivo: depois disso as férias vencem em dobro. */
  limiteConcessivo: Date;
  /** Dias já gozados/vendidos em solicitações APROVADAS. */
  diasUsados: number;
  /** Dias presos em solicitações ainda PENDENTES (não contam como usados). */
  diasReservados: number;
  /** 30 − usados − reservados. */
  saldo: number;
  status: StatusPeriodo;
  /** Dias até o limite concessivo (negativo = já venceu). */
  diasAteLimite: number;
};

export type ResumoFerias = {
  periodos: PeriodoAquisitivo[];
  /** Soma dos saldos de períodos já adquiridos (exclui o EM_CURSO). */
  saldoDisponivel: number;
  /** Período mais antigo com saldo — o que deve ser gozado primeiro. */
  periodoMaisUrgente: PeriodoAquisitivo | null;
  temVencido: boolean;
  temVencendo: boolean;
};

/** Dias corridos entre duas datas, contando as duas pontas (como manda a CLT). */
export function contarDiasCorridos(inicio: Date, fim: Date): number {
  return diferencaEmDiasUTC(fim, inicio) + 1;
}

/**
 * Períodos aquisitivos de uma admissão até hoje — incluindo o que ainda está em
 * curso. Cada período vai do aniversário de admissão até a véspera do seguinte.
 */
export function calcularFerias(
  dataAdmissao: Date,
  solicitacoes: SolicitacaoParaCalculo[],
  hoje: Date = hojeUTC(),
): ResumoFerias {
  const referencia = inicioDoDiaUTC(hoje);
  const admissao = inicioDoDiaUTC(dataAdmissao);
  const periodos: PeriodoAquisitivo[] = [];

  // Limite de segurança: 60 anos de casa cobre qualquer vínculo real e evita
  // laço infinito se a data de admissão vier absurda (ex.: ano digitado errado).
  for (let i = 0; i < 60; i++) {
    const inicio = somarAnosUTC(admissao, i);
    if (inicio > referencia) break;

    const fim = somarDiasUTC(somarAnosUTC(inicio, 1), -1);
    const limiteConcessivo = somarAnosUTC(fim, 1);

    const daPeriodo = solicitacoes.filter((s) => mesmoDiaUTC(s.periodoAquisitivoInicio, inicio));
    const diasUsados = daPeriodo
      .filter((s) => s.status === "APROVADA")
      .reduce((total, s) => total + s.dias + s.diasAbono, 0);
    const diasReservados = daPeriodo
      .filter((s) => s.status === "PENDENTE")
      .reduce((total, s) => total + s.dias + s.diasAbono, 0);
    const saldo = Math.max(0, DIAS_FERIAS_POR_PERIODO - diasUsados - diasReservados);

    const adquirido = fim < referencia;
    const diasAteLimite = diferencaEmDiasUTC(limiteConcessivo, referencia);

    let status: StatusPeriodo;
    if (!adquirido) status = "EM_CURSO";
    else if (saldo === 0) status = "CONCLUIDO";
    else if (diasAteLimite < 0) status = "VENCIDO";
    else if (diasAteLimite <= DIAS_ALERTA_FERIAS) status = "VENCENDO";
    else status = "DISPONIVEL";

    periodos.push({ inicio, fim, limiteConcessivo, diasUsados, diasReservados, saldo, status, diasAteLimite });
  }

  const adquiridosComSaldo = periodos.filter((p) => p.status !== "EM_CURSO" && p.saldo > 0);

  return {
    periodos,
    saldoDisponivel: adquiridosComSaldo.reduce((total, p) => total + p.saldo, 0),
    periodoMaisUrgente: adquiridosComSaldo[0] ?? null,
    temVencido: periodos.some((p) => p.status === "VENCIDO"),
    temVencendo: periodos.some((p) => p.status === "VENCENDO"),
  };
}

export type ValidacaoFerias =
  | { ok: true; dias: number; periodo: PeriodoAquisitivo }
  | { ok: false; error: string };

/**
 * Valida um pedido de férias contra o saldo do período e as regras de
 * fracionamento. `fracoesExistentes` são as demais solicitações do mesmo
 * período aquisitivo já aprovadas ou pendentes.
 */
export function validarSolicitacaoFerias(params: {
  resumo: ResumoFerias;
  periodoAquisitivoInicio: Date;
  dataInicio: Date;
  dataFim: Date;
  diasAbono: number;
  fracoesExistentes: { dias: number }[];
}): ValidacaoFerias {
  const { resumo, periodoAquisitivoInicio, dataInicio, dataFim, diasAbono, fracoesExistentes } = params;

  if (inicioDoDiaUTC(dataFim) < inicioDoDiaUTC(dataInicio)) {
    return { ok: false, error: "A data de término não pode ser anterior à de início." };
  }

  const periodo = resumo.periodos.find((p) => mesmoDiaUTC(p.inicio, periodoAquisitivoInicio));
  if (!periodo) return { ok: false, error: "Período aquisitivo inválido para este colaborador." };
  if (periodo.status === "EM_CURSO") {
    return { ok: false, error: "Este período aquisitivo ainda não completou 12 meses." };
  }

  const dias = contarDiasCorridos(dataInicio, dataFim);
  if (diasAbono < 0 || diasAbono > MAXIMO_DIAS_ABONO) {
    return { ok: false, error: `O abono pecuniário é de no máximo ${MAXIMO_DIAS_ABONO} dias (1/3 do período).` };
  }
  if (dias + diasAbono > periodo.saldo) {
    return {
      ok: false,
      error: `Saldo insuficiente: restam ${periodo.saldo} dia(s) neste período aquisitivo e o pedido soma ${dias + diasAbono}.`,
    };
  }

  const fracoes = [...fracoesExistentes.map((f) => f.dias), dias];
  if (fracoes.length > MAXIMO_FRACOES) {
    return {
      ok: false,
      error: `As férias podem ser divididas em no máximo ${MAXIMO_FRACOES} períodos (CLT art. 134 §1º).`,
    };
  }
  if (fracoes.length > 1 && dias < MINIMO_DIAS_FRACAO) {
    return { ok: false, error: `Nenhum período fracionado pode ter menos de ${MINIMO_DIAS_FRACAO} dias corridos.` };
  }
  // A regra dos 14 dias só é verificável quando o período é todo consumido; se
  // ainda sobra saldo, uma fração maior pode vir depois.
  const consomeTudo =
    periodo.diasUsados + periodo.diasReservados + dias + diasAbono >= DIAS_FERIAS_POR_PERIODO;
  if (fracoes.length > 1 && consomeTudo && !fracoes.some((d) => d >= MINIMO_DIAS_FRACAO_PRINCIPAL)) {
    return {
      ok: false,
      error: `Ao fracionar, um dos períodos precisa ter pelo menos ${MINIMO_DIAS_FRACAO_PRINCIPAL} dias corridos (CLT art. 134 §1º).`,
    };
  }

  return { ok: true, dias, periodo };
}

/** Data em que o colaborador volta ao trabalho. */
export const retornoAoTrabalho = (dataFim: Date) => somarDiasUTC(dataFim, 1);

export const STATUS_PERIODO_LABEL: Record<StatusPeriodo, string> = {
  EM_CURSO: "Em curso",
  DISPONIVEL: "Disponível",
  VENCENDO: "Vencendo",
  VENCIDO: "Vencido",
  CONCLUIDO: "Concluído",
};
