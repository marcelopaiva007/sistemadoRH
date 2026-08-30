// A prova do digest (spec §6.1/§9.1) — lib/delegacoes/digest.ts, puro: quais
// periodicidades entram em qual rodada (manhã/tarde), sem banco nem e-mail.
//
//   npx tsx scripts/test-delegacoes-digest.ts

import { demandaEntraNoDigest, diaSemanaIso } from "../lib/delegacoes/digest";

let falhas = 0;
function ok(condicao: boolean, descricao: string) {
  console.log(`${condicao ? "✅" : "❌"} ${descricao}`);
  if (!condicao) falhas++;
}
function igual<T>(recebido: T, esperado: T, descricao: string) {
  const passou = recebido === esperado;
  console.log(`${passou ? "✅" : "❌"} ${descricao}`);
  if (!passou) {
    console.log(`     esperado: ${esperado}, recebido: ${recebido}`);
    falhas++;
  }
}

console.log("\ndiaSemanaIso — 1=segunda .. 7=domingo\n");
{
  igual(diaSemanaIso("2026-08-31"), 1, "31/08/2026 é segunda-feira");
  igual(diaSemanaIso("2026-09-03"), 4, "03/09/2026 é quinta-feira");
  igual(diaSemanaIso("2026-09-06"), 7, "06/09/2026 é domingo — vira 7, não 0");
}

const SEGUNDA = "2026-08-31"; // 1
const TERCA = "2026-09-01"; // 2
const QUINTA = "2026-09-03"; // 4
const SABADO = "2026-09-05"; // 6

function entra(periodicidade: string, diasParaPrazo: number, periodo: "MANHA" | "TARDE", dia: string) {
  return demandaEntraNoDigest({
    periodicidadeRetorno: periodicidade,
    diasParaPrazo,
    periodo,
    diaSemanaIso: diaSemanaIso(dia),
  });
}

console.log("\nSO_ENTREGA — nunca entra no digest periódico\n");
{
  ok(!entra("SO_ENTREGA", -5, "MANHA", SEGUNDA), "atrasada, manhã de segunda: ainda assim não entra");
  ok(!entra("SO_ENTREGA", 3, "TARDE", QUINTA), "no prazo, tarde: não entra");
}

console.log("\nSO_ATRASO — só quando está atrasada, nas duas rodadas do dia\n");
{
  ok(!entra("SO_ATRASO", 3, "MANHA", SEGUNDA), "no prazo (3 dias), manhã: não entra");
  ok(entra("SO_ATRASO", -1, "MANHA", SEGUNDA), "atrasada, manhã: entra");
  ok(entra("SO_ATRASO", -1, "TARDE", TERCA), "atrasada, tarde de terça: entra também — o pulso é 2x/dia");
  ok(!entra("SO_ATRASO", 0, "MANHA", SEGUNDA), "vence hoje (0 dias, ainda não atrasada): não entra");
}

console.log("\nDIARIO — só na rodada da manhã, todo dia\n");
{
  ok(entra("DIARIO", 5, "MANHA", SEGUNDA), "manhã de segunda: entra");
  ok(entra("DIARIO", 5, "MANHA", SABADO), "manhã de sábado também — é diário, não dia útil");
  ok(!entra("DIARIO", 5, "TARDE", SEGUNDA), "tarde: NÃO entra — senão apareceria 2x no mesmo dia, deixando de ser 'diário' e virando 'duas vezes ao dia'");
}

console.log("\nSEMANAL — só segunda de manhã\n");
{
  ok(entra("SEMANAL", 10, "MANHA", SEGUNDA), "manhã de segunda: entra");
  ok(!entra("SEMANAL", 10, "MANHA", TERCA), "manhã de terça: não entra");
  ok(!entra("SEMANAL", 10, "TARDE", SEGUNDA), "tarde de segunda: não entra — a rodada é a da manhã");
}

console.log("\nDUAS_POR_SEMANA — segunda e quinta de manhã\n");
{
  ok(entra("DUAS_POR_SEMANA", 10, "MANHA", SEGUNDA), "manhã de segunda: entra");
  ok(entra("DUAS_POR_SEMANA", 10, "MANHA", QUINTA), "manhã de quinta: entra");
  ok(!entra("DUAS_POR_SEMANA", 10, "MANHA", TERCA), "manhã de terça: não entra");
  ok(!entra("DUAS_POR_SEMANA", 10, "TARDE", QUINTA), "tarde de quinta: não entra");
}

console.log("\nValor desconhecido — fail closed, não entra por padrão\n");
{
  ok(!entra("MENSAL", 5, "MANHA", SEGUNDA), "periodicidade fora do domínio nunca entra — nunca manda o que não sabe classificar");
}

console.log(falhas === 0 ? "\n✅ Tudo passou.\n" : `\n❌ ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
