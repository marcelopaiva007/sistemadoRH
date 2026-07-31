// Fumaça de benefícios contra o banco de verdade. Em transação com rollback
// proposital: concede um plano de saúde, confere o custo mensal no painel,
// encerra e confere que sai da conta de "vigente". Nada fica gravado.
//
//   npx tsx scripts/smoke-beneficios.ts
import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { dataUTC, hojeUTC } from "../lib/datas";
import { empresaDeTeste } from "./_empresa-de-teste";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

class RollbackProposital extends Error {}

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

async function main() {
  const empresa = await empresaDeTeste(prisma, { comSetor: true });
  if (!empresa) throw new Error("Nenhuma empresa cadastrada.");
  const colaborador = await prisma.colaborador.findFirst({
    where: { empresaId: empresa.id, ativo: true },
    select: { id: true, nome: true },
  });
  if (!colaborador) throw new Error("Nenhum colaborador ativo.");

  console.log(`Empresa: ${empresa.nome} · Colaborador de teste: ${colaborador.nome}`);
  console.log("(tudo roda em transação e termina em ROLLBACK)\n");

  try {
    await prisma.$transaction(
      async (tx) => {
        console.log("1. Conceder plano de saúde");
        const beneficio = await tx.beneficioColaborador.create({
          data: {
            empresaId: empresa.id,
            colaboradorId: colaborador.id,
            tipo: "PLANO_SAUDE",
            operadora: "Unimed",
            valorEmpresa: 350.5,
            valorColaborador: 50,
            dataInicio: dataUTC(2026, 1, 1),
          },
        });
        ok(beneficio.valorEmpresa === 350.5, "custo com centavos gravado certo");

        console.log("2. Não pode duplicar o mesmo tipo vigente");
        const conflito = await tx.beneficioColaborador.findFirst({
          where: {
            colaboradorId: colaborador.id,
            tipo: "PLANO_SAUDE",
            OR: [{ dataFim: null }, { dataFim: { gte: hojeUTC() } }],
          },
        });
        ok(conflito !== null, "a checagem de duplicidade encontraria o benefício vigente");

        console.log("3. Painel de benefícios enxerga o custo");
        const vigentes = await tx.beneficioColaborador.findMany({
          where: { empresaId: empresa.id, OR: [{ dataFim: null }, { dataFim: { gte: hojeUTC() } }] },
        });
        const custoTotal = vigentes.reduce((t, b) => t + (b.valorEmpresa ?? 0), 0);
        ok(custoTotal >= 350.5, "o custo do plano entra na soma da empresa");

        console.log("4. Encerrar benefício");
        await tx.beneficioColaborador.update({
          where: { id: beneficio.id },
          data: { dataFim: dataUTC(2026, 6, 30) },
        });
        const aindaVigente = await tx.beneficioColaborador.count({
          where: { id: beneficio.id, OR: [{ dataFim: null }, { dataFim: { gte: hojeUTC() } }] },
        });
        ok(aindaVigente === 0, "benefício encerrado sai da conta de vigentes");
        const historicoPreservado = await tx.beneficioColaborador.count({ where: { id: beneficio.id } });
        ok(historicoPreservado === 1, "a linha continua existindo (histórico preservado)");

        throw new RollbackProposital();
      },
      { timeout: 30_000 },
    );
  } catch (e) {
    if (!(e instanceof RollbackProposital)) throw e;
    console.log("\n↩ rollback executado — nada foi gravado.");
  }

  const sobrou = await prisma.beneficioColaborador.count({ where: { colaboradorId: colaborador.id, operadora: "Unimed", valorEmpresa: 350.5 } });
  ok(sobrou === 0, "nenhum benefício de teste sobrou no banco");

  console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
