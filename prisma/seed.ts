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
  // Grupos de sociedade (lib/grupo.ts) com os MESMOS ids da migration
  // 20261105120000_grupos_sociedade: a LM Telecom num grupo só dela.
  const grupoLm = await prisma.grupo.upsert({
    where: { id: "grupo_lm_telecom" },
    update: {},
    create: { id: "grupo_lm_telecom", nome: "LM Telecom" },
  });
  const grupoDemais = await prisma.grupo.upsert({
    where: { id: "grupo_demais_marcas" },
    update: {},
    create: { id: "grupo_demais_marcas", nome: "Demais marcas" },
  });
  const empresas = [];
  for (const nome of nomes) {
    // Cada marca começa com uma pessoa jurídica de mesmo nome (Fase 6). Os
    // demais CNPJs de cada marca entram pela tela de Marcas & CNPJs, com
    // razão social e número — dado que só o RH tem.
    const marca = await prisma.marca.upsert({
      where: { nome },
      update: {},
      create: {
        nome,
        grupoId: nome === "LM Telecom" ? grupoLm.id : grupoDemais.id,
      },
    });
    const empresa = await prisma.empresa.upsert({
      where: { nome },
      update: {},
      create: { nome, marcaId: marca.id },
    });
    empresas.push(empresa);
    console.log(`Marca e empresa "${nome}" prontas.`);
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

  // Toda conta de trabalho pertence a um grupo (lib/grupo.ts). As contas do
  // seed ligadas à LM Telecom vão para o grupo dela; as demais, para o outro.
  const lm = await prisma.empresa.findUnique({
    where: { nome: "LM Telecom" },
    select: { id: true },
  });
  if (lm) {
    await prisma.user.updateMany({
      where: { grupoId: null, empresaId: lm.id },
      data: { grupoId: "grupo_lm_telecom" },
    });
  }
  await prisma.user.updateMany({
    where: { grupoId: null, role: { not: "MASTER" } },
    data: { grupoId: "grupo_demais_marcas" },
  });

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
