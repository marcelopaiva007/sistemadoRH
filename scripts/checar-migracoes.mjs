#!/usr/bin/env node
/**
 * Falha o build quando o repo tem migration que o banco ainda não recebeu.
 *
 *   npm run check:migracoes
 *
 * Em 30/07/2026 o deploy subiu com o pivô UserEmpresa no código e sem a tabela
 * no banco: as telas do módulo responderam 404 e tabela vazia. O build passava
 * porque `next build` não conversa com o banco. Este script conversa.
 *
 * Ele NÃO aplica nada — aplicar é `scripts/aplicar-migracao.ts`, à mão. Aqui só
 * barramos o deploy de código que o banco ainda não sustenta. `prisma migrate
 * deploy` continua fora de cogitação: o Neon é dividido com os outros apps do
 * grupo e `_prisma_migrations` é comum (ver aplicar-migracao.ts).
 *
 * JavaScript puro, como release.mjs, e não .ts: roda no build da Vercel, onde
 * `tsx` é devDependency e pode não estar instalada. Um checador que derruba o
 * deploy por causa da própria ferramenta não checa nada.
 */
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

// Local o segredo está no .env; na Vercel já vem no process.env. dotenv é
// devDependency — ausente, seguimos com o que o ambiente tiver.
if (!process.env.DATABASE_URL) {
  try {
    await import("dotenv/config");
  } catch {
    /* sem dotenv: process.env é o que temos */
  }
}

// Sem banco no ambiente (preview, CI sem segredo) não dá pra comparar. Avisar e
// deixar passar é melhor que quebrar um build por falta de credencial — o
// deploy de produção tem DATABASE_URL.
if (!process.env.DATABASE_URL) {
  console.warn("· checar-migracoes: sem DATABASE_URL, checagem pulada.");
  process.exit(0);
}

const noRepo = readdirSync(resolve("prisma", "migrations"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

let pendentes;
try {
  const { rows } = await client.query(
    `SELECT migration_name FROM public."_prisma_migrations" WHERE finished_at IS NOT NULL`,
  );
  const aplicadas = new Set(rows.map((r) => r.migration_name));
  pendentes = noRepo.filter((m) => !aplicadas.has(m));
} finally {
  await client.end();
}

if (pendentes.length === 0) {
  console.log(`· checar-migracoes: banco em dia (${noRepo.length} migrations).`);
  process.exit(0);
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
