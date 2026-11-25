// Fuso de Brasília nos Relatórios Avançados do ponto (lib/ponto-relatorios.ts).
//
// POR QUE EXISTE (26/11/2026). A action dos Relatórios Avançados fazia conta
// de fuso à mão com o sinal trocado: a janela do mês começava às 18:00 de
// Brasília do último dia do mês anterior; a hora lida somava 3h (entrada às
// 08:00 virava 14h = atraso; saída às 18:00 virava 0h = saída antecipada); e o
// dia vinha do fuso do processo, então a saída depois das 21:00 caía no dia
// seguinte e o par do segundo turno se perdia. Este arquivo prega o certo.
//
// Roda sem banco — regra pura — no job `verificar` do CI. Os resultados não
// podem depender do fuso da máquina: o CI roda em UTC, o dev em Brasília.

import {
  agruparPorDiaBrasilia,
  competenciaBrasilia,
  deslocarCompetencia,
  ehAtrasoNoPainel,
  ehSaidaAntecipadaNoPainel,
  entraNoRelatorioDoMes,
  instanteDeBrasilia,
  janelaDoMesBrasilia,
  lerCompetencia,
  minutosTrabalhadosNoDia,
  primeiroDiaDoMesCalendario,
  relogioBrasilia,
  rotuloDaCompetencia,
} from "../lib/ponto-relatorios";
import { dataUTC } from "../lib/datas";

let falhas = 0;
function ok(condicao: boolean, descricao: string) {
  console.log(`${condicao ? "✅" : "❌"} ${descricao}`);
  if (!condicao) falhas++;
}

const iso = (d: Date) => d.toISOString();

console.log("\n— Janela do mês em Brasília —");
{
  const { inicio, fim } = janelaDoMesBrasilia("2026-11");
  ok(iso(inicio) === "2026-11-01T03:00:00.000Z", "novembro começa 01/11 00:00 de Brasília (03:00Z), não 31/10 18:00");
  ok(iso(fim) === "2026-12-01T03:00:00.000Z", "novembro termina (exclusivo) 01/12 00:00 de Brasília");

  const dez = janelaDoMesBrasilia("2026-12");
  ok(iso(dez.fim) === "2027-01-01T03:00:00.000Z", "dezembro vira o ano certo");

  // Batida às 22:30 de Brasília do dia 30/11 (01:30Z de 01/12) é de novembro.
  const tarde = instanteDeBrasilia(2026, 11, 30, 22, 30);
  ok(iso(tarde) === "2026-12-01T01:30:00.000Z", "30/11 22:30 de Brasília = 01/12 01:30Z");
  ok(tarde >= inicio && tarde < fim, "…e cai DENTRO da janela de novembro");

  // Batida às 19:00 de 31/10 (22:00Z de 31/10) é de outubro — a janela antiga
  // (que começava 31/10 18:00 de Brasília) a puxava para novembro.
  const outubro = instanteDeBrasilia(2026, 10, 31, 19, 0);
  ok(!(outubro >= inicio && outubro < fim), "31/10 19:00 de Brasília NÃO entra em novembro");
}

console.log("\n— Hora do relógio: atraso e saída antecipada —");
{
  const entrada0800 = instanteDeBrasilia(2026, 11, 10, 8, 0);
  ok(iso(entrada0800) === "2026-11-10T11:00:00.000Z", "08:00 de Brasília = 11:00Z");
  ok(relogioBrasilia(entrada0800).hora === 8, "relógio de Brasília lê 8h (o código antigo lia 14h)");
  ok(!ehAtrasoNoPainel(entrada0800), "entrada às 08:00 NÃO é atraso");
  ok(!ehAtrasoNoPainel(instanteDeBrasilia(2026, 11, 10, 8, 10)), "entrada às 08:10 está na tolerância");
  ok(ehAtrasoNoPainel(instanteDeBrasilia(2026, 11, 10, 8, 11)), "entrada às 08:11 é atraso");

  const saida1800 = instanteDeBrasilia(2026, 11, 10, 18, 0);
  ok(relogioBrasilia(saida1800).hora === 18, "saída às 18:00 lê 18h (o código antigo lia 0h)");
  ok(!ehSaidaAntecipadaNoPainel(saida1800), "saída às 18:00 NÃO é saída antecipada");
  ok(!ehSaidaAntecipadaNoPainel(instanteDeBrasilia(2026, 11, 10, 17, 50)), "saída às 17:50 está na tolerância");
  ok(ehSaidaAntecipadaNoPainel(instanteDeBrasilia(2026, 11, 10, 17, 49)), "saída às 17:49 é antecipada");
  ok(!ehSaidaAntecipadaNoPainel(instanteDeBrasilia(2026, 11, 10, 22, 30)), "saída às 22:30 não é antecipada");
}

