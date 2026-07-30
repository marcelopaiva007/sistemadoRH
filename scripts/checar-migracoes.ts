// Falha o build quando o repo tem migration que o banco ainda não recebeu.
//
//   npx tsx scripts/checar-migracoes.ts
//
// Em 30/07/2026 o deploy subiu com o pivô UserEmpresa no código e sem a tabela
// no banco: as telas do módulo responderam 404 e tabela vazia. O build passava
// porque `next build` não conversa com o banco. Este script conversa.
//
// Ele NÃO aplica nada — aplicar é `scripts/aplicar-migracao.ts`, à mão. Aqui só
// barramos o deploy de código que o banco ainda não sustenta. `prisma migrate
// deploy` continua fora de cogitação: o Neon é dividido com outros apps do
// grupo e `_prisma_migrations` é comum (ver aplicar-migracao.ts).
import "dotenv/config";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

async function main() {
  // Sem banco no ambiente (build de preview, CI sem segredo) não dá pra
  // comparar. Avisar e deixar passar é melhor que quebrar um build por falta
  // de credencial — o deploy de produção tem DATABASE_URL.
  if (!process.env.DATABASE_URL) {
    console.warn("· checar-migracoes: sem DATABASE_URL, checagem pulada.");
    return;
  }

  const dir = join(process.cwd(), "prisma", "migrations");
  const noRepo = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ migration_name: string }>(
      `SELECT migration_name FROM public."_prisma_migrations" WHERE finished_at IS NOT NULL`,
    );
    const aplicadas = new Set(rows.map((r) => r.migration_name));
    const pendentes = noRepo.filter((m) => !aplicadas.has(m));

    if (pendentes.length === 0) {
      console.log(`· checar-migracoes: banco em dia (${noRepo.length} migrations).`);
      return;
    }

    console.error(
      `\n✖ ${pendentes.length} migration(s) no repo que o banco ainda não recebeu:\n` +
        pendentes.map((m) => `    ${m}`).join("\n") +
        `\n\n  Aplique cada uma e registre, antes de subir:\n` +
        pendentes
          .map(
            (m) =>
              `    npx tsx scripts/aplicar-migracao.ts ${m}\n` +
              `    npx prisma migrate resolve --applied ${m}`,
          )
          .join("\n") +
        `\n`,
    );
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
