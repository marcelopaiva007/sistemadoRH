// Confere que o Sistema do RH não depende mais de nada fora do schema `rh`.
//
//   npx tsx scripts/test-desacoplamento.ts
//
// Read-only: nada aqui escreve no banco.
import "dotenv/config";
import { Client } from "pg";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const client = new Client({ connectionString: process.env.DATABASE_URL });

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

async function main() {
  await client.connect();

  console.log("1. Nenhuma referência saindo do schema rh");
  const saindo = await client.query(`
    SELECT c.conname, fns.nspname AS destino
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    JOIN pg_class fcl ON fcl.oid = c.confrelid
    JOIN pg_namespace fns ON fns.oid = fcl.relnamespace
    WHERE c.contype = 'f' AND ns.nspname = 'rh' AND fns.nspname <> 'rh'
  `);
  ok(
    saindo.rowCount === 0,
    `nenhuma FK do rh aponta para outro schema${saindo.rowCount ? ` (achei: ${saindo.rows.map((r) => `${r.conname}→${r.destino}`).join(", ")})` : ""}`,
  );

  console.log("2. Nenhuma referência entrando no schema rh");
  const entrando = await client.query(`
    SELECT c.conname, ns.nspname AS origem
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    JOIN pg_class fcl ON fcl.oid = c.confrelid
    JOIN pg_namespace fns ON fns.oid = fcl.relnamespace
    WHERE c.contype = 'f' AND fns.nspname = 'rh' AND ns.nspname <> 'rh'
  `);
  ok(
    entrando.rowCount === 0,
    `nenhuma FK de outro schema aponta para o rh${entrando.rowCount ? ` (achei: ${entrando.rows.map((r) => `${r.origem}.${r.conname}`).join(", ")})` : ""}`,
  );

  console.log("3. Tabela de usuários própria");
  const rhUsers = await client.query(`SELECT id, username, role, "passwordHash" FROM "rh"."User" ORDER BY username`);
  const sharedUsers = await client.query(`SELECT id, username FROM "shared"."User" ORDER BY username`);
  ok(rhUsers.rowCount! > 0, `rh."User" tem ${rhUsers.rowCount} usuário(s)`);
  ok(
    rhUsers.rowCount === sharedUsers.rowCount,
    `a cópia bateu com a origem (${rhUsers.rowCount} x ${sharedUsers.rowCount})`,
  );
  ok(
    rhUsers.rows.every((u) => typeof u.passwordHash === "string" && u.passwordHash.startsWith("$2")),
    "as senhas vieram como hash bcrypt (ninguém precisa redefinir senha agora)",
  );

  console.log("4. A FK de autoria de pesquisa aponta para dentro do rh");
  const fk = await client.query(`
    SELECT fns.nspname AS destino, fcl.relname AS tabela
    FROM pg_constraint c
    JOIN pg_class fcl ON fcl.oid = c.confrelid
    JOIN pg_namespace fns ON fns.oid = fcl.relnamespace
    WHERE c.conname = 'Pesquisa_criadoPorId_fkey'
  `);
  ok(fk.rows[0]?.destino === "rh" && fk.rows[0]?.tabela === "User", 'Pesquisa.criadoPorId -> rh."User"');

  console.log("5. Autoria das pesquisas continua resolvendo");
  const orfas = await client.query(`
    SELECT count(*)::int AS n FROM "rh"."Pesquisa" p
    WHERE p."criadoPorId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "rh"."User" u WHERE u.id = p."criadoPorId")
  `);
  ok(orfas.rows[0].n === 0, "nenhuma pesquisa ficou com autor inexistente");

  // Repete exatamente o que o authorize() de auth.ts faz — pelo Prisma, para
  // exercitar o mapeamento do multiSchema até rh."User", e não pelo pg cru.
  console.log("6. O caminho do login (authorize) resolve na tabela nova");
  const senhaSeed = process.env.SEED_ADMIN_PASSWORD;
  const usuarioSeed = process.env.SEED_ADMIN_USERNAME;
  if (senhaSeed && usuarioSeed) {
    const usuario = await prisma.user.findUnique({ where: { username: usuarioSeed } });
    ok(usuario !== null, `prisma.user.findUnique acha "${usuarioSeed}" (agora em rh."User")`);
    if (usuario) {
      ok(await bcrypt.compare(senhaSeed, usuario.passwordHash), "a senha confere — ninguém precisa redefinir");
      ok(
        await bcrypt.compare("senha-errada-de-proposito", usuario.passwordHash) === false,
        "senha errada continua sendo recusada",
      );
    }
  } else {
    console.log("  – SEED_ADMIN_* não configurado, pulando");
  }

  console.log("7. As telas do RH continuam lendo pelo Prisma");
  const [empresas, colaboradores, pesquisas] = await Promise.all([
    prisma.empresa.count(),
    prisma.colaborador.count(),
    prisma.pesquisa.findMany({ select: { titulo: true, criadoPor: { select: { nome: true } } }, take: 3 }),
  ]);
  ok(empresas > 0 && colaboradores > 0, `${empresas} empresa(s) e ${colaboradores} colaborador(es) legíveis`);
  ok(
    pesquisas.every((p) => p.criadoPor === null || typeof p.criadoPor.nome === "string"),
    "o include da autoria de pesquisa resolve contra rh.\"User\"",
  );

  await prisma.$disconnect();
  await client.end();
  console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await client.end();
  process.exit(1);
});