console.log("\n— Dia de Brasília: saída às 22:30 fica no mesmo dia —");
{
  const marcacoes = [
    { tipo: "ENTRADA_1", dataHora: instanteDeBrasilia(2026, 11, 10, 13, 0) },
    { tipo: "SAIDA_1", dataHora: instanteDeBrasilia(2026, 11, 10, 17, 0) },
    { tipo: "ENTRADA_2", dataHora: instanteDeBrasilia(2026, 11, 10, 18, 0) },
    { tipo: "SAIDA_2", dataHora: instanteDeBrasilia(2026, 11, 10, 22, 30) },
  ];
  const porDia = agruparPorDiaBrasilia(marcacoes);
  ok(porDia.size === 1 && porDia.has("2026-11-10"), "as 4 marcações ficam em 10/11 (a de 22:30 é 01:30Z de 11/11)");
  ok(minutosTrabalhadosNoDia(porDia.get("2026-11-10")!) === 4 * 60 + 4 * 60 + 30, "8h30 trabalhadas no dia (par do 2º turno não se perde)");

  // Pós-meia-noite de Brasília é outro dia.
  ok(relogioBrasilia(instanteDeBrasilia(2026, 11, 11, 0, 30)).dia === "2026-11-11", "00:30 de Brasília já é o dia seguinte");
}

console.log("\n— Pares incompletos e invertidos —");
{
  const so = [{ tipo: "ENTRADA_1", dataHora: instanteDeBrasilia(2026, 11, 10, 8, 0) }];
  ok(minutosTrabalhadosNoDia(so) === 0, "só a entrada: 0 minutos (não estima o que falta)");
  const invertido = [
    { tipo: "ENTRADA_1", dataHora: instanteDeBrasilia(2026, 11, 10, 12, 0) },
    { tipo: "SAIDA_1", dataHora: instanteDeBrasilia(2026, 11, 10, 8, 0) },
  ];
  ok(minutosTrabalhadosNoDia(invertido) === 0, "saída antes da entrada: não conta");
}

console.log("\n— Mês corrente em Brasília, na virada —");
{
  // 31/12/2026 22:00 de Brasília = 01/01/2027 01:00Z. Em UTC já é janeiro.
  const virada = instanteDeBrasilia(2026, 12, 31, 22, 0);
  ok(iso(virada) === "2027-01-01T01:00:00.000Z", "31/12 22:00 de Brasília = 01/01 01:00Z");
  ok(competenciaBrasilia(virada) === "2026-12", "mês corrente na virada é 2026-12 (UTC diria 2027-01)");
  ok(competenciaBrasilia(instanteDeBrasilia(2027, 1, 1, 0, 0)) === "2027-01", "à meia-noite de Brasília vira 2027-01");
  ok(competenciaBrasilia(new Date("2026-11-30T23:59:00Z")) === "2026-11", "30/11 20:59 de Brasília ainda é novembro");
}

console.log("\n— Competência: leitura, navegação e rótulo —");
{
  ok(lerCompetencia("2026-11")?.mes === 11, "lê 2026-11");
  ok(lerCompetencia("2026-13") === null, "recusa mês 13");
  ok(lerCompetencia("2026-1") === null, "recusa formato sem zero");
  ok(lerCompetencia("abc") === null && lerCompetencia(undefined) === null, "recusa lixo e vazio");
  ok(deslocarCompetencia("2026-01", -1) === "2025-12", "janeiro − 1 = dezembro do ano anterior");
  ok(deslocarCompetencia("2026-12", 1) === "2027-01", "dezembro + 1 = janeiro do ano seguinte");
  ok(rotuloDaCompetencia("2026-03") === "março de 2026", "rótulo em português");
  let lancou = false;
  try {
    janelaDoMesBrasilia("2026-00");
  } catch {
    lancou = true;
  }
  ok(lancou, "janela de competência inválida lança (quem chama valida antes)");
}

console.log("\n— Quem entra no relatório do mês —");
{
  ok(iso(primeiroDiaDoMesCalendario("2026-11")) === "2026-11-01T00:00:00.000Z", "1º dia do mês é data de calendário (meia-noite UTC)");
  ok(entraNoRelatorioDoMes({ ativo: true, dataDesligamento: null }, "2026-11"), "ativo entra");
  ok(entraNoRelatorioDoMes({ ativo: false, dataDesligamento: dataUTC(2026, 11, 15) }, "2026-11"), "desligado em 15/11 entra em novembro");
  ok(entraNoRelatorioDoMes({ ativo: false, dataDesligamento: dataUTC(2026, 11, 1) }, "2026-11"), "desligado em 01/11 entra em novembro");
  ok(!entraNoRelatorioDoMes({ ativo: false, dataDesligamento: dataUTC(2026, 10, 31) }, "2026-11"), "desligado em 31/10 NÃO entra em novembro");
  ok(entraNoRelatorioDoMes({ ativo: false, dataDesligamento: dataUTC(2026, 12, 5) }, "2026-11"), "desligado em dezembro entra no relatório de novembro");
  ok(!entraNoRelatorioDoMes({ ativo: false, dataDesligamento: null }, "2026-11"), "inativo sem data de desligamento não entra");
}

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
if (falhas > 0) process.exit(1);
