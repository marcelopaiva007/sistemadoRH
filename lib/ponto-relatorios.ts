// Conta pura dos Relatórios Avançados do ponto — fuso, mês, dia e pares de
// marcação. Sem banco, sem Next: testável em scripts/test-ponto-fuso-relatorios.ts.
//
// POR QUE EXISTE (26/11/2026). A action de Relatórios Avançados fazia a conta
// de fuso à mão e com o sinal TROCADO nas duas direções:
// - a janela do mês SUBTRAÍA 3h da meia-noite UTC: começava às 18:00 de
//   Brasília do último dia do mês anterior e terminava às 18:00 do último dia
//   do mês — a noite do último dia sumia e a do mês anterior entrava;
// - a leitura da hora SOMAVA 3h ao instante UTC: entrada às 08:00 de Brasília
//   (11:00Z) virava "14h" e contava como atraso; saída às 18:00 (21:00Z)
//   virava "0h" e contava como saída antecipada. Todo mundo atrasava e saía
//   cedo, todo dia;
// - o dia vinha de toDateString(), que lê no fuso do PROCESSO (UTC na Vercel,
//   o da máquina em dev): saída depois das 21:00 de Brasília caía no dia
//   seguinte e o par ENTRADA/SAÍDA do segundo turno se perdia.
//
// Regra: instante no banco é UTC; tudo que é "dia", "mês" ou "hora do
// relógio" do negócio é Brasília. Offset fixo -03:00 — o Brasil não tem
// horário de verão desde 2019 (Decreto 9.772/2019), a mesma premissa de
// janelaDoDiaBrasilia e dataHoraDoFormularioBrasilia em lib/datas.ts. Se o
// horário de verão voltar, OFFSET_BRASILIA_MS é o lugar a corrigir aqui.

import { dataUTC } from "@/lib/datas";

const OFFSET_BRASILIA_MS = 3 * 60 * 60 * 1000;

const NOMES_DOS_MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

/** O relógio de Brasília de um instante UTC: dia "AAAA-MM-DD", hora e minuto. */
export function relogioBrasilia(instante: Date): { dia: string; hora: number; minuto: number } {
  // Desloca o instante -3h e lê os campos em UTC: o resultado é a parede de
  // Brasília, independente do fuso do processo.
  const parede = new Date(instante.getTime() - OFFSET_BRASILIA_MS);
  return {
    dia: parede.toISOString().slice(0, 10),
    hora: parede.getUTCHours(),
    minuto: parede.getUTCMinutes(),
  };
}

/** O instante UTC de uma hora de relógio em Brasília (mês 1 a 12). */
export function instanteDeBrasilia(ano: number, mes1a12: number, dia: number, hora = 0, minuto = 0): Date {
  return new Date(Date.UTC(ano, mes1a12 - 1, dia, hora, minuto) + OFFSET_BRASILIA_MS);
}

/** "AAAA-MM" do mês em que `agora` cai, no calendário de Brasília. */
export function competenciaBrasilia(agora: Date = new Date()): string {
  return relogioBrasilia(agora).dia.slice(0, 7);
}

/** Lê "AAAA-MM" (ex.: vindo de ?mes=). Devolve null para qualquer outra coisa. */
export function lerCompetencia(texto: string | null | undefined): { ano: number; mes: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec((texto ?? "").trim());
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  if (ano < 2000 || ano > 2100 || mes < 1 || mes > 12) return null;
  return { ano, mes };
}

function exigirCompetencia(competencia: string): { ano: number; mes: number } {
  const lida = lerCompetencia(competencia);
  if (!lida) throw new Error(`Competência inválida: "${competencia}" (esperado AAAA-MM).`);
  return lida;
}

/**
 * Janela de INSTANTES do mês de Brasília: [inicio, fim), para filtro
 * `gte`/`lt` sobre RegistroPonto.dataHora / MarcacaoTratada.dataHora.
 * Novembro/2026 = 2026-11-01T03:00Z até 2026-12-01T03:00Z.
 */
export function janelaDoMesBrasilia(competencia: string): { inicio: Date; fim: Date } {
  const { ano, mes } = exigirCompetencia(competencia);
  const proximoAno = mes === 12 ? ano + 1 : ano;
  const proximoMes = mes === 12 ? 1 : mes + 1;
  return {
    inicio: instanteDeBrasilia(ano, mes, 1),
    fim: instanteDeBrasilia(proximoAno, proximoMes, 1),
  };
}

