import "dotenv/config";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

function gerarSenhaAleatoria(): string {
  return crypto.randomBytes(9).toString("base64url");
}

async function upsertUser(username: string, password: string, gerada: boolean, nome: string, role: string) {
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { username },
    update: {},
    create: { username, passwordHash, nome, role },
  });
  console.log(`Usuário "${username}" (${role}) pronto.${gerada ? ` Senha gerada: ${password}` : ""}`);
}

async function main() {
  const adminSenha = process.env.SEED_ADMIN_PASSWORD ?? gerarSenhaAleatoria();
  const diretoriaSenha = process.env.SEED_DIRETORIA_PASSWORD ?? gerarSenhaAleatoria();

  await upsertUser(
    process.env.SEED_ADMIN_USERNAME ?? "admin",
    adminSenha,
    !process.env.SEED_ADMIN_PASSWORD,
    "Administrador",
    "ADMIN"
  );
  await upsertUser(
    process.env.SEED_DIRETORIA_USERNAME ?? "diretoria",
    diretoriaSenha,
    !process.env.SEED_DIRETORIA_PASSWORD,
    "Diretoria",
    "DIRETORIA"
  );

  console.log(
    "\nGuarde as senhas geradas acima em local seguro — elas não ficam salvas em nenhum arquivo e não podem ser recuperadas depois."
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
