// Datas "de calendário" (admissão, férias, validade de documento) — dia, mês e
// ano, sem hora.
//
// Todas são gravadas como meia-noite UTC e manipuladas/exibidas em UTC. Se
// fossem tratadas no fuso local, a mesma data apareceria como o dia anterior no
// Brasil (UTC−3) em produção, onde o servidor roda em UTC — o clássico "as
// férias começaram um dia antes".
//
// Para instantes de verdade (createdAt, enviadoEm) continua valendo `new Date()`
// normal: ali a hora importa e o fuso é o do evento.

const MS_POR_DIA = 86_400_000;

export function dataUTC(ano: number, mes1a12: number, dia: number): Date {
  return new Date(Date.UTC(ano, mes1a12 - 1, dia));
}

/** Meia-noite UTC do dia de uma data (descarta a hora). */
export function inicioDoDiaUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Hoje, à meia-noite UTC. */
export function hojeUTC(): Date {
  return inicioDoDiaUTC(new Date());
}

export function somarDiasUTC(d: Date, dias: number): Date {
  return new Date(inicioDoDiaUTC(d).getTime() + dias * MS_POR_DIA);
}

/**
 * Soma anos preservando dia/mês. 29/02 vira 28/02 nos anos não bissextos — a
 * mesma convenção que a lei usa para aniversário de admissão.
 */
export function somarAnosUTC(d: Date, anos: number): Date {
  const ano = d.getUTCFullYear() + anos;
  const mes = d.getUTCMonth();
  const ultimoDiaDoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes, Math.min(d.getUTCDate(), ultimoDiaDoMes)));
}

/**
 * Soma meses preservando o dia. Dia que não existe no mês de destino cai no
 * último dia dele (31/01 + 1 mês = 28/02) — a convenção que a validade de
 * certificado e exame usa.
 */
export function somarMesesUTC(d: Date, meses: number): Date {
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + meses;
  const ano = Math.floor(total / 12);
  const mes = total % 12;
  const ultimoDiaDoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes, Math.min(d.getUTCDate(), ultimoDiaDoMes)));
}

/** Dias de calendário de `de` até `ate` (negativo quando `ate` é anterior). */
export function diferencaEmDiasUTC(ate: Date, de: Date): number {
  return Math.round((inicioDoDiaUTC(ate).getTime() - inicioDoDiaUTC(de).getTime()) / MS_POR_DIA);
}

export function mesmoDiaUTC(a: Date, b: Date): boolean {
  return inicioDoDiaUTC(a).getTime() === inicioDoDiaUTC(b).getTime();
}

/** "2026-07-24" — valor de um <input type="date">. */
export function paraInputDate(d: Date | null | undefined): string {
  return d ? inicioDoDiaUTC(d).toISOString().slice(0, 10) : "";
}

/** Lê um <input type="date"> ("2026-07-24") como meia-noite UTC. */
export function dataDoFormulario(valor: FormDataEntryValue | null | undefined): Date | null {
  const texto = typeof valor === "string" ? valor.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
  const [ano, mes, dia] = texto.split("-").map(Number);
  const d = dataUTC(ano, mes, dia);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatarData(d: Date | null | undefined): string {
  if (!d) return "—";
  const dia = String(d.getUTCDate()).padStart(2, "0");
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${d.getUTCFullYear()}`;
}

/** Data + hora de um instante, no fuso de Brasília (para telas de auditoria). */
export function formatarDataHoraBrasilia(d: Date): string {
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** "3 anos e 2 meses" — tempo de casa a partir da admissão. */
export function tempoDeCasa(dataAdmissao: Date, hoje: Date = hojeUTC()): string {
  let meses =
    (hoje.getUTCFullYear() - dataAdmissao.getUTCFullYear()) * 12 +
    (hoje.getUTCMonth() - dataAdmissao.getUTCMonth());
  if (hoje.getUTCDate() < dataAdmissao.getUTCDate()) meses--;
  if (meses < 0) return "—";

  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  const partes: string[] = [];
  if (anos > 0) partes.push(`${anos} ano${anos > 1 ? "s" : ""}`);
  if (resto > 0) partes.push(`${resto} ${resto > 1 ? "meses" : "mês"}`);
  return partes.length ? partes.join(" e ") : "menos de 1 mês";
}
