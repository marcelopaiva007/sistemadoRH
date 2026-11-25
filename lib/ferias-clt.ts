// Regras da CLT de férias que dependem de mais que a data de admissão —
// criado em 26/11/2026.
//
// Até esta data o motor (lib/ferias.ts) assumia 30 dias cheios por período e
// só conferia saldo e fracionamento. Aqui moram, como funções puras (sem
// Prisma, sem "use server"), as regras que o RH pediu para o sistema aplicar:
//
//   * art. 130 — dias de direito conforme as faltas injustificadas no período
//     aquisitivo (30 / 24 / 18 / 12 / perde);
//   * art. 133, IV — perde o direito quem recebeu auxílio-doença/acidente por
//     mais de 6 meses no período aquisitivo, mesmo descontínuos; o novo período
//     começa na volta ao trabalho (§2º);
//   * art. 134 §1º — fracionamento em até 3 períodos, um com 14+ dias e os
//     demais com 5+;
//   * art. 134 §3º — início vedado nos 2 dias antes de feriado ou do DSR;
//   * art. 135 — aviso ao empregado com 30 dias de antecedência;
//   * art. 145 — pagamento até 2 dias antes do início.
//
// Testado em scripts/test-ferias-clt.ts. Datas são de calendário (meia-noite
// UTC — ver lib/datas.ts).
import { diaBrasilia, diferencaEmDiasUTC, inicioDoDiaUTC, somarDiasUTC } from "@/lib/datas";

// ---------------------------------------------------------------
// Ausências que mexem no direito (art. 130 e 133)
// ---------------------------------------------------------------

/**
 * O recorte de `Ausencia` que o motor de férias precisa. `status` entra porque
 * só ausência APROVADA conta — pedido pendente ou recusado não tira direito.
 */
export type AusenciaParaFerias = {
  tipo: string;
  dataInicio: Date;
  dataFim: Date;
  /** Dias gravados na ausência — corridos, contando as duas pontas. */
  dias: number;
  abonada: boolean;
  status: string;
};

/**
 * Tipos que são "prestação da Previdência" para o art. 133, IV: auxílio-doença
 * (AFASTAMENTO_INSS) e acidente de trabalho. Também são as ausências que o art.
 * 131 manda NÃO contar como falta — por isso ficam fora do art. 130 mesmo se
 * alguém desmarcar "abonada".
 */
export const TIPOS_AFASTAMENTO_PREVIDENCIARIO: readonly string[] = ["AFASTAMENTO_INSS", "ACIDENTE_TRABALHO"];

/**
 * Filtro Prisma das ausências que interessam às férias — para as telas buscarem
 * só o necessário (sem importar Prisma aqui: é um objeto simples). Falta não
 * abonada (art. 130) ou afastamento previdenciário (art. 133), já aprovada.
 */
export const WHERE_AUSENCIAS_PARA_FERIAS = {
  status: "APROVADA",
  OR: [{ abonada: false }, { tipo: { in: [...TIPOS_AFASTAMENTO_PREVIDENCIARIO] } }],
};

/** Select Prisma que casa com `AusenciaParaFerias`. */
export const SELECT_AUSENCIAS_PARA_FERIAS = {
  tipo: true,
  dataInicio: true,
  dataFim: true,
  dias: true,
  abonada: true,
  status: true,
} as const;

/**
 * Quantos dias da ausência caem dentro de [inicio, fim]. Ausência inteira lá
 * dentro devolve o `dias` gravado (o número que o RH aprovou); a que atravessa
 * a borda conta só os dias corridos de dentro, nunca mais que o gravado.
 */
