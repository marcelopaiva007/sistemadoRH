// Recupera acesso quando o login trava — mostra os usuários ADMIN e deixa
// redefinir a senha de um deles. Roda local, com a DATABASE_URL de produção;
// a senha nova nunca sai desta máquina nem passa por nenhum outro lugar.
//
//   Listar quem é ADMIN:
//     DATABASE_URL="..." npx tsx scripts/recuperar-acesso-admin.ts listar
//
//   Redefinir a senha de um usuário (por login):
//     DATABASE_URL="..." npx tsx scripts/recuperar-acesso-admin.ts redefinir <username> <senha-nova>
//
// <senha-nova> precisa ter pelo menos 8 caracteres — mesma regra da tela de
// Usuários (lib/actions/usuarios.ts).
import "dotenv/config";
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

    console.error("Uso:\n  listar\n  redefinir <username> <senha-nova>");
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
