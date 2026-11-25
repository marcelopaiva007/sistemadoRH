// Conferência da escala contra a CLT — interjornada e descanso semanal.
//
// Criado em 26/11/2026. Até então a tela de Escalas montava a grade sem olhar
// nada: dava para escalar alguém de Tarde (sai 22h) e de Manhã no dia seguinte
// (entra 6h), ou sete dias seguidos sem folga, e nada avisava. A conferência
// AVISA, não bloqueia — quem decide é o RH (pode haver acordo coletivo,
// 12x36, compensação). As regras:
//
//   - Interjornada (CLT art. 66): mínimo de 11h entre o fim de um turno e o
//     início do seguinte.
//   - DSR (CLT art. 67; Lei 605/49 art. 1º): ao menos 24h consecutivas de
//     descanso em cada semana (segunda a domingo, a mesma semana da grade).
//     A Súmula 110 do TST soma as 11h de interjornada às 24h (35h) quando o
//     DSR é emendado num intervalo entre jornadas — isso fica para o RH; aqui
//     conferimos o mínimo de 24h.
//   - Domingo (CLT art. 67 e 386; Portaria MTP 671/2021, art. 69): quem
//     trabalha aos domingos precisa de ao menos 1 domingo de folga a cada 7
//     semanas — a regra geral. O COMÉRCIO tem regra mais curta, 1 a cada 3
//     semanas (Lei 10.101/2000, art. 6º, parágrafo único). Usamos 7 por padrão
//     (o `cicloDomingo` é parâmetro) — empresa de comércio deve conferir com 3.
//
// O turno gravado (EscalaTurno) é só um rótulo — MANHA, TARDE, NOITE... —,
// sem hora de entrada e saída. Para conferir horas, cada rótulo fixo tem um
// HORÁRIO PRESUMIDO abaixo; a mensagem diz que é presumido. Rótulo
// customizado do catálogo (sem horário conhecido) não entra na conta de
// interjornada e, no descanso semanal, ocupa o dia inteiro (o lado seguro:
// não inventa folga que talvez não exista).
//
// Dia SEM turno na grade conta como não trabalhado — a grade é "quem está
// escalado", e célula vazia é a pessoa fora da escala. Assim, semanas antigas
// nunca preenchidas não geram aviso falso.
//
// Sem Prisma e sem "use server": função pura, testada em
// scripts/test-escala-clt.ts.

const MIN_POR_DIA = 24 * 60;
const MS_POR_DIA = 86_400_000;

export const INTERJORNADA_MINIMA_MIN = 11 * 60;
export const DSR_MINIMO_MIN = 24 * 60;
/** Regra geral (Portaria MTP 671/2021). Comércio: 3 (Lei 10.101/2000, art. 6º). */
export const CICLO_DOMINGO_PADRAO = 7;

/** Turno que é descanso, não jornada. */
export const TURNOS_DE_FOLGA = new Set(["FOLGA"]);

/**
 * Horário presumido dos rótulos fixos, em minutos desde 00:00 do dia do turno.
 * `fim` menor que `inicio` = vira a meia-noite (termina no dia seguinte).
 * PLANTAO = 12h diurnas (o 12x36 da operação); INTEGRAL = 8h às 18h.
 */
export const HORARIO_PRESUMIDO: Record<string, { inicio: number; fim: number }> = {
  MANHA: { inicio: 6 * 60, fim: 14 * 60 },
  TARDE: { inicio: 14 * 60, fim: 22 * 60 },
  NOITE: { inicio: 22 * 60, fim: 6 * 60 },
  INTEGRAL: { inicio: 8 * 60, fim: 18 * 60 },
  PLANTAO: { inicio: 7 * 60, fim: 19 * 60 },
};

export type TurnoDaPessoa = {
  /** Dia do turno, "AAAA-MM-DD" (data de calendário, como na grade). */
  data: string;
  turno: string;
  /** Horário explícito, em minutos desde 00:00 — sobrepõe o presumido. */
  inicioMin?: number;
  fimMin?: number;
};

