// Fumaça do registro de reconhecimento contra o banco de verdade — só a
// camada de dados (não manda mensagem nenhuma pelo Telegram; isso é
// responsabilidade de lib/telegram.ts, já testada em produção pelas
// pesquisas). Duas transações separadas, cada uma com rollback proposital:
// uma violação de UNIQUE aborta o resto da transação no Postgres, então o
// teste de duplicidade fica isolado do resto para não arrastar os demais.
//
//   npx tsx scripts/smoke-reconhecimento.ts
import "dotenv/config";
import { PrismaClient, Prisma } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

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

async function rodarComRollback(fn: (tx: Prisma.TransactionClient) => Promise<void>) {
  try {
    await prisma.$transaction(fn, { timeout: 30_000 });
  } catch (e) {
    if (!(e instanceof RollbackProposital)) throw e;
  }
}

async function main() {
  const empresa = await prisma.empresa.findFirst({ where: { ativo: true } });
  if (!empresa) throw new Error("Nenhuma empresa cadastrada.");
  const colaborador = await prisma.colaborador.findFirst({
    where: { empresaId: empresa.id, ativo: true },
    select: { id: true, nome: true },
  });
  if (!colaborador) throw new Error("Nenhum colaborador ativo.");

  console.log(`Empresa: ${empresa.nome} · Colaborador de teste: ${colaborador.nome}`);
  console.log("(tudo roda em transação e termina em ROLLBACK — nenhuma mensagem é enviada)\n");

  console.log("1. Registrar aniversário e tempo de casa no mesmo ano (tipos não colidem)");
  await rodarComRollback(async (tx) => {
    const aniversario = await tx.reconhecimento.create({
      data: { empresaId: empresa.id, colaboradorId: colaborador.id, tipo: "ANIVERSARIO", ano: 2026 },
    });
    ok(aniversario.tipo === "ANIVERSARIO", "registro de aniversário criado");

    const tempoCasa = await tx.reconhecimento.create({
      data: { empresaId: empresa.id, colaboradorId: colaborador.id, tipo: "TEMPO_CASA", ano: 2026, anosCompletos: 3 },
    });
    ok(tempoCasa.anosCompletos === 3, "tempo de casa registra o número de anos, tipo separado não colide");

    const doAno = await tx.reconhecimento.findMany({
      where: { empresaId: empresa.id, colaboradorId: colaborador.id, ano: 2026 },
    });
    ok(doAno.length === 2, "a tela de reconhecimento enxergaria os dois");

    throw new RollbackProposital();
  });

  console.log("2. Não duplica o mesmo tipo no mesmo ano (isolado — violação aborta a transação)");
  await rodarComRollback(async (tx) => {
    await tx.reconhecimento.create({
      data: { empresaId: empresa.id, colaboradorId: colaborador.id, tipo: "ANIVERSARIO", ano: 2025 },
    });
    try {
      await tx.reconhecimento.create({
        data: { empresaId: empresa.id, colaboradorId: colaborador.id, tipo: "ANIVERSARIO", ano: 2025 },
      });
      ok(false, "a segunda tentativa deveria ter sido recusada");
    } catch (e) {
      ok(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002", "a constraint UNIQUE barra o duplo envio no mesmo ano");
    }
    throw new RollbackProposital();
  });

  const sobrou = await prisma.reconhecimento.count({ where: { colaboradorId: colaborador.id, ano: { in: [2025, 2026] } } });
  ok(sobrou === 0, "nenhum registro de teste sobrou no banco");

  console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