export function diasDaAusenciaNoIntervalo(a: AusenciaParaFerias, inicio: Date, fim: Date): number {
  const de = inicioDoDiaUTC(a.dataInicio);
  const ate = inicioDoDiaUTC(a.dataFim);
  const ini = inicioDoDiaUTC(inicio);
  const end = inicioDoDiaUTC(fim);
  if (ate < de || ate < ini || de > end) return 0;
  if (de >= ini && ate <= end) return Math.max(0, a.dias);
  const corte1 = de > ini ? de : ini;
  const corte2 = ate < end ? ate : end;
  return Math.max(0, Math.min(diferencaEmDiasUTC(corte2, corte1) + 1, a.dias));
}

/**
 * Faltas injustificadas no período aquisitivo (art. 130).
 *
 * O sistema distingue justificada de injustificada pelo campo `abonada` da
 * ausência — o MESMO critério que a Folha usa para lançar a rubrica FALTA
 * (lib/actions/rh-folha.ts, `importarEventosDerivados`). Assim o que a folha
 * desconta como falta é o que reduz as férias, sem segunda definição. Entram
 * por padrão FALTA_INJUSTIFICADA, SUSPENSAO e OUTRO (os tipos que nascem não
 * abonados em TIPOS_AUSENCIA); o RH pode abonar caso a caso. Afastamento
 * previdenciário nunca conta (art. 131, III).
 *
 * Conta dias corridos da ausência recortados ao período — o registro de
 * ausência não diz quais dias eram de trabalho. Uma "falta" lançada de sexta a
 * segunda vira 4 faltas; o RH lança dia a dia quando quer precisão.
 */
export function faltasInjustificadasNoPeriodo(
  ausencias: readonly AusenciaParaFerias[],
  inicio: Date,
  fim: Date,
): number {
  return ausencias
    .filter(
      (a) => a.status === "APROVADA" && !a.abonada && !TIPOS_AFASTAMENTO_PREVIDENCIARIO.includes(a.tipo),
    )
    .reduce((total, a) => total + diasDaAusenciaNoIntervalo(a, inicio, fim), 0);
}

/** Tabela do art. 130: dias de férias conforme as faltas injustificadas. */
export function diasDeDireitoPorFaltas(faltas: number): number {
  if (faltas <= 5) return 30;
  if (faltas <= 14) return 24;
  if (faltas <= 23) return 18;
  if (faltas <= 32) return 12;
  return 0;
}

/**
 * "Mais de 6 meses" do art. 133, IV, em dias. 180 e não meses de calendário:
 * os afastamentos são descontínuos e somados em dias, e 6 × 30 é a leitura
 * corrente do DP. Passou de 180 dias somados no período, perdeu.
 */
export const DIAS_AFASTAMENTO_PERDE_FERIAS = 180;

export type PerdaPorAfastamento = {
  /** Dias de afastamento previdenciário somados no período até a perda. */
  diasAfastado: number;
  /** Dia da volta ao trabalho — onde começa o novo período aquisitivo (art. 133 §2º). */
  retorno: Date;
};

/**
 * Art. 133, IV: dentro de [inicio, fim] do período aquisitivo, soma os dias de
 * afastamento previdenciário APROVADO. Quando a soma passa de 180, o período
 * está perdido e o próximo começa no dia seguinte ao fim do afastamento que
 * cruzou a marca. Devolve null quando não houve perda.
 *
 * Limitação conhecida: a lei fala em "prestações da Previdência", e os 15
 * primeiros dias de cada afastamento são pagos pela empresa. O sistema não
 * separa essa parte — conta o afastamento inteiro como lançado.
 */
export function perdaPorAfastamento(
  ausencias: readonly AusenciaParaFerias[],
  inicio: Date,
  fim: Date,
): PerdaPorAfastamento | null {
  const afastamentos = ausencias
    .filter((a) => a.status === "APROVADA" && TIPOS_AFASTAMENTO_PREVIDENCIARIO.includes(a.tipo))
    .slice()
    .sort((a, b) => a.dataInicio.getTime() - b.dataInicio.getTime());

  let soma = 0;
  for (const a of afastamentos) {
    soma += diasDaAusenciaNoIntervalo(a, inicio, fim);
    if (soma > DIAS_AFASTAMENTO_PERDE_FERIAS) {
      return { diasAfastado: soma, retorno: somarDiasUTC(inicioDoDiaUTC(a.dataFim), 1) };
    }
  }
  return null;
}