export type TipoViolacaoClt = "INTERJORNADA" | "DSR_SEMANAL" | "DOMINGO";

export type ViolacaoClt = {
  tipo: TipoViolacaoClt;
  /** Dia em que o aviso aparece na grade ("AAAA-MM-DD"). */
  data: string;
  mensagem: string;
};

type Intervalo = { inicio: number; fim: number; horarioConhecido: boolean; data: string; turno: string };

function diaEmNumero(iso: string): number {
  const [a, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(a, m - 1, d) / MS_POR_DIA);
}

function numeroEmDia(n: number): string {
  return new Date(n * MS_POR_DIA).toISOString().slice(0, 10);
}

/** 0 = segunda ... 6 = domingo (a semana da grade começa na segunda). */
function diaDaSemanaSegunda(n: number): number {
  // 01/01/1970 (n = 0) foi uma quinta-feira = 3 na contagem a partir da segunda.
  return (((n + 3) % 7) + 7) % 7;
}

function horas(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

function formatarDia(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** Intervalo absoluto (minutos desde 01/01/1970) de um turno de trabalho. */
function intervaloDoTurno(t: TurnoDaPessoa): Intervalo {
  const base = diaEmNumero(t.data) * MIN_POR_DIA;
  const presumido = HORARIO_PRESUMIDO[t.turno];
  const inicio = t.inicioMin ?? presumido?.inicio;
  const fim = t.fimMin ?? presumido?.fim;
  if (inicio === undefined || fim === undefined) {
    // Sem horário: ocupa o dia inteiro para o descanso semanal.
    return { inicio: base, fim: base + MIN_POR_DIA, horarioConhecido: false, data: t.data, turno: t.turno };
  }
  const fimAbs = fim > inicio ? base + fim : base + MIN_POR_DIA + fim;
  return { inicio: base + inicio, fim: fimAbs, horarioConhecido: true, data: t.data, turno: t.turno };
}

/**
 * Confere os turnos de UMA pessoa. `periodo` delimita as semanas avaliadas no
 * DSR (só semanas inteiras de segunda a domingo dentro dele); interjornada e
 * domingo olham todos os turnos recebidos. O chamador costuma mandar algumas
 * semanas para trás da semana exibida, para a regra do domingo ter histórico,
 * e filtrar os avisos pela semana que está na tela.
 */
export function conferirEscalaClt(
  turnos: readonly TurnoDaPessoa[],
  periodo: { inicio: string; fim: string },
  opcoes: { cicloDomingo?: number; rotuloDoTurno?: (turno: string) => string } = {},
): ViolacaoClt[] {
  const cicloDomingo = opcoes.cicloDomingo ?? CICLO_DOMINGO_PADRAO;
  const rotulo = opcoes.rotuloDoTurno ?? ((t: string) => t);
  const violacoes: ViolacaoClt[] = [];

  const trabalho = turnos
    .filter((t) => !TURNOS_DE_FOLGA.has(t.turno))
    .map(intervaloDoTurno)
    .sort((a, b) => a.inicio - b.inicio);

  // --- Interjornada: entre turnos seguidos com horário conhecido. ---
  for (let i = 1; i < trabalho.length; i++) {
    const anterior = trabalho[i - 1];
    const atual = trabalho[i];
    if (!anterior.horarioConhecido || !atual.horarioConhecido) continue;
    const descanso = atual.inicio - anterior.fim;
    if (descanso < INTERJORNADA_MINIMA_MIN) {
      violacoes.push({
        tipo: "INTERJORNADA",
        data: atual.data,
        mensagem:
          descanso < 0
            ? `Turno ${rotulo(atual.turno)} de ${formatarDia(atual.data)} começa antes de terminar o ${rotulo(anterior.turno)} de ${formatarDia(anterior.data)} (horário presumido).`
            : `Só ${horas(descanso)} de descanso entre o ${rotulo(anterior.turno)} de ${formatarDia(anterior.data)} e o ${rotulo(atual.turno)} de ${formatarDia(atual.data)} — a CLT (art. 66) exige 11h (horário presumido).`,
      });
    }
  }

  // --- DSR: cada semana inteira do período precisa de 24h seguidas livres. ---
  // Descansos = buracos entre turnos de trabalho; antes do primeiro e depois do
  // último, o descanso é aberto (dia sem turno conta como não trabalhado).
  const descansos: { inicio: number; fim: number }[] = [];
  let livreDesde = Number.NEGATIVE_INFINITY;
  for (const t of trabalho) {
    if (t.inicio > livreDesde) descansos.push({ inicio: livreDesde, fim: t.inicio });
    livreDesde = Math.max(livreDesde, t.fim);
  }
  descansos.push({ inicio: livreDesde, fim: Number.POSITIVE_INFINITY });

  const diasTrabalhados = new Set(trabalho.map((t) => diaEmNumero(t.data)));
  const inicioPeriodo = diaEmNumero(periodo.inicio);
  const fimPeriodo = diaEmNumero(periodo.fim);
  // Primeira segunda-feira dentro do período.
  let segunda = inicioPeriodo + ((7 - diaDaSemanaSegunda(inicioPeriodo)) % 7);
  for (; segunda + 6 <= fimPeriodo; segunda += 7) {
    const semanaIni = segunda * MIN_POR_DIA;
    const semanaFim = (segunda + 7) * MIN_POR_DIA;
    // Vale o descanso de 24h que cabe inteiro na semana, ou que COMEÇA nela —
    // este último só se a semana tem ao menos um dia sem turno: trabalhar os
    // 7 dias e descansar a partir do domingo à noite é o 7º dia seguido de
    // trabalho (OJ 410 da SDI-1 do TST), não DSR. Um descanso que começou no
    // domingo anterior e só tem 2h nesta semana não serve para esta.
    let diasComTurno = 0;
    for (let n = segunda; n < segunda + 7; n++) if (diasTrabalhados.has(n)) diasComTurno++;
    const cumpre = descansos.some((d) => {
      const tamanho = d.fim - d.inicio;
      if (tamanho < DSR_MINIMO_MIN) return false;
      const comecaNaSemana = d.inicio >= semanaIni && d.inicio < semanaFim;
      const dentro = Math.min(d.fim, semanaFim) - Math.max(d.inicio, semanaIni);
      return dentro >= DSR_MINIMO_MIN || (comecaNaSemana && diasComTurno < 7);
    });
    if (!cumpre) {
      const domingo = numeroEmDia(segunda + 6);
      violacoes.push({
        tipo: "DSR_SEMANAL",
        data: domingo,
        mensagem: `Semana de ${formatarDia(numeroEmDia(segunda))} a ${formatarDia(domingo)} sem 24h seguidas de descanso — a CLT (art. 67) exige o repouso semanal, de preferência no domingo.`,
      });
    }
  }

  // --- Domingo: no máximo (ciclo - 1) domingos trabalhados em sequência. ---
  const domingosTrabalhados = new Set(
    trabalho.map((t) => diaEmNumero(t.data)).filter((n) => diaDaSemanaSegunda(n) === 6),
  );
  if (domingosTrabalhados.size > 0) {
    const ordenados = [...domingosTrabalhados].sort((a, b) => a - b);
    let seguidos = 0;
    let anterior: number | null = null;
    for (const domingo of ordenados) {
      seguidos = anterior !== null && domingo - anterior === 7 ? seguidos + 1 : 1;
      anterior = domingo;
      if (seguidos >= cicloDomingo && seguidos % cicloDomingo === 0) {
        violacoes.push({
          tipo: "DOMINGO",
          data: numeroEmDia(domingo),
          mensagem: `${cicloDomingo}º domingo seguido trabalhado — o descanso precisa cair num domingo ao menos 1 vez a cada ${cicloDomingo} semanas (comércio: a cada 3, Lei 10.101/2000 art. 6º).`,
        });
      }
    }
  }

  return violacoes;
}

export const ROTULO_VIOLACAO: Record<TipoViolacaoClt, string> = {
  INTERJORNADA: "Interjornada",
  DSR_SEMANAL: "Sem folga na semana",
  DOMINGO: "Domingo",
};
