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

export type BatidaPonto = {
  tipo: "ENTRADA_1" | "SAIDA_1" | "ENTRADA_2" | "SAIDA_2";
  dataHora: Date;
};

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
