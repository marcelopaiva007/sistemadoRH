// Testes de lib/datas.ts (anosCompletos) usados pelo reconhecimento. Não toca
// o banco e não manda mensagem nenhuma.
//   npx tsx scripts/test-reconhecimento.ts
import { anosCompletos } from "@/lib/datas";
import { dataUTC } from "@/lib/datas";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

console.log("anosCompletos");
ok(anosCompletos(dataUTC(2023, 3, 10), dataUTC(2026, 7, 25)) === 3, "3 anos completos após o aniversário no ano");
ok(anosCompletos(dataUTC(2023, 8, 10), dataUTC(2026, 7, 25)) === 2, "ainda não fez aniversário este ano -> 2 anos");
ok(anosCompletos(dataUTC(2026, 7, 25), dataUTC(2026, 7, 25)) === 0, "no dia exato do marco, 0 anos completos (é o dia do 0)");
ok(anosCompletos(dataUTC(2025, 7, 25), dataUTC(2026, 7, 25)) === 1, "exatamente 1 ano depois");
ok(anosCompletos(dataUTC(2024, 2, 29), dataUTC(2026, 3, 1)) === 2, "admissão em ano bissexto conta certo em ano normal");

console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
