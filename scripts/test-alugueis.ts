// A geração de parcelas de aluguel e o resumo — datas são onde isto erra calado.
//   npx tsx scripts/test-alugueis.ts
import {
  competenciasDoContrato,
  vencimentoDaCompetencia,
  rotuloCompetencia,
  resumoRecebimentos,
} from "../lib/processos/alugueis";
import { dataUTC } from "../lib/datas";

let falhas = 0;
function ok(c: boolean, d: string) { console.log(`${c ? "✅" : "❌"} ${d}`); if (!c) falhas++; }
function igual<T>(r: T, e: T, d: string) {
  const p = JSON.stringify(r) === JSON.stringify(e);
  console.log(`${p ? "✅" : "❌"} ${d}`);
  if (!p) { console.log("   esperado:", JSON.stringify(e)); console.log("   recebido:", JSON.stringify(r)); falhas++; }
}

console.log("\nCompetências de um contrato\n");
{
  // Locação de 10/03/2026 a 10/06/2026: gera mar, abr, mai, jun (a régua é
  // mensal, não quebra por começar dia 10).
  const cs = competenciasDoContrato(dataUTC(2026, 3, 10), dataUTC(2026, 6, 10), dataUTC(2030, 1, 1));
  igual(cs.map(rotuloCompetencia), ["mar/2026", "abr/2026", "mai/2026", "jun/2026"], "início dia 10 gera o mês inteiro");

  // Indeterminado: para no horizonte, não no infinito.
  const ind = competenciasDoContrato(dataUTC(2026, 1, 1), null, dataUTC(2026, 3, 15));
  igual(ind.map(rotuloCompetencia), ["jan/2026", "fev/2026", "mar/2026"], "sem fim, para no horizonte");

  // Um mês só.
  const um = competenciasDoContrato(dataUTC(2026, 5, 1), dataUTC(2026, 5, 20), dataUTC(2030, 1, 1));
  igual(um.length, 1, "contrato dentro de um mês gera uma parcela");

  // Contrato COM fim gera o termo inteiro, mesmo além do horizonte — locação
  // de 5 anos = 60 parcelas, não 12 (era o furo que a revisão pegou).
  const cinco = competenciasDoContrato(dataUTC(2026, 1, 1), dataUTC(2030, 12, 1), dataUTC(2026, 12, 1));
  igual(cinco.length, 60, "contrato de 5 anos gera 60 parcelas, o horizonte não corta o que tem fim");
}

console.log("\nVencimento da competência\n");
{
  igual(vencimentoDaCompetencia(dataUTC(2026, 3, 1), 5).getUTCDate(), 5, "dia 5 de março");
  // Dia 31 em fevereiro cai no último dia (28), nunca vira 3 de março.
  const v = vencimentoDaCompetencia(dataUTC(2026, 2, 1), 31);
  ok(v.getUTCMonth() === 1 && v.getUTCDate() === 28, "dia 31 em fevereiro vira 28, não escorrega para março");
  igual(vencimentoDaCompetencia(dataUTC(2024, 2, 1), 31).getUTCDate(), 29, "fevereiro bissexto vira 29");
}

console.log("\nResumo — a receber, recebido, em atraso\n");
{
  const hoje = dataUTC(2026, 5, 15);
  const parcelas = [
    { vencimento: dataUTC(2026, 3, 5), recebidoEm: dataUTC(2026, 3, 4), valorPrevisto: 1000, valorRecebido: 1000 },
    { vencimento: dataUTC(2026, 4, 5), recebidoEm: null, valorPrevisto: 1000, valorRecebido: null }, // venceu, em atraso
    { vencimento: dataUTC(2026, 5, 5), recebidoEm: null, valorPrevisto: 1000, valorRecebido: null }, // venceu, em atraso
    { vencimento: dataUTC(2026, 6, 5), recebidoEm: null, valorPrevisto: 1000, valorRecebido: null }, // a vencer
  ];
  const r = resumoRecebimentos(parcelas, hoje);
  igual(r.recebido, 1000, "recebido soma só o que entrou");
  igual(r.aReceber, 3000, "a receber soma tudo que está em aberto");
  igual(r.emAtraso, 2000, "em atraso soma só o que venceu sem receber");
  igual(r.qtdEmAtraso, 2, "duas parcelas em atraso");
  igual(r.qtdEmAberto, 3, "três em aberto no total");
}

console.log(`\n${falhas === 0 ? "✅ tudo certo" : `❌ ${falhas} falha(s)`}\n`);
process.exit(falhas === 0 ? 0 : 1);
