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
/**
 * O DIA em Brasília, como "2026-08-13" — a chave para agrupar ou comparar
 * "aconteceu no mesmo dia?".
 *
 * POR QUE NÃO DÁ PARA USAR A DATA CRUA. Na Vercel o processo roda em UTC, e
 * `toISOString().slice(0, 10)` de uma batida às 21h30 de Brasília devolve o dia
 * SEGUINTE. Toda regra que pergunta "já aconteceu hoje?" erra no fim do
 * expediente — justamente quando o segundo turno está batendo o ponto.
 *
 * "en-CA" porque é o locale que formata como aaaa-mm-dd; o idioma não importa,
 * o formato sim. Comparar essas strings é comparar dias.
 *
 * Estava copiada em três arquivos (produtividade, cobrança de cadastro e
 * cobrança de pendências) antes de virar isto.
 */
export function diaBrasilia(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

export function formatarDataHoraBrasilia(d: Date): string {
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/**
 * A janela de INSTANTES do dia de Brasília de `d`: [inicio, fim), pronta para
 * um filtro `gte`/`lt` sobre coluna de instante (RegistroPonto.dataHora, que
 * guarda o instante UTC).
 *
 * POR QUE NÃO `new Date().setHours(0, 0, 0, 0)`. Aquilo zera a hora no fuso do
 * PROCESSO — UTC na Vercel — e produz a janela das 21:00 de ONTEM às 20:59 de
 * hoje em Brasília. Toda lista "de hoje" erra nas duas pontas do dia: some
 * depois das 21:00 (o segundo turno, justamente) e, entre 00:00 e 02:59,
 * mostra as marcações de ontem como se fossem de hoje. É o mesmo defeito que
 * `diaBrasilia` acima existe para evitar nas comparações de dia.
 *
 * O DIA vem de diaBrasilia(); o OFFSET é fixo em -03:00 porque o Brasil não
 * tem horário de verão desde 2019 (Decreto 9.772/2019) — a mesma premissa de
 * dataHoraDoFormularioBrasilia. Se o horário de verão voltar, estes são os
 * dois únicos lugares a corrigir, e o erro seria de uma hora: durante o verão
 * a janela começaria às 23:00 do dia anterior. As formas que não dependem da
 * premissa: ler o offset real do instante com Intl (`timeZoneName:
 * "longOffset"`), ou buscar uma janela folgada e filtrar em JS comparando
 * chaves de diaBrasilia — o caminho que jaBateuHoje já usa.
 */
export function janelaDoDiaBrasilia(d: Date = new Date()): { inicio: Date; fim: Date } {
  const inicio = new Date(`${diaBrasilia(d)}T00:00:00-03:00`);
  return { inicio, fim: new Date(inicio.getTime() + MS_POR_DIA) };
}

/**
 * Instante digitado num `<input type="datetime-local">`, interpretado como
 * horário de BRASÍLIA — não do servidor.
 *
 * O input entrega "2026-08-23T14:30", sem fuso. `new Date()` disso usa o fuso
 * do PROCESSO: UTC na Vercel, o fuso da máquina em dev. A mesma digitação
 * viraria instantes diferentes em dev e produção, e a tela (que formata em
 * America/Sao_Paulo) mostraria 11:30 para quem digitou 14:30 — com a data
 * rolando para o dia anterior nas primeiras horas da madrugada. Para a hora de
 * uma infração de trânsito, que decide QUEM estava com o veículo, isso não é
 * cosmético.
 *
 * O offset é fixo em -03:00 porque o Brasil não tem horário de verão desde
 * 2019 (Decreto 9.772/2019) e Brasília não muda de fuso. Se um dia voltar,
 * este é o único lugar a corrigir.
 */
export function dataHoraDoFormularioBrasilia(valor: string | null | undefined): Date | null {
  const texto = (valor ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(texto)) return null;
  const d = new Date(`${texto}-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Dia do mês de uma data de calendário (aniversário, admissão), em UTC. */
export function diaDoMes(d: Date): number {
  return d.getUTCDate();
}

/** Anos completos entre uma data-base (nascimento, admissão) e hoje. */
export function anosCompletos(base: Date, hoje: Date = hojeUTC()): number {
  let anos = hoje.getUTCFullYear() - base.getUTCFullYear();
  const aindaNaoFezAniversarioEsseAno =
    hoje.getUTCMonth() < base.getUTCMonth() ||
    (hoje.getUTCMonth() === base.getUTCMonth() && hoje.getUTCDate() < base.getUTCDate());
  if (aindaNaoFezAniversarioEsseAno) anos--;
  return anos;
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