// ---------------------------------------------------------------
// Fracionamento (art. 134 §1º)
// ---------------------------------------------------------------

export const MAXIMO_FRACOES_CLT = 3;
export const MINIMO_DIAS_FRACAO_CLT = 5;
export const MINIMO_DIAS_FRACAO_PRINCIPAL_CLT = 14;

/**
 * Confere se as frações de gozo de um período, somadas ao que ainda sobra de
 * saldo (`restante`), ainda podem fechar um plano válido:
 *   * no máximo 3 frações;
 *   * havendo divisão (mais de uma fração já marcada, ou sobra depois desta),
 *     cada fração com 5+ dias, e uma delas com 14+ — se nenhuma marcada tem 14,
 *     a sobra precisa caber numa fração de 14+;
 *   * sobra que não pode mais virar fração (já são 3, ou é menor que 5) é
 *     bloqueada: seriam dias de direito que ninguém consegue gozar.
 *
 * Devolve a mensagem de erro, ou null quando o plano é válido. Com `restante`
 * 0 é a conferência do plano completo (14+5+5 passa, 13+9+8 não).
 */
export function erroDeFracionamento(fracoes: readonly number[], restante: number): string | null {
  if (fracoes.length === 0) return null;
  if (fracoes.length > MAXIMO_FRACOES_CLT) {
    return `As férias podem ser divididas em no máximo ${MAXIMO_FRACOES_CLT} períodos (CLT art. 134 §1º).`;
  }
  const fracionado = fracoes.length > 1 || restante > 0;
  if (!fracionado) return null;

  if (fracoes.some((d) => d < MINIMO_DIAS_FRACAO_CLT)) {
    return `Ao dividir as férias, nenhum período pode ter menos de ${MINIMO_DIAS_FRACAO_CLT} dias corridos (CLT art. 134 §1º).`;
  }
  const temPrincipal = fracoes.some((d) => d >= MINIMO_DIAS_FRACAO_PRINCIPAL_CLT);

  if (restante > 0) {
    if (fracoes.length >= MAXIMO_FRACOES_CLT) {
      return `Este seria o ${MAXIMO_FRACOES_CLT}º período e sobrariam ${restante} dia(s) que não poderiam mais ser gozados — as férias se dividem em no máximo ${MAXIMO_FRACOES_CLT} períodos (CLT art. 134 §1º).`;
    }
    if (restante < MINIMO_DIAS_FRACAO_CLT) {
      return `Sobrariam ${restante} dia(s) no período — menos que os ${MINIMO_DIAS_FRACAO_CLT} dias de um período fracionado (CLT art. 134 §1º). Ajuste para usar o saldo todo ou deixar ${MINIMO_DIAS_FRACAO_CLT} dias ou mais.`;
    }
    if (!temPrincipal && restante < MINIMO_DIAS_FRACAO_PRINCIPAL_CLT) {
      return `Ao dividir as férias, um dos períodos precisa ter pelo menos ${MINIMO_DIAS_FRACAO_PRINCIPAL_CLT} dias corridos (CLT art. 134 §1º) — com esta fração, nenhum chega a ${MINIMO_DIAS_FRACAO_PRINCIPAL_CLT} e sobram só ${restante} dia(s).`;
    }
    return null;
  }

  if (!temPrincipal) {
    return `Ao dividir as férias, um dos períodos precisa ter pelo menos ${MINIMO_DIAS_FRACAO_PRINCIPAL_CLT} dias corridos (CLT art. 134 §1º).`;
  }
  return null;
}

// ---------------------------------------------------------------
// Início vedado (art. 134 §3º)
// ---------------------------------------------------------------

