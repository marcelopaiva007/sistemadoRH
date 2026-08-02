// Aplica um arquivo de migration à mão, dentro de uma transação.
//
//   npx tsx scripts/aplicar-migracao.ts 20260724230000_fase1_departamento_pessoal [--dry]
//
// Desde 01/08/2026 o banco (SOFTrh) é dedicado a este app e `prisma migrate
// deploy` funciona normalmente — use este script só para o caso raro de um
// `migration.sql` que precise rodar fora do fluxo padrão do Prisma (ver
// README, "Notas sobre o banco", e o cabeçalho de
// 20260721120000_sync_funcionario_contato_e_elleven_relatorio, aplicada assim
// quando o banco ainda era compartilhado).
//
// Depois de aplicar, registre a migration para o Prisma não tentar de novo:
//   npx prisma migrate resolve --applied <nome-da-migration>
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const nome = process.argv[2];
const dry = process.argv.includes("--dry");

if (!nome) {
  console.error("Uso: npx tsx scripts/aplicar-migracao.ts <nome-da-migration> [--dry]");
  process.exit(1);
}

const caminho = join(process.cwd(), "prisma", "migrations", nome, "migration.sql");
const sql = readFileSync(caminho, "utf8");

async function main() {
  console.log(`Migration: ${nome}`);
  console.log(`Arquivo:   ${caminho} (${sql.length} bytes)`);

  if (dry) {
    console.log("\n--dry: nada foi executado. SQL que seria aplicado:\n");
    console.log(sql);
    return;
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("\n✔ Aplicada com sucesso (transação commitada).");
    console.log(`Agora registre no Prisma: npx prisma migrate resolve --applied ${nome}`);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("\n✖ Falhou — nada foi aplicado (rollback).");
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
