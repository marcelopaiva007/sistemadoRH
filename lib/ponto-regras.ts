/**
 * Motor de Regras Trabalhistas do Ponto Eletrônico (CLT & Portaria MTP 671/2021)
 *
 * Regulamenta:
 * 1. CLT Art. 58 § 1º: Tolerância de 5 min por batida, máximo 10 min/dia.
 * 2. CLT Art. 73: Hora Noturna Ficta (52m30s -> fator 1.142857) entre 22:00 e 05:00.
 * 3. CLT Art. 71: Intervalo Intrajornada mínimo (1h para jornadas > 6h).
 * 4. Apuração de Horas Extras (50% e 100%) e Banco de Horas.
 * 5. Reflexo de Horas Extras no Descanso Semanal Remunerado (DSR - Lei 605/1949 / Súmula 172 TST).
 */

import { diaBrasilia } from "@/lib/datas";

export type BatidaPonto = {
  tipo: "ENTRADA_1" | "SAIDA_1" | "ENTRADA_2" | "SAIDA_2";
  dataHora: Date;
};

/**
 * Esta marcação já foi registrada hoje?
 *
 * O modelo tem quatro marcações por dia — entrada, saída para o almoço, volta
 * e saída — e cada uma acontece UMA vez. Repetir não é jornada possível: é
 * toque duplo no celular, rede lenta que reenvia, ou chamada direta à action.
 *
 * POR QUE NO SERVIDOR. Até 14/08/2026 a única trava era o botão desabilitado
 * na tela (`bater-ponto-card.tsx`), e `registrarPontoPortal` é `"use server"` —
 * ou seja, endpoint POST público. Um POST à mão registrava dez ENTRADA_1 no
 * mesmo dia, todas com hash válido e NSR próprio, e o RH tinha que limpar a
 * sujeira pelo tratamento de ponto. Trava que só existe no navegador não é
 * trava. A implementação antiga do ponto tinha esta checagem no servidor; ela
 * se perdeu na migração para o modelo novo.
 *
 * O DIA É O DE BRASÍLIA, não o do processo. Na Vercel o servidor roda em UTC:
 * comparar pelo dia UTC deixaria a marcação das 21h30 cair no dia seguinte, e
 * quem batesse duas vezes depois das 21h passaria pela trava — exatamente no
 * horário do segundo turno.
 */
export function jaBateuHoje(
  batidasRecentes: BatidaPonto[],
  tipo: BatidaPonto["tipo"],
  agora: Date,
): boolean {
  const hoje = diaBrasilia(agora);
  return batidasRecentes.some((b) => b.tipo === tipo && diaBrasilia(b.dataHora) === hoje);
}

/**
 * Teto de jornada do estagiário — minutos por dia e por semana.
 *
 * SOBRE OS NÚMEROS. A Lei 11.788/2008, art. 10, fixa 6h/dia e 30h/semana para
 * ensino superior, médio regular e educação profissional de nível médio; e
 * 4h/20h para educação especial e anos finais do fundamental na modalidade EJA.
 * Os 5h aqui são POLÍTICA DA EMPRESA, mais restritiva que a lei — foi o valor
 * definido junto com a regra, em 13/08/2026. Se um dia virar "o que a lei
 * manda", o número muda aqui e em lugar nenhum mais.
 */
export const LIMITE_ESTAGIO_MIN_DIA = 5 * 60;
export const LIMITE_ESTAGIO_MIN_SEMANA = 30 * 60;

export type ApuracaoEstagio = {
  minutosHoje: number;
  /** Inclui hoje. */
  minutosSemana: number;
  excedeuDia: boolean;
  excedeuSemana: boolean;
};

/** O dia da semana (0=domingo) da data de Brasília, sem sofrer com fuso. */
function diaDaSemanaBr(diaISO: string): number {
  return new Date(`${diaISO}T12:00:00Z`).getUTCDay();
}

