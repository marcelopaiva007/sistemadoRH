// Gatilho manual da importação automática do elleven (mesma rotina do cron).
// Uso: DATABASE_URL=... npx tsx scripts/run-import-elleven.ts [AAAA-MM]
// Sem argumento, importa o mês corrente (fuso America/Sao_Paulo).
import { importarLancamentosEllevenAuto } from "@/lib/importar-elleven-auto";
import { periodoAtual } from "@/lib/periodo";

async function main() {
  const periodo = process.argv[2] ?? periodoAtual();
  if (!/^\d{4}-\d{2}$/.test(periodo)) {
    throw new Error(`Período inválido: "${periodo}" (esperado AAAA-MM)`);
  }
  console.log(`Importando lançamentos do elleven para ${periodo}...`);
  const resultado = await importarLancamentosEllevenAuto(periodo);
  console.log(JSON.stringify(resultado, null, 2));
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
