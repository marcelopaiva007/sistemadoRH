#!/usr/bin/env node
/**
 * Falha o build quando o repo tem migration que o banco ainda não recebeu.
 *
 *   npm run check:migracoes
 *
 * Em 30/07/2026 o deploy subiu com o pivô UserEmpresa no código e sem a tabela
 * no banco: as telas do módulo responderam 404 e tabela vazia, e passou-se o dia
 * achando que o banco tinha zerado. O build passava porque `next build` não
 * conversa com o banco. Este script conversa.
 *
 * Ele NÃO aplica nada — aplicar é `scripts/aplicar-migracao.ts`, à mão. Aqui só
 * barramos o deploy de código que o banco ainda não sustenta. `prisma migrate
 * deploy` continua fora de cogitação: o Neon é dividido com os outros apps do
 * grupo e `_prisma_migrations` é comum (ver aplicar-migracao.ts).
 *
 * POR QUE NÃO MORA EM `scripts/`: o `.vercelignore` exclui `scripts` inteiro,
 * então um checador ali não chega ao build — `Cannot find module`, três deploys
 * seguidos, até a checagem ser desligada. Aqui ele viaja junto de
 * `prisma/migrations/`, que é justamente o que ele lê: se um dia a pasta parar
 * de subir, os dois somem juntos e o erro fica evidente.
 *
 * JavaScript puro, como release.mjs, e não .ts: roda no build da Vercel, onde
 * `tsx` é devDependency e pode não estar instalada. Um checador que derruba o
 * deploy por causa da própria ferramenta não checa nada.
 */
import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

// As migrations ficam ao lado deste arquivo. Resolver pelo caminho do próprio
// módulo (e não por `process.cwd()`) faz funcionar chamado de qualquer pasta.
const AQUI = dirname(fileURLToPath(import.meta.url));

// Local o segredo está no .env; na Vercel já vem no process.env. dotenv é
// devDependency — ausente, seguimos com o que o ambiente tiver.
if (!process.env.DATABASE_URL) {
  try {
    await import("dotenv/config");
  } catch {
    /* sem dotenv: process.env é o que temos */
  }
}

// Sem DATABASE_URL não há o que checar e não há deploy acontecendo: é a máquina
// de alguém, ou um CI sem segredo. Avisa e passa.
if (!process.env.DATABASE_URL) {
  console.warn("· checar-migracoes: sem DATABASE_URL — checagem pulada.");
  process.exit(0);
}

// Mas se a variável EXISTE e mesmo assim não dá para checar, isso é defeito de
// configuração e derruba o build. A primeira versão desta checagem avisava e
// passava aqui — e um `DATABASE_URL` de Preview malformado (host `base`,
// `getaddrinfo ENOTFOUND`) fez a trava rodar, não checar nada e liberar um
// build com migration pendente, em silêncio. Proteção que falha para o lado
// permissivo, sem ninguém ver, é pior que proteção nenhuma: dá confiança falsa.
function abortar(motivo) {
  console.error(
    `\n✖ checar-migracoes: ${motivo}.\n\n` +
      `  DATABASE_URL está definida mas não dá para consultar o banco, então\n` +
      `  não sei se falta migration — e não vou deixar passar no escuro.\n` +
      `  Confira o valor da variável no ambiente deste build.\n`,
  );
  process.exit(1);
}

const noRepo = readdirSync(resolve(AQUI, "migrations"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

// Neon hiberna: a primeira conexão depois de um tempo ocioso pode falhar ou
// demorar enquanto a compute acorda. Três tentativas antes de desistir — assim
// um soluço não vira deploy barrado nem, pior, checagem silenciosamente pulada.
async function conectar() {
  let ultimoErro;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const client = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 10_000,
    });
    try {
      await client.connect();
      return client;
    } catch (erro) {
      ultimoErro = erro;
      await client.end().catch(() => {});
      if (tentativa < 3) await new Promise((r) => setTimeout(r, tentativa * 2000));
    }
  }
  throw ultimoErro;
}

let client;
try {
  client = await conectar();
} catch (erro) {
  abortar(`banco inalcancavel (${erro.message})`);
}

let pendentes;
try {
  const { rows } = await client.query(
    `SELECT migration_name FROM public."_prisma_migrations" WHERE finished_at IS NOT NULL`,
  );
  const aplicadas = new Set(rows.map((r) => r.migration_name));
  pendentes = noRepo.filter((m) => !aplicadas.has(m));
} catch (erro) {
  await client.end().catch(() => {});
  abortar(`nao consegui ler _prisma_migrations (${erro.message})`);
} finally {
  await client.end().catch(() => {});
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
