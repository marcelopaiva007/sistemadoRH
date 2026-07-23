import "dotenv/config";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

function gerarSenhaAleatoria(): string {
  return crypto.randomBytes(9).toString("base64url");
}

async function upsertUser(
  username: string,
  password: string,
  gerada: boolean,
  nome: string,
  role: string,
  escopo?: { empresaId?: string; setorId?: string }
) {
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { username },
    update: {},
    create: { username, passwordHash, nome, role, ...escopo },
  });
  console.log(`Usuário "${username}" (${role}) pronto.${gerada ? ` Senha gerada: ${password}` : ""}`);
}

// Empresas atendidas pelo módulo de RH/clima organizacional — isoladas entre
// si (cada uma com seus próprios setores/posições/colaboradores/pesquisas).
async function seedEmpresas() {
  const nomes = ["LM Telecom", "Centrysol", "VAPT"];
  const empresas = [];
  for (const nome of nomes) {
    const empresa = await prisma.empresa.upsert({
      where: { nome },
      update: {},
      create: { nome },
    });
    empresas.push(empresa);
    console.log(`Empresa "${nome}" pronta.`);
  }

  // Setor/Posição demo na primeira empresa (LM Telecom), só pra não deixar as
  // telas de cadastro vazias no primeiro acesso.
  const lmTelecom = empresas[0];
  const setorDemo = await prisma.setor.upsert({
    where: { empresaId_nome: { empresaId: lmTelecom.id, nome: "Comercial" } },
    update: {},
    create: { empresaId: lmTelecom.id, nome: "Comercial" },
  });
  await prisma.posicao.upsert({
    where: { empresaId_nome: { empresaId: lmTelecom.id, nome: "Analista" } },
    update: {},
    create: { empresaId: lmTelecom.id, nome: "Analista" },
  });

  const rhManagerSenha = process.env.SEED_RH_MANAGER_PASSWORD ?? gerarSenhaAleatoria();
  await upsertUser(
    process.env.SEED_RH_MANAGER_USERNAME ?? "rh.lmtelecom",
    rhManagerSenha,
    !process.env.SEED_RH_MANAGER_PASSWORD,
    "RH LM Telecom",
    "RH_MANAGER",
    { empresaId: lmTelecom.id }
  );

  const gestorSetorSenha = process.env.SEED_GESTOR_SETOR_PASSWORD ?? gerarSenhaAleatoria();
  await upsertUser(
    process.env.SEED_GESTOR_SETOR_USERNAME ?? "gestor.comercial",
    gestorSetorSenha,
    !process.env.SEED_GESTOR_SETOR_PASSWORD,
    "Gestor Comercial",
    "GESTOR_SETOR",
    { empresaId: lmTelecom.id, setorId: setorDemo.id }
  );
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

  await seedEmpresas();

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
