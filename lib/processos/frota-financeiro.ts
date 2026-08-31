import { diferencaEmDiasUTC, somarDiasUTC } from "@/lib/datas";

// O Financeiro da Frota em código PURO (sem banco, sem sessão) — mesma divisão
// de lib/delegacoes/estados.ts: aqui mora a decisão (vencimento, semáforo,
// validação), nas actions mora a execução. É o que scripts/
// test-frota-financeiro.ts prova sem precisar de banco.
//
// A REGRA CENTRAL (spec §3): o vencimento calculado NUNCA é persistido. O que
// se grava é só o override manual (`dataProximoVencimento`); o resto deriva de
// `dataPrimeiraParcela + qtdParcelasPagas × recorrência` a cada leitura. Data
// no passado NÃO avança sozinha — vencido fica vencido, gritando na tela, até
// alguém registrar a parcela paga. Um cron que "arrumasse" a data esconderia
// exatamente a inadimplência que o módulo existe para mostrar.
//
// Datas em UTC date-only (hojeUTC/diferencaEmDiasUTC, o padrão do repo): a
// comparação é só de DATA, então o semáforo não vira de cor à meia-noite UTC.

export const TIPOS_AQUISICAO = [
  { value: "A_VISTA", label: "À vista" },
  { value: "FINANCIADO", label: "Financiado" },
  { value: "CONSORCIO", label: "Consórcio" },
  { value: "LEASING", label: "Leasing" },
  { value: "ALUGADO", label: "Alugado" },
] as const;

export const SITUACOES_FINANCEIRO = [
  { value: "QUITADO", label: "Quitado" },
  { value: "EM_PAGAMENTO", label: "Em pagamento" },
  { value: "SUSPENSO", label: "Suspenso" },
] as const;

export const RECORRENCIAS = [
  { value: "MENSAL", label: "Mensal", meses: 1, dias: null },
  { value: "QUINZENAL", label: "Quinzenal", meses: null, dias: 15 },
  { value: "SEMANAL", label: "Semanal", meses: null, dias: 7 },
  { value: "BIMESTRAL", label: "Bimestral", meses: 2, dias: null },
  { value: "TRIMESTRAL", label: "Trimestral", meses: 3, dias: null },
  { value: "SEMESTRAL", label: "Semestral", meses: 6, dias: null },
  { value: "ANUAL", label: "Anual", meses: 12, dias: null },
  { value: "PERSONALIZADA", label: "Personalizada (dias)", meses: null, dias: null },
  { value: "SEM_RECORRENCIA", label: "Sem recorrência", meses: null, dias: null },
] as const;

/** O limite do 🟠 — constante ÚNICA (spec §4), nunca um 7 solto pela tela. */
export const DIAS_ALERTA_VENCIMENTO_FINANCEIRO = 7;

export type StatusVencimento =
  | "VENCIDO"
  | "PROXIMO"
  | "EM_DIA"
  | "QUITADO"
  | "SUSPENSO"
  | "SEM_COBRANCA"
  | "SEM_DADOS";

/** Rótulo + ícone por status: a cor NUNCA é o único sinal (acessibilidade). */
export const ROTULO_STATUS_VENCIMENTO: Record<StatusVencimento, string> = {
  VENCIDO: "🚨 Vencido",
  PROXIMO: "🟠 Próximo do vencimento",
  EM_DIA: "🟢 Em dia",
  QUITADO: "⚪ Quitado",
  SUSPENSO: "⏸️ Suspenso",
  SEM_COBRANCA: "Sem cobrança",
  SEM_DADOS: "➖ Não informado",
};

/** O retrato mínimo que as contas precisam — o shape do Prisma serve direto. */
export type RegistroFinanceiro = {
  tipoAquisicao: string;
  situacao: string;
  valorParcela: number | null;
  qtdParcelasTotal: number | null;
  qtdParcelasPagas: number;
  dataPrimeiraParcela: Date | null;
  recorrencia: string;
  recorrenciaIntervaloDias: number | null;
  /** SÓ o override manual — vazio significa "calcule". */
  dataProximoVencimento: Date | null;
};

/**
 * `base` + `vezes` recorrências, em UTC date-only.
 *
 * FIM DE MÊS (spec §3): recorrência em meses ancora no DIA DA PRIMEIRA
 * parcela, e clampa ao último dia quando o mês não tem o dia (31/01 → 28/02
 * ou 29/02) — SEM propagar o clamp: a parcela de março volta para o dia 31,
 * porque a âncora é a primeira parcela, não a parcela anterior.
 */
export function somarRecorrenciaUTC(
  base: Date,
  vezes: number,
  recorrencia: string,
  intervaloDias: number | null,
): Date | null {
  const r = RECORRENCIAS.find((x) => x.value === recorrencia);
  if (!r) return null;
  if (recorrencia === "SEM_RECORRENCIA") return vezes === 0 ? base : null;
  if (recorrencia === "PERSONALIZADA") {
    if (!intervaloDias || intervaloDias < 1) return null;
    return somarDiasUTC(base, vezes * intervaloDias);
  }
  if (r.dias != null) return somarDiasUTC(base, vezes * r.dias);

  const meses = r.meses! * vezes;
  const ano = base.getUTCFullYear();
  const mes = base.getUTCMonth() + meses;
  const dia = base.getUTCDate();
  // Dia 0 do mês seguinte = último dia do mês alvo; o min() clampa 31 → 28/29.
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes, Math.min(dia, ultimoDia)));
}