/**
 * Primeiro dia do mês como DATA DE CALENDÁRIO (meia-noite UTC) — a convenção
 * de Colaborador.dataDesligamento (lib/datas.ts). Serve para "quem ainda
 * estava na casa em algum dia deste mês".
 */
export function primeiroDiaDoMesCalendario(competencia: string): Date {
  const { ano, mes } = exigirCompetencia(competencia);
  return dataUTC(ano, mes, 1);
}

/** Mês anterior/seguinte a "AAAA-MM" (navegação da tela). */
export function deslocarCompetencia(competencia: string, meses: number): string {
  const { ano, mes } = exigirCompetencia(competencia);
  const total = ano * 12 + (mes - 1) + meses;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** "novembro de 2026". */
export function rotuloDaCompetencia(competencia: string): string {
  const { ano, mes } = exigirCompetencia(competencia);
  return `${NOMES_DOS_MESES[mes - 1]} de ${ano}`;
}

/** Agrupa marcações pelo DIA de Brasília em que aconteceram ("AAAA-MM-DD"). */
export function agruparPorDiaBrasilia<T extends { dataHora: Date }>(marcacoes: T[]): Map<string, T[]> {
  const porDia = new Map<string, T[]>();
  for (const m of marcacoes) {
    const dia = relogioBrasilia(m.dataHora).dia;
    const lista = porDia.get(dia) ?? [];
    lista.push(m);
    porDia.set(dia, lista);
  }
  return porDia;
}

/**
 * Minutos trabalhados num dia a partir dos pares ENTRADA_1→SAIDA_1 e
 * ENTRADA_2→SAIDA_2. Par incompleto não conta (não há como saber a hora que
 * falta — é caso de tratamento de ponto, não de estimativa). Par com saída
 * anterior à entrada também não conta.
 */
export function minutosTrabalhadosNoDia(marcacoesDoDia: { tipo: string; dataHora: Date }[]): number {
  let minutos = 0;
  for (const [entrada, saida] of [
    ["ENTRADA_1", "SAIDA_1"],
    ["ENTRADA_2", "SAIDA_2"],
  ] as const) {
    const e = marcacoesDoDia.find((m) => m.tipo === entrada);
    const s = marcacoesDoDia.find((m) => m.tipo === saida);
    if (!e || !s) continue;
    const diff = (s.dataHora.getTime() - e.dataHora.getTime()) / 60_000;
    if (diff > 0) minutos += diff;
  }
  return minutos;
}

/**
 * Heurística do painel (não é apuração): horário de referência fixo, 08:00
 * de entrada e 18:00 de saída, com 10 minutos de tolerância. O sistema ainda
 * não liga colaborador a uma JornadaTrabalho, então não há horário contratual
 * individual para comparar — a tela diz isso ao lado do número.
 */
export const REFERENCIA_PAINEL = { entradaMin: 8 * 60, saidaMin: 18 * 60, toleranciaMin: 10 } as const;

export function ehAtrasoNoPainel(instanteEntrada: Date): boolean {
  const { hora, minuto } = relogioBrasilia(instanteEntrada);
  return hora * 60 + minuto > REFERENCIA_PAINEL.entradaMin + REFERENCIA_PAINEL.toleranciaMin;
}

export function ehSaidaAntecipadaNoPainel(instanteSaida: Date): boolean {
  const { hora, minuto } = relogioBrasilia(instanteSaida);
  return hora * 60 + minuto < REFERENCIA_PAINEL.saidaMin - REFERENCIA_PAINEL.toleranciaMin;
}

/**
 * Quem entra nos relatórios do mês: ativo hoje, OU desligado a partir do
 * primeiro dia do mês (estava na casa em algum dia dele). Antes só entrava
 * `ativo: true`, e quem saiu no meio do mês sumia do relatório junto com as
 * horas que trabalhou.
 */
export function entraNoRelatorioDoMes(
  c: { ativo: boolean; dataDesligamento: Date | null },
  competencia: string,
): boolean {
  if (c.ativo) return true;
  return c.dataDesligamento != null && c.dataDesligamento.getTime() >= primeiroDiaDoMesCalendario(competencia).getTime();
}
