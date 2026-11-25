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
import type { StatusBadgeMap } from "@/components/status-badge";

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

/** Quanto do período aquisitivo em curso já se passou — só existe enquanto EM_CURSO. */
export type ProgressoPeriodoEmCurso = {
  /** Meses completos desde o início do período (0 a 11). */
  meses: number;
  /** Dias corridos desde o início do período até hoje. */
  diasCorridos: number;
  /** Dias corridos que faltam para completar os 12 meses. */
  diasRestantes: number;
  /** diasCorridos sobre a duração real do período (365 ou 366), 0 a 99. */
  percentual: number;
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
  /** Preenchido só quando status é EM_CURSO; caso contrário, null. */
  progresso: ProgressoPeriodoEmCurso | null;
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

    let progresso: ProgressoPeriodoEmCurso | null = null;
    if (status === "EM_CURSO") {
      const diasCorridos = diferencaEmDiasUTC(referencia, inicio);
      const duracaoPeriodo = contarDiasCorridos(inicio, fim); // 365 ou 366 (ano bissexto)
      let meses =
        (referencia.getUTCFullYear() - inicio.getUTCFullYear()) * 12 +
        (referencia.getUTCMonth() - inicio.getUTCMonth());
      if (referencia.getUTCDate() < inicio.getUTCDate()) meses--;
      progresso = {
        meses: Math.min(11, Math.max(0, meses)),
        diasCorridos,
        diasRestantes: Math.max(0, diferencaEmDiasUTC(fim, referencia) + 1),
        percentual: Math.min(99, Math.round((diasCorridos / duracaoPeriodo) * 100)),
      };
    }

    periodos.push({
      inicio,
      fim,
      limiteConcessivo,
      diasUsados,
      diasReservados,
      saldo,
      status,
      diasAteLimite,
      progresso,
    });
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

/**
 * Ao lado de STATUS_PERIODO_LABEL para os dois nunca divergirem — consumido por
 * StatusBadge (components/status-badge.tsx). O import do tipo é `import type`,
 * apagado na compilação: lib/ continua sem dependência de runtime em React.
 */
export const STATUS_PERIODO_BADGE: StatusBadgeMap<StatusPeriodo> = {
  EM_CURSO: { label: STATUS_PERIODO_LABEL.EM_CURSO, variant: "outline" },
  DISPONIVEL: { label: STATUS_PERIODO_LABEL.DISPONIVEL, variant: "default" },
  VENCENDO: { label: STATUS_PERIODO_LABEL.VENCENDO, variant: "secondary" },
  VENCIDO: { label: STATUS_PERIODO_LABEL.VENCIDO, variant: "destructive" },
  CONCLUIDO: { label: STATUS_PERIODO_LABEL.CONCLUIDO, variant: "outline" },
};

// ---------------------------------------------------------------
// Risco de pagar em dobro (CLT art. 134 e 137) — 26/11/2026
// ---------------------------------------------------------------

/**
 * A partir de quantos dias do fim do período concessivo um período ainda não
 * coberto entra em "risco de dobra". 60 e não os 90 de DIAS_ALERTA_FERIAS: o
 * "Vencendo" de 90 é aviso de planejamento; o risco é a hora de agir — o aviso
 * de férias pede 30 dias de antecedência (art. 135), e com menos de 60 sobra
 * pouca margem para programar, comunicar e pagar até 2 dias antes (art. 145).
 */
export const DIAS_ALERTA_RISCO_DOBRA = 60;

/** Solicitação com as datas de gozo — o risco depende de QUANDO ela cai, não só de existir. */
export type SolicitacaoParaRiscoDobra = SolicitacaoParaCalculo & { dataInicio: Date; dataFim: Date };

export type PeriodoEmRiscoDeDobra = {
  periodo: PeriodoAquisitivo;
  /** Dias do direito (30) ainda sem gozo/abono marcado DENTRO do concessivo. */
  diasDescobertos: number;
  /** true = o concessivo já acabou: a dobra está caracterizada, não é mais risco. */
  vencido: boolean;
};

/**
 * Quantos dias de uma solicitação caem até o fim do concessivo. Gozo depois do
 * limite é gozo em dobro (art. 137) — não cobre o período. O abono (venda) é
 * pago junto com as férias e acompanha a fração: só cobre se ela começa no prazo.
 */
function diasCobertosAteOLimite(s: SolicitacaoParaRiscoDobra, limiteConcessivo: Date): number {
  const inicio = inicioDoDiaUTC(s.dataInicio);
  const fim = inicioDoDiaUTC(s.dataFim);
  const limite = inicioDoDiaUTC(limiteConcessivo);
  if (inicio > limite) return 0;
  const gozoNoPrazo = fim <= limite ? s.dias : Math.min(s.dias, contarDiasCorridos(inicio, limite));
  return gozoNoPrazo + s.diasAbono;
}

/**
 * Os períodos aquisitivos em risco de dobra — a regra ÚNICA usada pela tela de
 * Férias (filtro "Risco de dobra") e pelo cartão "Férias vencidas" de
 * Pendências (lib/pendencias.ts). Até 26/11/2026 as duas usavam "12+ meses de
 * casa e nenhuma férias APROVADA começando no último ano", que acusava quem
 * gozou o período anterior há 13 meses e ainda tem meses de concessivo pela
 * frente — falso positivo, cobrança sem motivo.
 *
 * Regra (art. 134 e 137): período aquisitivo FECHADO cujos 30 dias não estão
 * todos marcados (APROVADA ou PENDENTE — pedido vivo é programação) dentro do
 * período concessivo, e
 *   - o concessivo já acabou (dobra caracterizada), ou
 *   - faltam `janelaDias` (padrão 60) ou menos para ele acabar.
 *
 * Reaproveita `calcularFerias` para os períodos — não existe segunda definição
 * de período aquisitivo no sistema.
 */
export function periodosEmRiscoDeDobra(
  dataAdmissao: Date,
  solicitacoes: readonly SolicitacaoParaRiscoDobra[],
  hoje: Date = hojeUTC(),
  janelaDias: number = DIAS_ALERTA_RISCO_DOBRA,
): PeriodoEmRiscoDeDobra[] {
  const vivas = solicitacoes.filter((s) => s.status === "APROVADA" || s.status === "PENDENTE");
  const { periodos } = calcularFerias(dataAdmissao, vivas, hoje);
  const emRisco: PeriodoEmRiscoDeDobra[] = [];

  for (const periodo of periodos) {
    if (periodo.status === "EM_CURSO") continue;
    if (periodo.diasAteLimite > janelaDias) continue;
    const cobertos = vivas
      .filter((s) => mesmoDiaUTC(s.periodoAquisitivoInicio, periodo.inicio))
      .reduce((total, s) => total + diasCobertosAteOLimite(s, periodo.limiteConcessivo), 0);
    const diasDescobertos = Math.max(0, DIAS_FERIAS_POR_PERIODO - cobertos);
    if (diasDescobertos === 0) continue;
    emRisco.push({ periodo, diasDescobertos, vencido: periodo.diasAteLimite < 0 });
  }
  return emRisco;
}

/** Atalho booleano de `periodosEmRiscoDeDobra` — o que tela e Pendências contam por pessoa. */
export function emRiscoDeDobra(
  dataAdmissao: Date,
  solicitacoes: readonly SolicitacaoParaRiscoDobra[],
  hoje: Date = hojeUTC(),
  janelaDias: number = DIAS_ALERTA_RISCO_DOBRA,
): boolean {
  return periodosEmRiscoDeDobra(dataAdmissao, solicitacoes, hoje, janelaDias).length > 0;
}