/**
 * O próximo vencimento, na ordem da spec (§3): sem cobrança → null; o manual
 * MANDA quando preenchido; senão, derivado da recorrência. Nunca avança
 * sozinho — pagas é quem move a conta.
 */
export function proximoVencimento(r: RegistroFinanceiro): Date | null {
  if (r.situacao !== "EM_PAGAMENTO" || r.tipoAquisicao === "A_VISTA") return null;
  if (r.dataProximoVencimento) return r.dataProximoVencimento;
  if (!r.dataPrimeiraParcela) return null;
  return somarRecorrenciaUTC(
    r.dataPrimeiraParcela,
    r.qtdParcelasPagas,
    r.recorrencia,
    r.recorrenciaIntervaloDias,
  );
}

export type RetratoFinanceiro = {
  status: StatusVencimento;
  proximoVencimento: Date | null;
  /** Negativo = vencido há |dias| dias. Null quando não há cobrança. */
  diasParaVencimento: number | null;
  parcelasRestantes: number | null;
  saldoDevedor: number | null;
  dataQuitacaoPrevista: Date | null;
};

/** Tudo que a tela mostra, calculado no servidor — o front não refaz conta. */
export function retratoFinanceiro(r: RegistroFinanceiro | null, hoje: Date): RetratoFinanceiro {
  if (!r) {
    return {
      status: "SEM_DADOS",
      proximoVencimento: null,
      diasParaVencimento: null,
      parcelasRestantes: null,
      saldoDevedor: null,
      dataQuitacaoPrevista: null,
    };
  }

  const restantes =
    r.qtdParcelasTotal != null ? Math.max(0, r.qtdParcelasTotal - r.qtdParcelasPagas) : null;
  const saldo = restantes != null && r.valorParcela ? restantes * r.valorParcela : null;
  const quitacaoPrevista =
    r.dataPrimeiraParcela && r.qtdParcelasTotal
      ? somarRecorrenciaUTC(
          r.dataPrimeiraParcela,
          r.qtdParcelasTotal - 1,
          r.recorrencia,
          r.recorrenciaIntervaloDias,
        )
      : null;

  const venc = proximoVencimento(r);
  const dias = venc ? diferencaEmDiasUTC(venc, hoje) : null;

  const status: StatusVencimento =
    r.tipoAquisicao === "A_VISTA"
      ? "SEM_COBRANCA"
      : r.situacao === "QUITADO"
        ? "QUITADO"
        : r.situacao === "SUSPENSO"
          ? "SUSPENSO"
          : dias == null
            ? "SEM_COBRANCA"
            : dias < 0
              ? "VENCIDO"
              : dias <= DIAS_ALERTA_VENCIMENTO_FINANCEIRO
                ? "PROXIMO"
                : "EM_DIA";

  return {
    status,
    proximoVencimento: venc,
    diasParaVencimento: dias,
    parcelasRestantes: restantes,
    saldoDevedor: saldo,
    dataQuitacaoPrevista: quitacaoPrevista,
  };
}

export type Veredito = { ok: true } | { ok: false; erro: string };

/**
 * As regras condicionais da spec (§2/§7), no SERVIDOR — a tela pode esconder
 * campo, mas quem recusa é isto, também na chamada direta da action.
 */
export function validarFinanceiro(r: RegistroFinanceiro): Veredito {
  if (!TIPOS_AQUISICAO.some((t) => t.value === r.tipoAquisicao)) {
    return { ok: false, erro: "Tipo de aquisição inválido." };
  }
  if (!SITUACOES_FINANCEIRO.some((s) => s.value === r.situacao)) {
    return { ok: false, erro: "Situação inválida." };
  }
  if (!RECORRENCIAS.some((x) => x.value === r.recorrencia)) {
    return { ok: false, erro: "Recorrência inválida." };
  }
  if (r.valorParcela != null && r.valorParcela <= 0) {
    return { ok: false, erro: "Valor da parcela deve ser maior que zero." };
  }
  if (r.valorParcela != null && !Number.isFinite(r.valorParcela)) {
    return { ok: false, erro: "Valor da parcela inválido." };
  }
  if (r.qtdParcelasPagas < 0) {
    return { ok: false, erro: "Parcelas pagas não pode ser negativo." };
  }
  if (r.qtdParcelasTotal != null && r.qtdParcelasTotal < 1) {
    return { ok: false, erro: "Total de parcelas deve ser ao menos 1." };
  }
  if (r.qtdParcelasTotal != null && r.qtdParcelasPagas > r.qtdParcelasTotal) {
    return { ok: false, erro: "Parcelas pagas não pode passar do total." };
  }
  if (r.situacao === "EM_PAGAMENTO" && r.tipoAquisicao !== "A_VISTA") {
    if (!r.valorParcela) return { ok: false, erro: "Em pagamento, o valor da parcela é obrigatório." };
    if (!r.dataPrimeiraParcela) {
      return { ok: false, erro: "Em pagamento, a data da primeira parcela é obrigatória." };
    }
  }
  if (
    r.tipoAquisicao !== "A_VISTA" &&
    r.tipoAquisicao !== "ALUGADO" &&
    r.situacao !== "QUITADO" &&
    r.qtdParcelasTotal == null
  ) {
    return { ok: false, erro: "Informe o total de parcelas do contrato." };
  }
  if (r.recorrencia === "PERSONALIZADA" && (!r.recorrenciaIntervaloDias || r.recorrenciaIntervaloDias < 1)) {
    return { ok: false, erro: "Recorrência personalizada exige o intervalo em dias." };
  }
  return { ok: true };
}

/** Valor em reais para telas e CSV — um formato só, "R$ 1.234,56". */
export function reais(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
