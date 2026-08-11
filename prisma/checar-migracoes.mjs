#!/usr/bin/env node
/**
 * Aplica no banco de produção, no próprio build, as migrations que o repo tem
 * e o banco ainda não recebeu — via `prisma migrate deploy`.
 *
 *   npm run check:migracoes
 *
 * Em 30/07/2026 o deploy subiu com o pivô UserEmpresa no código e sem a tabela
 * no banco: as telas do módulo responderam 404 e tabela vazia, e passou-se o dia
 * achando que o banco tinha zerado. O build passava porque `next build` não
 * conversa com o banco. Este script conversa.
 *
 * Até 04/08/2026 este script só detectava e barrava — aplicar era
 * `scripts/aplicar-migracao.ts`, à mão, porque o Neon era dividido com os
 * outros apps do grupo e `_prisma_migrations` era comum: `prisma migrate
 * deploy` arriscava reaplicar migration de outro app. Desde 01/08/2026 o banco
 * (`SOFTrh`) é um projeto Neon dedicado — nem schema nem `_prisma_migrations`
 * são mais compartilhados (ver README, "Notas sobre o banco") — então o passo
 * manual saiu e este script chama `prisma migrate deploy` diretamente. O
 * script manual continua existindo para o caso raro de um `migration.sql` que
 * precise rodar fora do fluxo do Prisma.
 *
 * Aplicar sozinho só em Production: em Preview (`VERCEL_ENV === "preview"`)
 * a checagem volta a só barrar, nunca aplicar — Preview builda PR não
 * revisada, e aplicar migration ali equivaleria a deixar qualquer PR (Dependabot
 * inclusive) escrever no banco sem revisão, se um dia Preview e Production
 * apontarem pro mesmo lugar.
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

// No GitHub Actions o banco é efêmero e descartável, criado só para o build
// rodar. Comparar o repo com ELE não responde a pergunta que esta checagem
// existe para responder — "o banco de produção já recebeu o que este código
// precisa?" — e o banco de CI sempre pareceria atrasado.
//
// A alternativa tentada em 04/08/2026 foi reproduzir o histórico no banco de
// CI com `prisma migrate deploy`. Não funciona: este histórico não é
// reproduzível do zero. Ele carrega migrations de quando o banco era dividido
// com o lm-bonificacao (schemas `shared` e `bonificacao`), migrations de
// reconciliação que nunca foram feitas para executar, e trechos aplicados à
// mão fora do fluxo do Prisma. O replay morria em cadeia — primeiro "column
// email already exists", depois "schema shared does not exist" — e reprovava
// toda PR, incluindo as 7 do Dependabot.
//
// GITHUB_ACTIONS e não CI: a Vercel também define CI=1, e lá a checagem
// precisa valer — é justamente o deploy que ela protege.
if (process.env.GITHUB_ACTIONS === "true") {
  console.warn("· checar-migracoes: GitHub Actions — checagem pulada (o guardião é o deploy).");
  process.exit(0);
}

// Host e nome do banco no log — nunca usuário nem senha. Existe porque em
// 30/07/2026 a produção barrou por migration "pendente" que ESTAVA aplicada:
// aplicada no banco do .env local, enquanto o build olhava outro DATABASE_URL.
// Dois ambientes discordando sobre qual banco é "o banco" só se diagnostica
// com o host na cara.
// Defangado (ponto vira "[.]") de propósito: o log da Vercel redige qualquer
// linha que contenha substring do valor de uma env sensível — o host cru some
// como "Sensitive Environment Variable Redacted" e o diagnóstico morre.
function ondeEstouOlhando() {
  try {
    const u = new URL(process.env.DATABASE_URL);
    return `${u.hostname}${u.pathname}`.replaceAll(".", "[.]");
  } catch {
    return "(DATABASE_URL nao e uma URL valida)";
  }
}
console.log(`· checar-migracoes: banco deste ambiente -> ${ondeEstouOlhando()}`);

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

// Preview builda a partir de branch/PR não revisada — inclusive Dependabot,
// sozinho. Se o DATABASE_URL de Preview algum dia apontar pro mesmo banco de
// Production (é o que a Vercel tem hoje, malformado, mas com essa intenção),
// aplicar migration sozinho ali significa que abrir uma PR já basta pra
// mudar produção, sem revisão nenhuma. Aqui a checagem volta a só barrar,
// como sempre fez, e quem aplica continua sendo Production.
if (process.env.VERCEL_ENV === "preview") {
  console.error(
    `\n✖ ${pendentes.length} migration(s) no repo que o banco (Preview) ainda não recebeu:\n` +
      pendentes.map((m) => `    ${m}`).join("\n") +
      `\n\n  Preview não aplica sozinho de propósito (ver comentário no código) —` +
      `\n  quem aplica é o build de Production, no merge pro master.\n`,
  );
  process.exit(1);
}

console.log(
  `· checar-migracoes: ${pendentes.length} migration(s) pendente(s) — aplicando com ` +
    `"prisma migrate deploy":\n` +
    pendentes.map((m) => `    ${m}`).join("\n"),
);

// shell:true porque no Windows `npx` é um .cmd — spawnSync sem shell falha com
// ENOENT. Args são fixos (não vêm de input externo), sem risco de injeção.
const { spawnSync } = await import("node:child_process");
const resultado = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  shell: true,
});

if (resultado.error) {
  console.error(`\n✖ checar-migracoes: não consegui iniciar "npx prisma migrate deploy" (${resultado.error.message}).\n`);
  process.exit(1);
}
if (resultado.status !== 0) {
  console.error(
    `\n✖ checar-migracoes: "prisma migrate deploy" falhou — build interrompido.\n`,
  );
  process.exit(resultado.status ?? 1);
}

console.log("· checar-migracoes: migrations aplicadas.");
process.exit(0);
