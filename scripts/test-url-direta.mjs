// A URL que o `prisma migrate deploy` usa no build (prisma/url-direta.mjs),
// sem banco nenhum.
//
//   node scripts/test-url-direta.mjs
//
// O que quebra sozinho aqui é texto: tirar o `-pooler` do lugar errado,
// estragar a senha (que vem com caracteres escapados) ou deixar o
// `pgbouncer=true` na conexão direta. Qualquer um desses derruba o deploy de
// produção — que é justamente o que esta URL existe para não fazer.
import { semPooler, urlParaMigrar } from "../prisma/url-direta.mjs";

let falhas = 0;
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

const POOLER =
  "postgresql://neondb_owner:s3nh%40F0rte%2F1@ep-solitary-lake-acrk7t0f-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const DIRETA =
  "postgresql://neondb_owner:s3nh%40F0rte%2F1@ep-solitary-lake-acrk7t0f.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

console.log("Host do pooler vira host direto\n");
ok(semPooler(POOLER) === DIRETA, "tira o -pooler do primeiro rótulo e mantém o resto igual");
{
  const u = new URL(semPooler(POOLER));
  ok(u.password === "s3nh%40F0rte%2F1", "a senha escapada passa intacta");
  ok(u.username === "neondb_owner", "o usuário passa intacto");
  ok(u.pathname === "/neondb", "o banco passa intacto");
  ok(u.searchParams.get("sslmode") === "require", "sslmode continua");
}
ok(
  !new URL(semPooler(`${POOLER}&pgbouncer=true`)).searchParams.has("pgbouncer"),
  "pgbouncer=true sai da conexão direta",
);
ok(
  new URL(semPooler("postgresql://u:p@ep-x-pooler.sa-east-1.aws.neon.tech:5432/db")).port === "5432",
  "porta explícita continua",
);

console.log("\nO que não é pooler volta igual\n");
ok(semPooler(DIRETA) === DIRETA, "host já direto não muda");
ok(semPooler("postgresql://rhci:rhci@localhost:5432/rhtest") === "postgresql://rhci:rhci@localhost:5432/rhtest", "banco do CI não muda");
ok(
  semPooler("postgresql://u:p@db.meu-pooler-host.com/x") === "postgresql://u:p@db.meu-pooler-host.com/x",
  "-pooler fora do primeiro rótulo não é tocado",
);
ok(semPooler("isto não é url") === "isto não é url", "texto que não é URL volta igual (o Prisma é quem reclama)");

console.log("\nDe onde vem a URL\n");
{
  const r = urlParaMigrar({ DATABASE_URL: POOLER });
  ok(r.url === DIRETA && r.origem === "DATABASE_URL sem -pooler", "sem DATABASE_URL_DIRECT, deriva do DATABASE_URL");
}
{
  const r = urlParaMigrar({ DATABASE_URL: POOLER, DATABASE_URL_DIRECT: "postgresql://outra/db" });
  ok(r.url === "postgresql://outra/db" && r.origem === "DATABASE_URL_DIRECT", "DATABASE_URL_DIRECT vence quando existe");
}
{
  const r = urlParaMigrar({ DATABASE_URL: DIRETA });
  ok(r.url === DIRETA && r.origem === "DATABASE_URL", "URL já direta é usada como veio");
}

if (falhas) {
  console.error(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log("\nTudo certo.");
