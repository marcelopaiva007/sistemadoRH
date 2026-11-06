// Cria a conta MASTER — quem administra os GRUPOS de sociedade (lib/grupo.ts).
//
// O MASTER cria os grupos e as contas de cada um e decide em que grupo fica
// cada marca. Por decisão do CEO em 05/11/2026, ele SÓ administra: não entra
// em RH, Processos nem Delegações, e não enxerga dado de grupo nenhum. Quem
// precisa trabalhar num grupo usa uma conta própria daquele grupo (um login
// por grupo).
//
// Não existe tela que crie MASTER de propósito: dar o poder de criar contas em
// qualquer grupo não pode ser um clique ao alcance do ADMIN de um grupo. Roda
// local, com a DATABASE_URL de produção; a senha nunca sai desta máquina.
//
//   Listar quem é MASTER:
//     DATABASE_URL="..." npx tsx scripts/criar-master.ts listar
//
//   Criar a conta MASTER (o nome de exibição é opcional):
//     DATABASE_URL="..." npx tsx scripts/criar-master.ts criar <username> <senha> "Nome Completo"
//
// <senha> precisa ter pelo menos 8 caracteres — a mesma regra da tela.
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
        `SELECT username, nome, ativo FROM "rh"."User" WHERE role = 'MASTER' ORDER BY username`,
      );
      if (rows.length === 0) {
        console.log("Nenhuma conta MASTER ainda.");
        return;
      }
      console.log("Contas MASTER:");
      for (const r of rows)
        console.log(
          `  ${r.username}  (${r.nome})${r.ativo ? "" : "  [inativa]"}`,
        );
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
      const existe = await client.query(
        `SELECT 1 FROM "rh"."User" WHERE username = $1`,
        [username],
      );
      if (existe.rowCount) {
        // Não promove conta existente: ela tem vínculos e histórico de um grupo,
        // e o MASTER não pertence a grupo nenhum. Conta nova, login novo.
        console.error(
          `Já existe uma conta com o login "${username}". Escolha outro login para o MASTER.`,
        );
        process.exit(1);
      }
      const hash = await bcrypt.hash(senha, 10);
      await client.query(
        `INSERT INTO "rh"."User" (id, nome, username, "passwordHash", role, ativo, "grupoId", "createdAt")
         VALUES ($1, $2, $3, $4, 'MASTER', true, NULL, now())`,
        [randomUUID(), nome || "Master", username, hash],
      );
      console.log(
        `Conta MASTER "${username}" criada. Ela entra pela área de administração: /admin/login.`,
      );
      return;
    }

    console.error(
      'Comandos: listar | criar <username> <senha> "Nome Completo"',
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
