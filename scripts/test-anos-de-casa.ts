// A conta de anos de casa do Reconhecimento (lib/reconhecimento/anos-de-casa.ts),
// sem banco e sem mandar mensagem nenhuma.
//
// O defeito que motivou (auditoria de 26/11/2026): admitido em 28/11/2016,
// olhando em 25/11/2026, a tela dizia "9 anos" e não marcava o 10º como marco
// redondo — contava os anos de HOJE, e a linha é do aniversário que VEM.
//
//   npx tsx scripts/test-anos-de-casa.ts

import { dataUTC } from "../lib/datas";
import { hojeBrasiliaUTC, marcoDoAno } from "../lib/reconhecimento/anos-de-casa";

let falhas = 0;
function igual<T>(recebido: T, esperado: T, descricao: string) {
  const passou = JSON.stringify(recebido) === JSON.stringify(esperado);
  console.log(`${passou ? "✅" : "❌"} ${descricao}`);
  if (!passou) {
    console.log(`     esperado: ${JSON.stringify(esperado)}`);
    console.log(`     recebido: ${JSON.stringify(recebido)}`);
    falhas++;
  }
}

console.log("\nO caso da auditoria: admitido em 28/11/2016\n");
{
  const admissao = dataUTC(2016, 11, 28);
  const antes = marcoDoAno(admissao, dataUTC(2026, 11, 25));
  igual(antes.anosHoje, 9, "em 25/11/2026 tem 9 anos completos de casa");
  igual(antes.anos, 10, "…mas o aniversário deste mês é o do 10º ano");
  igual(antes.redondo, true, "…e o 10º é marco redondo");
  igual(antes.diasAte, 3, "…daqui a 3 dias");

  const noDia = marcoDoAno(admissao, dataUTC(2026, 11, 28));
  igual([noDia.anosHoje, noDia.anos, noDia.diasAte], [10, 10, 0], "no dia 28: 10 completos, 10 no marco, 0 dias");

  const depois = marcoDoAno(admissao, dataUTC(2026, 11, 30));
  igual([depois.anosHoje, depois.anos, depois.diasAte], [10, 10, -2], "dois dias depois: já passou (-2)");
}

console.log("\nMarco redondo é o dos anos AO CHEGAR\n");
{
  igual(marcoDoAno(dataUTC(2021, 12, 10), dataUTC(2026, 12, 1)).redondo, true, "5º ano em dezembro, visto no dia 1: redondo");
  igual(marcoDoAno(dataUTC(2022, 12, 10), dataUTC(2026, 12, 1)).redondo, false, "4º ano não é redondo");
  igual(marcoDoAno(dataUTC(2025, 12, 10), dataUTC(2026, 12, 1)).anos, 1, "o 1º ano conta antes do dia");
  igual(marcoDoAno(dataUTC(2025, 12, 10), dataUTC(2026, 12, 1)).anosHoje, 0, "…com 0 anos completos hoje");
  igual(marcoDoAno(dataUTC(2026, 3, 2), dataUTC(2026, 11, 25)).anos, 0, "admitido este ano: 0 (a tela filtra)");
}

console.log("\n29/02 em ano comum\n");
{
  const m = marcoDoAno(dataUTC(2016, 2, 29), dataUTC(2026, 2, 20));
  igual(m.data.toISOString().slice(0, 10), "2026-02-28", "o aniversário cai em 28/02");
  igual([m.anos, m.anosHoje, m.diasAte], [10, 9, 8], "10º ano, 9 completos, 8 dias até");
}

console.log("\nHoje é o dia de Brasília, não o dia UTC\n");
{
  // 23h de 27/11 em Brasília = 02h de 28/11 em UTC. Para quem foi admitido
  // em 28/11, ainda NÃO é o dia — com o dia UTC, a conta virava três horas antes.
  const agora = new Date("2026-11-27T23:00:00-03:00");
  igual(hojeBrasiliaUTC(agora).toISOString().slice(0, 10), "2026-11-27", "23h de Brasília ainda é dia 27");
  igual(marcoDoAno(dataUTC(2016, 11, 28), hojeBrasiliaUTC(agora)).anosHoje, 9, "ainda 9 anos completos às 23h");
  igual(
    hojeBrasiliaUTC(new Date("2026-11-28T00:30:00-03:00")).toISOString().slice(0, 10),
    "2026-11-28",
    "meia-noite e meia de Brasília já é dia 28",
  );
}

console.log(falhas === 0 ? "\n✅ Tudo passou.\n" : `\n❌ ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