/**
 * Dia do repouso semanal remunerado: domingo (getUTCDay() === 0). O sistema não
 * guarda escala de DSR por pessoa nem tabela de feriados — domingo é o padrão
 * da CLT (art. 67) e é o que se confere.
 */
export const DIA_DSR_PADRAO = 0;

const NOMES_DIA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

/**
 * Art. 134 §3º: férias não começam nos 2 dias que antecedem feriado ou o DSR.
 * Com DSR no domingo, início na sexta ou no sábado é vedado. É AVISO, não
 * bloqueio (26/11/2026): o repouso de cada pessoa não está no cadastro. Feriados NÃO são
 * conferidos (o sistema não tem a tabela) — a tela avisa isso.
 */
export function erroDeInicioAntesDoDsr(dataInicio: Date): string | null {
  const dia = inicioDoDiaUTC(dataInicio).getUTCDay();
  const diasAteDsr = (DIA_DSR_PADRAO - dia + 7) % 7;
  if (diasAteDsr === 1 || diasAteDsr === 2) {
    return `Atenção: início na ${NOMES_DIA[dia]} cai nos 2 dias antes do repouso semanal, se o repouso desta pessoa for no domingo (CLT art. 134 §3º). Para quem folga aos domingos, prefira começar de segunda a quinta; quem trabalha em escala com folga em outro dia pode começar na ${NOMES_DIA[dia]}.`;
  }
  return null;
}

/** Aviso fixo da tela: o que a conferência de início não cobre. */
export const AVISO_FERIADOS_NAO_CONFERIDOS =
  "O sistema confere só o repouso semanal (domingo). Feriados não são conferidos: confira se o início não cai nos 2 dias antes de um feriado (CLT art. 134 §3º).";

// ---------------------------------------------------------------
// Prazos: aviso (art. 135) e pagamento (art. 145)
// ---------------------------------------------------------------

export const DIAS_AVISO_FERIAS = 30;
export const DIAS_ANTECEDENCIA_PAGAMENTO = 2;

/** Dias entre `referencia` e o início das férias (negativo = já começou). */
export function diasDeAntecedencia(dataInicio: Date, referencia: Date): number {
  return diferencaEmDiasUTC(dataInicio, referencia);
}

/**
 * Art. 135: o empregado tem de ser avisado por escrito com 30 dias de
 * antecedência. É PRAZO, não validade — a programação não é bloqueada, só
 * alertada. Devolve o texto do alerta, ou null quando há antecedência.
 */
export function alertaDeAvisoPrevio(dataInicio: Date, referencia: Date): string | null {
  const dias = diasDeAntecedencia(dataInicio, referencia);
  if (dias >= DIAS_AVISO_FERIAS) return null;
  if (dias < 0) return null; // já começou: não há mais aviso a dar
  return `As férias começam em ${dias} dia(s) — a CLT (art. 135) pede aviso ao empregado com ${DIAS_AVISO_FERIAS} dias de antecedência. Comunique por escrito o quanto antes.`;
}

/**
 * Dias de antecedência com que a programação foi lançada: do DIA (em Brasília)
 * em que o pedido entrou no sistema até o início do gozo. É o que a agenda usa
 * para apontar programação feita com menos de 30 dias (art. 135) — "falta
 * pouco para começar" sozinho não é problema se o aviso saiu lá atrás.
 */
export function antecedenciaDaProgramacao(dataInicio: Date, programadoEm: Date): number {
  const diaDoPedido = new Date(`${diaBrasilia(programadoEm)}T00:00:00Z`);
  return diferencaEmDiasUTC(dataInicio, diaDoPedido);
}

/** Art. 145: o pagamento das férias (e do abono) vence 2 dias antes do início. */
export function dataLimitePagamento(dataInicio: Date): Date {
  return somarDiasUTC(inicioDoDiaUTC(dataInicio), -DIAS_ANTECEDENCIA_PAGAMENTO);
}
