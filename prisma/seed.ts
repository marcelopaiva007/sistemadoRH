import "dotenv/config";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { Prisma } from "../app/generated/prisma/client";
import { REGRAS_DEFAULT } from "../lib/regras-defaults";

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

  await seedRegras();
}

// Pré-cadastra a política de bonificação da OS como vigência corrente. Idempotente:
// se já houver uma vigência aberta iniciando no 1º dia do mês atual, apenas
// atualiza a config; caso contrário, fecha as vigências abertas e cria a nova.
async function seedRegras() {
  const hoje = new Date();
  const inicio = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
  const diaAnterior = new Date(inicio);
  diaAnterior.setUTCDate(diaAnterior.getUTCDate() - 1);

  for (const [cargo, config] of Object.entries(REGRAS_DEFAULT)) {
    const configJson = config as unknown as Prisma.InputJsonValue;
    const aberta = await prisma.regraBonificacao.findFirst({
      where: { cargo, vigenciaFim: null },
      orderBy: { vigenciaInicio: "desc" },
    });

    if (aberta && aberta.vigenciaInicio.getTime() === inicio.getTime()) {
      await prisma.regraBonificacao.update({
        where: { id: aberta.id },
        data: { config: configJson },
      });
      console.log(`Regra "${cargo}" já vigente neste mês — config atualizada.`);
      continue;
    }

    await prisma.regraBonificacao.updateMany({
      where: { cargo, vigenciaFim: null },
      data: { vigenciaFim: diaAnterior },
    });
    await prisma.regraBonificacao.create({
      data: {
        cargo,
        vigenciaInicio: inicio,
        vigenciaFim: null,
        config: configJson,
        observacoes: "Política de bonificação da OS (pré-cadastrada pelo seed).",
      },
    });
    console.log(`Regra "${cargo}" criada, vigente a partir de ${inicio.toISOString().slice(0, 10)}.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
