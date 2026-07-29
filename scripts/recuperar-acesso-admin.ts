// Recupera acesso quando o login trava — mostra os usuários ADMIN, deixa
// redefinir a senha de um deles ou criar uma conta ADMIN nova. Roda local,
// com a DATABASE_URL de produção; a senha nunca sai desta máquina nem passa
// por nenhum outro lugar.
//
//   Listar quem é ADMIN:
//     DATABASE_URL="..." npx tsx scripts/recuperar-acesso-admin.ts listar
//
//   Redefinir a senha de um usuário (por login):
//     DATABASE_URL="..." npx tsx scripts/recuperar-acesso-admin.ts redefinir <username> <senha-nova>
//
//   Criar uma conta ADMIN nova (o nome de exibição é opcional):
//     DATABASE_URL="..." npx tsx scripts/recuperar-acesso-admin.ts criar <username> <senha> "Nome Completo"
//
// <senha> precisa ter pelo menos 8 caracteres — mesma regra da tela de
// Usuários (lib/actions/usuarios.ts).
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import bcrypt from "bcryptjs";

const [, , comando, ...args] = process.argv;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    if (comando === "listar") {
      const { rows } = await client.query(
        `SELECT username, nome, role FROM "rh"."User" WHERE role = 'ADMIN' ORDER BY username`,
      );
      if (rows.length === 0) {
        console.log("Nenhum usuário ADMIN encontrado.");
        return;
      }
      console.log("Usuários ADMIN:");
      for (const r of rows) console.log(`  ${r.username}  (${r.nome})`);
      return;
    }

    if (comando === "redefinir") {
      const [username, senha] = args;
      if (!username || !senha) {
        console.error("Uso: redefinir <username> <senha-nova>");
        process.exit(1);
      }
      if (senha.length < 8) {
        console.error("A senha precisa ter pelo menos 8 caracteres.");
        process.exit(1);
      }
      const hash = await bcrypt.hash(senha, 10);
      const { rowCount, rows } = await client.query(
        `UPDATE "rh"."User" SET "passwordHash" = $1 WHERE username = $2 RETURNING username, nome, role`,
        [hash, username],
      );
      if (rowCount === 0) {
        console.error(`Nenhum usuário com login "${username}". Rode "listar" para conferir os logins existentes.`);
        process.exit(1);
      }
      console.log(`Senha redefinida para ${rows[0].nome} (${rows[0].username}, ${rows[0].role}).`);
      return;
    }

    if (comando === "criar") {
      const [username, senha, nome] = args;
      if (!username || !senha) {
        console.error('Uso: criar <username> <senha> "Nome Completo"');
        process.exit(1);
      }
      if (senha.length < 8) {
        console.error("A senha precisa ter pelo menos 8 caracteres.");
        process.exit(1);
      }
      const jaExiste = await client.query(`SELECT nome, role FROM "rh"."User" WHERE username = $1`, [username]);
      if (jaExiste.rows.length > 0) {
        console.error(
          `Já existe um usuário com o login "${username}" (${jaExiste.rows[0].nome}, ${jaExiste.rows[0].role}). ` +
            `Para trocar a senha dele, use "redefinir".`,
        );
        process.exit(1);
      }
      const hash = await bcrypt.hash(senha, 10);
      // O id vem daqui porque o cuid() do schema é gerado pelo client do
      // Prisma, não pelo banco — um INSERT direto precisa trazer o próprio id.
      await client.query(
        `INSERT INTO "rh"."User" (id, nome, username, "passwordHash", role) VALUES ($1, $2, $3, $4, 'ADMIN')`,
        [randomUUID(), nome || username, username, hash],
      );
      console.log(`Conta ADMIN criada: ${username} (${nome || username}). Já dá para entrar pela tela de login.`);
      return;
    }

    console.error('Uso:\n  listar\n  redefinir <username> <senha-nova>\n  criar <username> <senha> "Nome Completo"');
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
