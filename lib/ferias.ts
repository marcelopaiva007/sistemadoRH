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
// Desde 26/11/2026 o direito do período deixou de ser sempre 30: o art. 130
// (faltas injustificadas reduzem para 24/18/12 ou zeram) e o art. 133, IV
// (afastamento previdenciário de mais de 6 meses zera e reinicia a contagem)
// entram pelas ausências registradas. As regras puras moram em
// lib/ferias-clt.ts; aqui elas só são aplicadas a cada período.
import {
  diferencaEmDiasUTC,
  hojeUTC,
  inicioDoDiaUTC,
  mesmoDiaUTC,
  somarAnosUTC,
  somarDiasUTC,
} from "@/lib/datas";
import type { StatusBadgeMap } from "@/components/status-badge";
import {
  diasDeDireitoPorFaltas,
  erroDeFracionamento,
  erroDeInicioAntesDoDsr,
  faltasInjustificadasNoPeriodo,
  MAXIMO_FRACOES_CLT,
  MINIMO_DIAS_FRACAO_CLT,
  MINIMO_DIAS_FRACAO_PRINCIPAL_CLT,
  perdaPorAfastamento,
  type AusenciaParaFerias,
} from "@/lib/ferias-clt";

export type { AusenciaParaFerias } from "@/lib/ferias-clt";

export const DIAS_FERIAS_POR_PERIODO = 30;
export const MAXIMO_DIAS_ABONO = 10;
// As três abaixo moram em lib/ferias-clt.ts desde 26/11/2026 (art. 134 §1º).
export const MINIMO_DIAS_FRACAO = MINIMO_DIAS_FRACAO_CLT;
export const MINIMO_DIAS_FRACAO_PRINCIPAL = MINIMO_DIAS_FRACAO_PRINCIPAL_CLT;
export const MAXIMO_FRACOES = MAXIMO_FRACOES_CLT;

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

/** Por que o período ficou sem direito a férias — null quando tem direito. */
export type PerdaDoDireito = "FALTAS_ART_130" | "AFASTAMENTO_ART_133";

