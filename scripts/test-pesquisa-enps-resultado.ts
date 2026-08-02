// Testes do resultado de eNPS (fase 6, lib/pesquisa-enps-resultado.ts).
// Não toca o banco.
//   npx tsx scripts/test-pesquisa-enps-resultado.ts
import { calcularResultadoEnps } from "@/lib/pesquisa-enps-resultado";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

console.log("calcularResultadoEnps\n");

ok(calcularResultadoEnps([]) === null, "sem respostas válidas: null");
ok(calcularResultadoEnps([{ valorNumerico: null }]) === null, "só valores nulos: null");

// 10 promotores (9-10), 0 neutros, 0 detratores -> score 100 -> Excelência.
{
  const r = calcularResultadoEnps(Array.from({ length: 10 }, () => ({ valorNumerico: 10 })));
  ok(r?.score === 100, `score 100 com só promotores (achou ${r?.score})`);
  ok(r?.zona?.rotulo === "Excelência", `zona Excelência (achou ${r?.zona?.rotulo})`);
}

// 5 promotores, 5 detratores -> score 0 -> Aperfeiçoamento (zona [0,30]).
{
  const respostas = [
    ...Array.from({ length: 5 }, () => ({ valorNumerico: 9 })),
    ...Array.from({ length: 5 }, () => ({ valorNumerico: 3 })),
  ];
  const r = calcularResultadoEnps(respostas);
  ok(r?.score === 0, `score 0 com metade promotor/metade detrator (achou ${r?.score})`);
  ok(r?.zona?.rotulo === "Aperfeiçoamento", `zona Aperfeiçoamento (achou ${r?.zona?.rotulo})`);
}

// Todos detratores (0-6) -> score -100 -> Crítico.
{
  const r = calcularResultadoEnps(Array.from({ length: 4 }, () => ({ valorNumerico: 2 })));
  ok(r?.score === -100, `score -100 com só detratores (achou ${r?.score})`);
  ok(r?.zona?.rotulo === "Crítico", `zona Crítico (achou ${r?.zona?.rotulo})`);
}

// Neutros (7-8) não contam a favor nem contra.
{
  const r = calcularResultadoEnps(Array.from({ length: 4 }, () => ({ valorNumerico: 7 })));
  ok(r?.neutros === 4 && r?.score === 0, `só neutros: score 0, todos contados como neutro (achou score=${r?.score}, neutros=${r?.neutros})`);
}

console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
