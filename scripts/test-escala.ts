// Testes de lib/escala.ts (cálculo da semana). Não toca o banco.
//   npx tsx scripts/test-escala.ts
import { diasDaSemana, inicioDaSemanaUTC } from "@/lib/escala";
import { dataUTC } from "@/lib/datas";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

console.log("inicioDaSemanaUTC");
// 25/07/2026 é um sábado.
ok(
  inicioDaSemanaUTC(dataUTC(2026, 7, 25)).getTime() === dataUTC(2026, 7, 20).getTime(),
  "sábado 25/07 -> segunda 20/07",
);
// 20/07/2026 é segunda-feira — deve retornar ela mesma.
ok(
  inicioDaSemanaUTC(dataUTC(2026, 7, 20)).getTime() === dataUTC(2026, 7, 20).getTime(),
  "segunda-feira aponta para si mesma",
);
// 26/07/2026 é domingo — deve voltar para a MESMA semana (20/07), não avançar.
ok(
  inicioDaSemanaUTC(dataUTC(2026, 7, 26)).getTime() === dataUTC(2026, 7, 20).getTime(),
  "domingo 26/07 -> segunda 20/07 (mesma semana, não a seguinte)",
);

console.log("diasDaSemana");
const semana = diasDaSemana(dataUTC(2026, 7, 20));
ok(semana.length === 7, "7 dias na semana");
ok(semana[0].getTime() === dataUTC(2026, 7, 20).getTime(), "primeiro dia é a segunda-feira");
ok(semana[6].getTime() === dataUTC(2026, 7, 26).getTime(), "último dia é o domingo");
ok(semana.every((d) => d.getUTCHours() === 0), "todos os dias são meia-noite UTC, sem hora");

console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
