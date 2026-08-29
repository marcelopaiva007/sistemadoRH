// A prova da régua de cobrança (lib/delegacoes/regua.ts) — motor puro, sem
// banco: os percentuais da spec §6.2, a véspera da criticidade 1, o D+0..D+3
// depois do prazo, e o contrato que o cron usa (proximoDegrau/proximaCobranca).
//
//   npx tsx scripts/test-delegacoes-regua.ts

import { montarRegua, proximoDegrau, proximaCobranca } from "../lib/delegacoes/regua";

let falhas = 0;
function ok(condicao: boolean, descricao: string) {
  console.log(`${condicao ? "✅" : "❌"} ${descricao}`);
  if (!condicao) falhas++;
}
function igual<T>(recebido: T, esperado: T, descricao: string) {
  const passou = JSON.stringify(recebido) === JSON.stringify(esperado);
  console.log(`${passou ? "✅" : "❌"} ${descricao}`);
  if (!passou) {
    console.log(`     esperado: ${JSON.stringify(esperado)}`);
    console.log(`     recebido: ${JSON.stringify(recebido)}`);
    falhas++;
  }
}

const ENVIO = new Date("2026-09-01T00:00:00-03:00");
// 10 dias de janela — véspera (prazo-24h) fica em 90% (dia 9), longe do 90%
// dos 10 dias (dia 9 também) então o teste abaixo cobre a COLISÃO de
// propósito; um segundo caso com janela maior cobre a NÃO colisão.
const PRAZO_10D = new Date("2026-09-11T00:00:00-03:00");

console.log("\nSem envio, sem régua\n");
{
  igual(montarRegua({ criticidade: 1, enviadaEm: null, prazo: PRAZO_10D }), [], "RASCUNHO (sem enviadaEm) não tem degrau nenhum");
}

console.log("\nCriticidade 1 (crítica) — 40/70/90/véspera + D+0..D+3\n");
{
  const r = montarRegua({ criticidade: 1, enviadaEm: ENVIO, prazo: PRAZO_10D });
  const chaves = r.map((d) => d.chave);
  // Janela de 10 dias: véspera cai no dia 9 (=90% de 10 dias) — colide com o
  // degrau dos 90%, que fica sozinho representando os dois.
  igual(chaves, ["antes-40", "antes-70", "antes-90", "d0", "d1", "d2", "d3"], "véspera some por colisão com os 90% numa janela de 10 dias");
  ok(
    r.every((d, i) => i === 0 || d.momento.getTime() >= r[i - 1].momento.getTime()),
    "a lista sai em ordem cronológica",
  );

  const dia = 24 * 3_600_000;
  igual(r[0].momento.getTime(), ENVIO.getTime() + 4 * dia, "40% de 10 dias = dia 4");
  igual(r[1].momento.getTime(), ENVIO.getTime() + 7 * dia, "70% de 10 dias = dia 7");
  igual(r[2].momento.getTime(), ENVIO.getTime() + 9 * dia, "90% de 10 dias = dia 9");

  const d0 = r.find((d) => d.chave === "d0")!;
  const d1 = r.find((d) => d.chave === "d1")!;
  const d3 = r.find((d) => d.chave === "d3")!;
  igual(d0.momento.getTime(), PRAZO_10D.getTime() + 3_600_000, "D+0 é o prazo + 1h de folga");
  igual(d1.momento.getTime(), PRAZO_10D.getTime() + 25 * 3_600_000, "D+1 é prazo + 25h");
  igual(d3.momento.getTime(), PRAZO_10D.getTime() + 73 * 3_600_000, "D+3 é prazo + 73h");

  ok(r.every((d) => d.antesDoPrazo === d.chave.startsWith("antes") || d.chave === "vespera"), "antesDoPrazo bate com o tipo do degrau");
  ok(d0.canais.includes("TELEGRAM") && d0.canais.includes("EMAIL"), "D+0 crítica: Telegram + e-mail (spec §6.2)");
  ok(!d0.ccDirecao && !d0.notificaDirecao, "D+0 ainda não envolve a Direção");
  ok(d1.ccDirecao && !d1.notificaDirecao, "D+1 crítica: cópia à Direção, ainda não notificação direta");
  const d2 = r.find((d) => d.chave === "d2")!;
  ok(d2.notificaDirecao && d2.painelVermelho, "D+2 crítica: notifica a Direção e liga o painel vermelho");
  ok(d3.notificaDirecao && d3.painelVermelho, "D+3 crítica: segue notificando (pauta de reunião)");
}

