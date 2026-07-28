// Confirma se uma migration REALMENTE rodou no banco de produção — de um
// jeito verificável, não "acho que rodou". Nasceu do susto de 28/07/2026: o
// código da migration de multi-empresa foi publicado achando que ela tinha
// sido aplicada, e não tinha — login parou de funcionar para todo mundo até o
// revert. scripts/aplicar-migracao.ts pede para rodar
// `prisma migrate resolve --applied <nome>` depois de aplicar; é essa
// gravação na tabela _prisma_migrations que este script confere.
//
//   DATABASE_URL="..." npx tsx scripts/verificar-migracao.ts <nome-da-migration>
//
// Sem nome: lista as migrations do diretório e diz o status de cada uma —
// aplicada, pendente, ou "no banco mas não no código" (sinal de banco à
// frente do que está commitado, raro mas vale saber).
import "dotenv/config";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const nomeAlvo = process.argv[2];

async function main() {
  const dirMigrations = join(process.cwd(), "prisma", "migrations");
  const noCodigo = readdirSync(dirMigrations, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ migration_name: string; finished_at: Date | null }>(
      `SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY migration_name`,
    );
    const aplicadas = new Map(rows.map((r) => [r.migration_name, r.finished_at !== null]));

    if (nomeAlvo) {
      const noBanco = aplicadas.get(nomeAlvo);
      if (noBanco === true) {
        console.log(`✔ "${nomeAlvo}" está aplicada no banco (${process.env.DATABASE_URL?.match(/@([^/]+)/)?.[1] ?? "?"}).`);
      } else if (noBanco === false) {
        console.log(`✖ "${nomeAlvo}" está registrada, mas SEM finished_at — aplicação incompleta ou com erro.`);
        process.exit(1);
      } else {
        console.log(`✖ "${nomeAlvo}" NÃO está aplicada neste banco. Não publique código que dependa dela.`);
        process.exit(1);
      }
      return;
    }

    console.log(`Banco: ${process.env.DATABASE_URL?.match(/@([^/]+)/)?.[1] ?? "?"}\n`);
    for (const nome of noCodigo) {
      const status = aplicadas.has(nome)
        ? aplicadas.get(nome)
          ? "✔ aplicada"
          : "✖ incompleta"
        : "· pendente";
      console.log(`${status}  ${nome}`);
    }
    const soNoBanco = [...aplicadas.keys()].filter((n) => !noCodigo.includes(n));
    if (soNoBanco.length > 0) {
      console.log("\nNo banco mas não no código local (git pull talvez esteja atrasado):");
      soNoBanco.forEach((n) => console.log(`  ${n}`));
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
