// Fumaça de escalas contra o banco de verdade. Em transação com rollback
// proposital: definir turno, reatribuir (upsert, não empilha), apagar
// (turno=""), e copiar semana sem sobrescrever dia já preenchido. Nada fica
// gravado.
//
//   npx tsx scripts/smoke-escala.ts
import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { dataUTC } from "../lib/datas";
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
  const [pessoa1, pessoa2] = await prisma.colaborador.findMany({
    where: { empresaId: empresa.id, ativo: true },
    take: 2,
    select: { id: true, nome: true },
  });
  if (!pessoa1 || !pessoa2) throw new Error("Preciso de ao menos 2 colaboradores ativos.");

  console.log(`Empresa: ${empresa.nome}`);
  console.log("(tudo roda em transação e termina em ROLLBACK)\n");

  try {
    await prisma.$transaction(
      async (tx) => {
        const segunda = dataUTC(2026, 7, 20);

        console.log("1. Definir turno (upsert pela chave colaborador+dia)");
        await tx.escalaTurno.upsert({
          where: { colaboradorId_data: { colaboradorId: pessoa1.id, data: segunda } },
          create: { empresaId: empresa.id, colaboradorId: pessoa1.id, data: segunda, turno: "MANHA" },
          update: { turno: "MANHA" },
        });
        const contagemApos1 = await tx.escalaTurno.count({ where: { colaboradorId: pessoa1.id, data: segunda } });
        ok(contagemApos1 === 1, "primeira atribuição cria 1 linha");

        console.log("2. Reatribuir no mesmo dia não empilha (upsert vira update)");
        await tx.escalaTurno.upsert({
          where: { colaboradorId_data: { colaboradorId: pessoa1.id, data: segunda } },
          create: { empresaId: empresa.id, colaboradorId: pessoa1.id, data: segunda, turno: "NOITE" },
          update: { turno: "NOITE" },
        });
        const contagemApos2 = await tx.escalaTurno.count({ where: { colaboradorId: pessoa1.id, data: segunda } });
        const linha = await tx.escalaTurno.findUnique({
          where: { colaboradorId_data: { colaboradorId: pessoa1.id, data: segunda } },
        });
        ok(contagemApos2 === 1, "continua 1 linha só, não duas");
        ok(linha?.turno === "NOITE", "o turno foi atualizado para o novo valor");

        console.log("3. Apagar (turno vazio remove a linha)");
        await tx.escalaTurno.deleteMany({ where: { colaboradorId: pessoa1.id, data: segunda } });
        const contagemApos3 = await tx.escalaTurno.count({ where: { colaboradorId: pessoa1.id, data: segunda } });
        ok(contagemApos3 === 0, "linha removida");

        console.log("4. Copiar semana não sobrescreve dia já preenchido no destino");
        const segundaOrigem = dataUTC(2026, 6, 22);
        const segundaDestino = dataUTC(2026, 6, 29);
        await tx.escalaTurno.create({
          data: { empresaId: empresa.id, colaboradorId: pessoa1.id, data: segundaOrigem, turno: "PLANTAO" },
        });
        await tx.escalaTurno.create({
          data: { empresaId: empresa.id, colaboradorId: pessoa2.id, data: segundaOrigem, turno: "TARDE" },
        });
        // No destino, pessoa2 já tem um turno definido manualmente — a cópia
        // não pode sobrescrever isso.
        await tx.escalaTurno.create({
          data: { empresaId: empresa.id, colaboradorId: pessoa2.id, data: segundaDestino, turno: "FOLGA" },
        });

        const origem = await tx.escalaTurno.findMany({
          where: { empresaId: empresa.id, data: { gte: segundaOrigem, lte: dataUTC(2026, 6, 28) } },
        });
        const jaPreenchidoNoDestino = new Set(
          (
            await tx.escalaTurno.findMany({
              where: { empresaId: empresa.id, data: { gte: segundaDestino, lte: dataUTC(2026, 7, 5) } },
              select: { colaboradorId: true, data: true },
            })
          ).map((d) => `${d.colaboradorId}::${d.data.toISOString()}`),
        );
        let copiados = 0;
        for (const l of origem) {
          const novaData = new Date(l.data.getTime() + 7 * 86_400_000);
          const chave = `${l.colaboradorId}::${novaData.toISOString()}`;
          if (jaPreenchidoNoDestino.has(chave)) continue;
          await tx.escalaTurno.upsert({
            where: { colaboradorId_data: { colaboradorId: l.colaboradorId, data: novaData } },
            create: { empresaId: empresa.id, colaboradorId: l.colaboradorId, data: novaData, turno: l.turno },
            update: {},
          });
          copiados++;
        }
        ok(copiados === 1, "só copia quem estava vazio no destino (pessoa1), pula quem já tinha (pessoa2)");

        const pessoa2NoDestino = await tx.escalaTurno.findUnique({
          where: { colaboradorId_data: { colaboradorId: pessoa2.id, data: segundaDestino } },
        });
        ok(pessoa2NoDestino?.turno === "FOLGA", "o turno manual da pessoa2 no destino não foi sobrescrito");

        throw new RollbackProposital();
      },
      { timeout: 30_000 },
    );
  } catch (e) {
    if (!(e instanceof RollbackProposital)) throw e;
    console.log("\n↩ rollback executado — nada foi gravado.");
  }

  const sobrou = await prisma.escalaTurno.count({
    where: { colaboradorId: { in: [pessoa1.id, pessoa2.id] }, data: { gte: dataUTC(2026, 6, 22), lte: dataUTC(2026, 7, 26) } },
  });
  ok(sobrou === 0, "nenhuma escala de teste sobrou no banco");

  console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