console.log("\nVéspera SEM colisão — janela grande o bastante para separar dos 90%\n");
{
  const prazo60d = new Date(ENVIO.getTime() + 60 * 24 * 3_600_000);
  const r = montarRegua({ criticidade: 1, enviadaEm: ENVIO, prazo: prazo60d });
  const chaves = r.map((d) => d.chave);
  igual(chaves, ["antes-40", "antes-70", "antes-90", "vespera", "d0", "d1", "d2", "d3"], "com folga, véspera aparece como degrau próprio");
  const vespera = r.find((d) => d.chave === "vespera")!;
  igual(vespera.momento.getTime(), prazo60d.getTime() - 24 * 3_600_000, "véspera é exatamente prazo - 24h");
}

console.log("\nCriticidade 2 (alta) — 60/90 + D+0..D+3\n");
{
  const r = montarRegua({ criticidade: 2, enviadaEm: ENVIO, prazo: PRAZO_10D });
  igual(r.map((d) => d.chave), ["antes-60", "antes-90", "d0", "d1", "d2", "d3"], "sem véspera — só criticidade 1 tem");
  const d0 = r.find((d) => d.chave === "d0")!;
  const d2 = r.find((d) => d.chave === "d2")!;
  const d3 = r.find((d) => d.chave === "d3")!;
  igual([...d0.canais], ["TELEGRAM"], "D+0 alta: só Telegram");
  igual([...d2.canais], ["EMAIL"], "D+2 alta: e-mail formal (spec)");
  ok(d3.painelVermelho, "D+3 alta: painel vermelho");
  ok(!r.some((d) => d.notificaDirecao || d.ccDirecao), "alta nunca envolve a Direção — só crítica envolve");
}

console.log("\nCriticidade 3 (normal) — 75% + D+0..D+3\n");
{
  const r = montarRegua({ criticidade: 3, enviadaEm: ENVIO, prazo: PRAZO_10D });
  igual(r.map((d) => d.chave), ["antes-75", "d0", "d1", "d2", "d3"], "só um toque antes do prazo");
  const d3 = r.find((d) => d.chave === "d3")!;
  igual([...d3.canais], ["EMAIL"], "D+3 normal: e-mail formal");
  ok(d3.painelVermelho, "D+3 normal também liga o painel vermelho");
}

console.log("\nPrazo já vencido no envio — sem janela para lembrete gradual\n");
{
  const prazoPassado = new Date(ENVIO.getTime() - 3_600_000);
  const r = montarRegua({ criticidade: 1, enviadaEm: ENVIO, prazo: prazoPassado });
  ok(r.every((d) => !d.antesDoPrazo), "nenhum degrau 'antes' quando o prazo já passou no envio — vai direto para D+0..D+3");
  igual(r.length, 4, "só os 4 degraus de atraso sobram");
}

console.log("\nproximoDegrau — o contrato do cron\n");
{
  const demanda = { criticidade: 3, enviadaEm: ENVIO, prazo: PRAZO_10D, nivelEscalonamento: 0 };
  const regua = montarRegua(demanda);

  const antesDaHora = new Date(regua[0].momento.getTime() - 1000);
  igual(proximoDegrau(demanda, antesDaHora), null, "1ms antes do momento, ainda não dispara");

  const naHora = regua[0].momento;
  igual(proximoDegrau(demanda, naHora)?.chave, "antes-75", "no momento exato, dispara");

  const depoisDaHora = new Date(regua[0].momento.getTime() + 999_999_999);
  igual(proximoDegrau(demanda, depoisDaHora)?.chave, "antes-75", "muito depois, ainda dispara o MESMO degrau — não pula para o mais recente");

  const noNivelUm = { ...demanda, nivelEscalonamento: 1 };
  igual(proximoDegrau(noNivelUm, depoisDaHora)?.chave, "d0", "no nível 1, o próximo é d0 — não repete o antes-75");

  const esgotada = { ...demanda, nivelEscalonamento: regua.length };
  igual(proximoDegrau(esgotada, new Date("2099-01-01")), null, "régua esgotada (nível = tamanho da lista) nunca dispara de novo");
}

console.log("\nproximaCobranca — o que o cron grava em Demanda.proximaCobranca\n");
{
  const demanda = { criticidade: 2, enviadaEm: ENVIO, prazo: PRAZO_10D, nivelEscalonamento: 0 };
  const regua = montarRegua(demanda);
  igual(proximaCobranca(demanda)?.getTime(), regua[0].momento.getTime(), "nível 0 aponta pro primeiro degrau");
  igual(
    proximaCobranca({ ...demanda, nivelEscalonamento: regua.length - 1 })?.getTime(),
    regua[regua.length - 1].momento.getTime(),
    "último degrau ainda aponta pra ele mesmo — dispara quando chegar a hora",
  );
  igual(proximaCobranca({ ...demanda, nivelEscalonamento: regua.length }), null, "régua esgotada: null, o cron para de olhar essa demanda");
}

console.log(falhas === 0 ? "\n✅ Tudo passou.\n" : `\n❌ ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
