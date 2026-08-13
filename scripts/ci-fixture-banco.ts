// Base mínima para os smokes rodarem num banco RECÉM-CRIADO (CI).
//
// Os smokes criam os próprios dados dentro de transação com rollback, mas a
// escolha da empresa-palco (scripts/_empresa-de-teste.ts) exige que exista UMA
// empresa ativa com setor e colaborador ativos ANTES de tudo — no banco de
// desenvolvimento ela sempre existiu, num banco de CI não existe nada. Este
// script cria exatamente esse palco, e nada além dele.
//
// Idempotente de propósito: rodar duas vezes não duplica nada, então serve
// tanto no CI (banco novo a cada execução) quanto numa máquina local zerada.
//
//   npx tsx scripts/ci-fixture-banco.ts
import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const marca = await prisma.marca.upsert({
    where: { nome: "CI Fixture" },
    update: {},
    create: { nome: "CI Fixture" },
  });

  let empresa = await prisma.empresa.findFirst({
    where: { marcaId: marca.id, nome: "Empresa de Teste CI" },
  });
  if (!empresa) {
    empresa = await prisma.empresa.create({
      data: {
        nome: "Empresa de Teste CI",
        cnpj: "00000000000191",
        marcaId: marca.id,
        ativo: true,
      },
    });
  }

  const setor = await prisma.setor.upsert({
    where: { empresaId_nome: { empresaId: empresa.id, nome: "Operações" } },
    update: { ativo: true },
    create: { empresaId: empresa.id, nome: "Operações", ativo: true },
  });

  const posicao = await prisma.posicao.upsert({
    where: { empresaId_nome: { empresaId: empresa.id, nome: "Técnico" } },
    update: {},
    create: { empresaId: empresa.id, nome: "Técnico" },
  });

  // 3 colaboradores, e não 1: parte dos smokes percorre listas (férias, folha,
  // pendências) e com um único nome os agregados ficam triviais demais para
  // pegar regressão de agrupamento.
  const nomes = ["Alice de Teste CI", "Bruno de Teste CI", "Carla de Teste CI"];
  for (const [i, nome] of nomes.entries()) {
    const existente = await prisma.colaborador.findFirst({
      where: { empresaId: empresa.id, nome },
      select: { id: true },
    });
    if (existente) continue;
    await prisma.colaborador.create({
      data: {
        empresaId: empresa.id,
        nome,
        cpf: String(11122233300 + i),
        setorId: setor.id,
        posicaoId: posicao.id,
        dataAdmissao: new Date("2024-01-15T00:00:00Z"),
        ativo: true,
      },
    });
  }

  const ativos = await prisma.colaborador.count({
    where: { empresaId: empresa.id, ativo: true },
  });
  console.log(`Fixture pronta: empresa "${empresa.nome}" com ${ativos} colaborador(es) ativo(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