export type PeriodoAquisitivo = {
  inicio: Date;
  /**
   * Véspera do aniversário seguinte — ou, quando o período foi perdido pelo
   * art. 133, a véspera da volta ao trabalho (o novo período começa nela).
   */
  fim: Date;
  /** Último dia do período concessivo: depois disso as férias vencem em dobro. */
  limiteConcessivo: Date;
  /** Dias já gozados/vendidos em solicitações APROVADAS. */
  diasUsados: number;
  /** Dias presos em solicitações ainda PENDENTES (não contam como usados). */
  diasReservados: number;
  /**
   * Dias de férias a que o período dá direito: 30, reduzido pelas faltas
   * injustificadas (art. 130: 24/18/12/0) ou 0 pelo art. 133. No período em
   * curso é o direito ATÉ HOJE — pode cair se vierem mais faltas.
   */
  direito: number;
  /** Faltas injustificadas (ausência aprovada não abonada) dentro do período. */
  faltasInjustificadas: number;
  /** Preenchido quando o direito zerou; diz qual artigo zerou. */
  perdaDireito: PerdaDoDireito | null;
  /** direito − usados − reservados (nunca negativo). */
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
  solicitacoes: readonly SolicitacaoParaCalculo[],
  hoje: Date = hojeUTC(),
  /**
   * Ausências do colaborador (26/11/2026) — faltas injustificadas (art. 130) e
   * afastamentos previdenciários (art. 133). Sem elas o direito é 30 cheio,
   * como era antes; quem mostra saldo deve passá-las.
   */
  ausencias: readonly AusenciaParaFerias[] = [],
): ResumoFerias {
  const referencia = inicioDoDiaUTC(hoje);
  const admissao = inicioDoDiaUTC(dataAdmissao);
  const periodos: PeriodoAquisitivo[] = [];

  // Os períodos são aniversários de uma ÂNCORA: a admissão, ou a volta ao
  // trabalho depois de um período perdido pelo art. 133 (§2º: "iniciar-se-á o
  // decurso de novo período aquisitivo quando o empregado ... retornar ao
  // serviço"). Somar anos à âncora (e não encadear fim + 1) mantém a regra do
  // 29/02 de `somarAnosUTC` exatamente como antes.
  let ancora = admissao;
  let anosDesdeAncora = 0;

  // Limite de segurança: 60 anos de casa cobre qualquer vínculo real e evita
  // laço infinito se a data de admissão vier absurda (ex.: ano digitado errado).
  for (let i = 0; i < 60; i++) {
    const inicio = somarAnosUTC(ancora, anosDesdeAncora);
    if (inicio > referencia) break;

    // Art. 133, IV: mais de 180 dias de afastamento previdenciário no período
    // zera o direito e o período termina na véspera da volta ao trabalho.
    const perda = perdaPorAfastamento(ausencias, inicio, somarDiasUTC(somarAnosUTC(inicio, 1), -1));
    const fim = perda ? somarDiasUTC(perda.retorno, -1) : somarDiasUTC(somarAnosUTC(inicio, 1), -1);
    if (perda) {
      ancora = perda.retorno;
      anosDesdeAncora = 0;
    } else {
      anosDesdeAncora++;
    }
    // Art. 130: faltas injustificadas no período reduzem o direito.
    const faltasInjustificadas = faltasInjustificadasNoPeriodo(ausencias, inicio, fim);
    const direito = perda ? 0 : diasDeDireitoPorFaltas(faltasInjustificadas);
    const perdaDireito: PerdaDoDireito | null = perda
      ? "AFASTAMENTO_ART_133"
      : direito === 0
        ? "FALTAS_ART_130"
        : null;
    const limiteConcessivo = somarAnosUTC(fim, 1);

    const daPeriodo = solicitacoes.filter((s) => mesmoDiaUTC(s.periodoAquisitivoInicio, inicio));
    const diasUsados = daPeriodo
      .filter((s) => s.status === "APROVADA")
      .reduce((total, s) => total + s.dias + s.diasAbono, 0);
    const diasReservados = daPeriodo
      .filter((s) => s.status === "PENDENTE")
      .reduce((total, s) => total + s.dias + s.diasAbono, 0);
    const saldo = Math.max(0, direito - diasUsados - diasReservados);

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
      direito,
      faltasInjustificadas,
      perdaDireito,
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

/** Mensagem de "sem direito" do período, com o artigo e o número que zerou. */
export function motivoSemDireito(periodo: PeriodoAquisitivo): string | null {
  if (periodo.perdaDireito === "AFASTAMENTO_ART_133") {
    return "Sem direito a férias neste período: o colaborador ficou afastado pelo INSS (auxílio-doença ou acidente) por mais de 6 meses dentro do período aquisitivo (CLT art. 133, IV). Um novo período começou na volta ao trabalho.";
  }
  if (periodo.perdaDireito === "FALTAS_ART_130") {
    return `Sem direito a férias neste período: ${periodo.faltasInjustificadas} faltas injustificadas no período aquisitivo — acima de 32 o direito se perde (CLT art. 130).`;
  }
  return null;
}

/**
 * Valida um pedido de férias contra o direito do período (art. 130/133), o
 * saldo, o fracionamento (art. 134 §1º) e o dia de início (art. 134 §3º).
 * `fracoesExistentes` são as demais solicitações do mesmo período aquisitivo
 * já aprovadas ou pendentes.
 *
 * `retroativo` (lançamento de férias JÁ gozadas): pula a conferência do dia de
 * início — é registro de fato passado, não programação; bloquear impediria o
 * RH de lançar o histórico como aconteceu. Direito, saldo e fracionamento
 * continuam valendo.
 *
 * Prazos (aviso de 30 dias, art. 135) não entram aqui: não invalidam a
 * programação, só alertam — ver `alertaDeAvisoPrevio` em lib/ferias-clt.ts.
 */
export function validarSolicitacaoFerias(params: {
  resumo: ResumoFerias;
  periodoAquisitivoInicio: Date;
  dataInicio: Date;
  dataFim: Date;
  diasAbono: number;
  fracoesExistentes: { dias: number }[];
  retroativo?: boolean;
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
  const semDireito = motivoSemDireito(periodo);
  if (semDireito) return { ok: false, error: semDireito };

  const dias = contarDiasCorridos(dataInicio, dataFim);
  if (diasAbono < 0 || diasAbono > MAXIMO_DIAS_ABONO) {
    return { ok: false, error: `O abono pecuniário é de no máximo ${MAXIMO_DIAS_ABONO} dias (1/3 do período).` };
  }
  if (dias + diasAbono > periodo.saldo) {
    const reduzido =
      periodo.direito < DIAS_FERIAS_POR_PERIODO
        ? ` O direito deste período é de ${periodo.direito} dias por ${periodo.faltasInjustificadas} faltas injustificadas (CLT art. 130).`
        : "";
    return {
      ok: false,
      error: `Saldo insuficiente: restam ${periodo.saldo} dia(s) neste período aquisitivo e o pedido soma ${dias + diasAbono}.${reduzido}`,
    };
  }

  // Fracionamento (art. 134 §1º) — conferido a cada pedido contra o que ainda
  // sobra, não só quando o saldo zera: um 13 + 9 é recusado no 9, quando já não
  // cabe mais uma fração de 14, e não só no terceiro pedido.
  const restante = periodo.direito - periodo.diasUsados - periodo.diasReservados - dias - diasAbono;
  const fracoes = [...fracoesExistentes.map((f) => f.dias), dias];
  const erroFracao = erroDeFracionamento(fracoes, Math.max(0, restante));
  if (erroFracao) return { ok: false, error: erroFracao };

  if (!params.retroativo) {
    const erroInicio = erroDeInicioAntesDoDsr(dataInicio);
    if (erroInicio) return { ok: false, error: erroInicio };
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
  /** Dias do direito do período (30, ou menos pelo art. 130) ainda sem gozo/abono marcado DENTRO do concessivo. */
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
  /**
   * Ausências (26/11/2026): com o direito reduzido pelo art. 130, o risco é
   * sobre os dias do direito NOVO — 24 dias marcados cobrem quem tem direito a
   * 24. Período sem direito (art. 130 acima de 32 faltas, ou 133) não tem o
   * que pagar em dobro. Tela e Pendências passam as mesmas ausências.
   */
  ausencias: readonly AusenciaParaFerias[] = [],
): PeriodoEmRiscoDeDobra[] {
  const vivas = solicitacoes.filter((s) => s.status === "APROVADA" || s.status === "PENDENTE");
  const { periodos } = calcularFerias(dataAdmissao, vivas, hoje, ausencias);
  const emRisco: PeriodoEmRiscoDeDobra[] = [];

  for (const periodo of periodos) {
    if (periodo.status === "EM_CURSO") continue;
    if (periodo.diasAteLimite > janelaDias) continue;
    const cobertos = vivas
      .filter((s) => mesmoDiaUTC(s.periodoAquisitivoInicio, periodo.inicio))
      .reduce((total, s) => total + diasCobertosAteOLimite(s, periodo.limiteConcessivo), 0);
    const diasDescobertos = Math.max(0, periodo.direito - cobertos);
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
  ausencias: readonly AusenciaParaFerias[] = [],
): boolean {
  return periodosEmRiscoDeDobra(dataAdmissao, solicitacoes, hoje, janelaDias, ausencias).length > 0;
}