/** A segunda-feira da semana daquele dia, como "2026-08-10". */
function segundaDaSemana(diaISO: string): string {
  const dow = diaDaSemanaBr(diaISO);
  const recuo = dow === 0 ? 6 : dow - 1; // domingo fecha a semana da segunda anterior
  const d = new Date(`${diaISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - recuo);
  return d.toISOString().slice(0, 10);
}

/**
 * Minutos trabalhados num dia, somando os PARES de marcação.
 *
 * POR QUE PARES, e não "agora menos a primeira entrada": o intervalo de almoço
 * fica no meio. A regra antiga (lib/actions/portal-ponto.ts, caminho morto)
 * fazia `agora - primeiraEntrada` e contava o almoço como hora trabalhada —
 * quem entrasse às 8h e saísse às 13h com uma hora de intervalo aparecia com
 * 5h em vez de 4h, e era barrado sem ter estourado nada.
 *
 * Período aberto (entrou e ainda não saiu) conta até `agora` SÓ no dia de hoje.
 * Num dia passado, entrada sem saída é esquecimento — contar até agora daria
 * centenas de horas. Ali vale zero, e o caso é do tratamento de ponto (PTRP).
 */
function minutosDoDia(batidasDoDia: BatidaPonto[], agora: Date, ehHoje: boolean): number {
  const em = (t: BatidaPonto["tipo"]) =>
    batidasDoDia.find((b) => b.tipo === t)?.dataHora ?? null;

  let minutos = 0;
  for (const [entrada, saida] of [
    ["ENTRADA_1", "SAIDA_1"],
    ["ENTRADA_2", "SAIDA_2"],
  ] as const) {
    const ini = em(entrada);
    if (!ini) continue;
    const fim = em(saida) ?? (ehHoje ? agora : null);
    if (!fim) continue;
    const diff = fim.getTime() - ini.getTime();
    if (diff > 0) minutos += diff / 60000;
  }
  return Math.round(minutos);
}

/**
 * Quanto o estagiário já trabalhou hoje e na semana, e se passou do teto.
 *
 * A marcação que está sendo feita AGORA não precisa entrar na lista: um período
 * aberto conta até `agora`, então bater a saída neste instante dá o mesmo
 * número que já está aqui.
 *
 * A semana começa na segunda, em Brasília — não no dia do processo, que na
 * Vercel é UTC e vira antes.
 */
export function apurarLimiteEstagio(
  batidas: BatidaPonto[],
  agora: Date,
  limites: { dia: number; semana: number } = {
    dia: LIMITE_ESTAGIO_MIN_DIA,
    semana: LIMITE_ESTAGIO_MIN_SEMANA,
  },
): ApuracaoEstagio {
  const hoje = diaBrasilia(agora);
  const segunda = segundaDaSemana(hoje);

  const porDia = new Map<string, BatidaPonto[]>();
  for (const b of batidas) {
    const dia = diaBrasilia(b.dataHora);
    (porDia.get(dia) ?? porDia.set(dia, []).get(dia)!).push(b);
  }

  let minutosHoje = 0;
  let minutosSemana = 0;
  for (const [dia, doDia] of porDia) {
    const m = minutosDoDia(doDia, agora, dia === hoje);
    if (dia === hoje) minutosHoje = m;
    // `>= segunda && <= hoje` compara strings aaaa-mm-dd, que ordenam como data.
    if (dia >= segunda && dia <= hoje) minutosSemana += m;
  }

  return {
    minutosHoje,
    minutosSemana,
    excedeuDia: minutosHoje > limites.dia,
    excedeuSemana: minutosSemana > limites.semana,
  };
}

/** "4h30" — para a frase que o estagiário lê, não "270 minutos". */
export function emHorasEMinutos(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/**
 * O aviso para o estagiário, ou null quando está dentro do teto.
 *
 * AVISA E NÃO BLOQUEIA, e esta é a diferença mais importante em relação à
 * regra antiga, que recusava a marcação de saída.
 *
 * Recusar a saída não impede ninguém de trabalhar — a pessoa já trabalhou
 * quando o sistema descobre. O que a recusa produz é uma jornada com entrada e
 * SEM saída: o estagiário fica sem registro da hora em que foi embora, e a
 * empresa fica com uma inconsistência aberta no lugar de um fato datado. Quem
 * mais perde é justamente quem a regra queria proteger.
 *
 * Registrar e avisar mantém o espelho fiel — que é a função de um registro de
 * ponto — e põe o excesso à vista de quem pode agir: o estagiário na hora, o
 * RH na tela de ponto e no tratamento (PTRP).
 */
export function avisoDeLimiteEstagio(a: ApuracaoEstagio): string | null {
  if (a.excedeuDia && a.excedeuSemana) {
    return `Você já tem ${emHorasEMinutos(a.minutosHoje)} hoje e ${emHorasEMinutos(a.minutosSemana)} na semana — acima do limite de estágio (${emHorasEMinutos(LIMITE_ESTAGIO_MIN_DIA)} por dia, ${emHorasEMinutos(LIMITE_ESTAGIO_MIN_SEMANA)} por semana). Sua marcação foi registrada. Avise seu supervisor e o RH.`;
  }
  if (a.excedeuDia) {
    return `Você já tem ${emHorasEMinutos(a.minutosHoje)} hoje — acima do limite de ${emHorasEMinutos(LIMITE_ESTAGIO_MIN_DIA)} por dia do estágio. Sua marcação foi registrada. Avise seu supervisor.`;
  }
  if (a.excedeuSemana) {
    return `Você já tem ${emHorasEMinutos(a.minutosSemana)} nesta semana — acima do limite de ${emHorasEMinutos(LIMITE_ESTAGIO_MIN_SEMANA)} do estágio. Sua marcação foi registrada. Avise seu supervisor.`;
  }
  return null;
}

export type HorarioContratual = {
  entrada1: string; // "08:00"
  saida1: string;   // "12:00"
  entrada2?: string; // "13:00"
  saida2?: string;   // "17:00"
  cargaDiariaMin: number; // 480 (8 horas)
  toleranciaMin: number;  // 10 minutos diários
};

export type ResumoJornadaDia = {
  minutosTrabalhadosBruto: number;
  minutosNoturnosConvertidos: number;
  minutosTrabalhadosEfetivos: number;
  minutosAtraso: number;
  minutosHoraExtra50: number;
  minutosHoraExtra100: number;
  minutosAdicionalNoturno: number;
  minutosSuprimidosIntervalo: number;
  saldoBancoHorasMin: number; // Positivo (crédito) ou Negativo (débito)
};

/**
 * Converte string "HH:mm" para minutos a partir da meia-noite.
 */
export function horaParaMinutos(horaStr: string): number {
  const [h, m] = horaStr.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Calcula a variação e apuração de minutos conforme CLT Art. 58 § 1º.
 * Tolerância de até 5 min por batida, não excedendo 10 min no somatório do dia.
 */
export function aplicarToleranciaCLT(
  minutosDiferencaTotal: number,
  toleranciaMaxDiaria: number = 10
): number {
  if (Math.abs(minutosDiferencaTotal) <= toleranciaMaxDiaria) {
    return 0; // Dentro da tolerância legal (desconsidera variação)
  }
  return minutosDiferencaTotal; // Excedeu 10 min -> apura o tempo integral
}

/**
 * Calcula a fração de hora noturna ficta (CLT Art. 73 § 1º).
 * 1 hora noturna (22h às 05h) equivale a 52 minutos e 30 segundos (52.5 minutos).
 * Fator de conversão = 60 / 52.5 = 1.142857.
 */
export function calcularMinutosNoturnosFictos(minutosNoturnosReais: number): number {
  return Math.round(minutosNoturnosReais * 1.142857);
}

/**
 * Apura o resumo da jornada diária com base nas batidas e no horário contratual.
 */
export function apurarJornadaDiaria(
  batidas: BatidaPonto[],
  contrato: HorarioContratual,
  eDomingoOuFeriado: boolean = false
): ResumoJornadaDia {
  if (batidas.length < 2) {
    return {
      minutosTrabalhadosBruto: 0,
      minutosNoturnosConvertidos: 0,
      minutosTrabalhadosEfetivos: 0,
      minutosAtraso: contrato.cargaDiariaMin,
      minutosHoraExtra50: 0,
      minutosHoraExtra100: 0,
      minutosAdicionalNoturno: 0,
      minutosSuprimidosIntervalo: 0,
      saldoBancoHorasMin: -contrato.cargaDiariaMin,
    };
  }

  // Ordenar batidas por horário
  const batidasOrdenadas = [...batidas].sort(
    (a, b) => a.dataHora.getTime() - b.dataHora.getTime()
  );

  let minutosTrabalhadosBruto = 0;
  let minutosNoturnosReais = 0;

  // Calcular turnos (1º período e 2º período)
  for (let i = 0; i < batidasOrdenadas.length - 1; i += 2) {
    const entrada = batidasOrdenadas[i].dataHora;
    const saida = batidasOrdenadas[i + 1]?.dataHora;
    if (!saida) break;

    const diffMin = Math.round((saida.getTime() - entrada.getTime()) / (1000 * 60));
    minutosTrabalhadosBruto += diffMin;

    // Checar faixa noturna (22:00 às 05:00)
    // `const` porque a variavel nunca e reatribuida: `setMinutes` muta o
    // proprio objeto Date. Trocar por `let` sugeria uma reatribuicao que nao
    // existe.
    const curr = new Date(entrada.getTime());
    while (curr < saida) {
      const hora = curr.getHours();
      if (hora >= 22 || hora < 5) {
        minutosNoturnosReais += 1;
      }
      curr.setMinutes(curr.getMinutes() + 1);
    }
  }

  // Fator noturno de redução
  const minutosNoturnosExtra = calcularMinutosNoturnosFictos(minutosNoturnosReais) - minutosNoturnosReais;
  const minutosTrabalhadosEfetivos = minutosTrabalhadosBruto + minutosNoturnosExtra;

  // Tolerância CLT
  const diferencaComCarga = minutosTrabalhadosEfetivos - contrato.cargaDiariaMin;
  const diferencaApurada = aplicarToleranciaCLT(diferencaComCarga, contrato.toleranciaMin);

  let minutosAtraso = 0;
  let minutosHoraExtra50 = 0;
  let minutosHoraExtra100 = 0;

  if (diferencaApurada < 0) {
    minutosAtraso = Math.abs(diferencaApurada);
  } else if (diferencaApurada > 0) {
    if (eDomingoOuFeriado) {
      minutosHoraExtra100 = diferencaApurada;
    } else {
      minutosHoraExtra50 = diferencaApurada;
    }
  }

  // Verificação de intervalo intrajornada (CLT Art. 71)
  let minutosSuprimidosIntervalo = 0;
  if (contrato.cargaDiariaMin > 360 && batidasOrdenadas.length >= 4) {
    const saidaAlmoco = batidasOrdenadas[1].dataHora;
    const voltaAlmoco = batidasOrdenadas[2].dataHora;
    const intervaloTomado = Math.round((voltaAlmoco.getTime() - saidaAlmoco.getTime()) / (1000 * 60));
    if (intervaloTomado < 60) {
      minutosSuprimidosIntervalo = 60 - intervaloTomado;
    }
  }

  return {
    minutosTrabalhadosBruto,
    minutosNoturnosConvertidos: minutosNoturnosReais + minutosNoturnosExtra,
    minutosTrabalhadosEfetivos,
    minutosAtraso,
    minutosHoraExtra50,
    minutosHoraExtra100,
    minutosAdicionalNoturno: minutosNoturnosReais,
    minutosSuprimidosIntervalo,
    saldoBancoHorasMin: diferencaApurada,
  };
}

/**
 * Calcula o reflexo de Horas Extras no DSR (Descanso Semanal Remunerado - Lei 605/49).
 * Fórmula: (Total de Horas Extras no Mês / Dias Úteis no Mês) * Dias de DSR/Feriados no Mês
 */
export function calcularReflexoDSR(
  totalHorasExtrasMin: number,
  diasUteisMes: number,
  diasDsrEFeriadosMes: number
): number {
  if (diasUteisMes <= 0) return 0;
  const horasExtrasDia = totalHorasExtrasMin / diasUteisMes;
  return Math.round(horasExtrasDia * diasDsrEFeriadosMes);
}
