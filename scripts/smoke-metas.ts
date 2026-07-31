// Fumaça de metas & PDI contra o banco de verdade. Em transação com rollback
// proposital: meta individual, meta de setor, a constraint CHECK que impede
// meta sem alvo ou com os dois alvos ao mesmo tempo, atualização de
// progresso/status, item de PDI e o toggle de concluído. Nada fica gravado.
//
//   npx tsx scripts/smoke-metas.ts
import "dotenv/config";
import { PrismaClient, Prisma } from "../app/generated/prisma/client";
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

async function rodarComRollback(fn: (tx: Prisma.TransactionClient) => Promise<void>) {
  try {
    await prisma.$transaction(fn, { timeout: 30_000 });
  } catch (e) {
    if (!(e instanceof RollbackProposital)) throw e;
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
  const setor = await prisma.setor.findFirst({ where: { empresaId: empresa.id, ativo: true }, select: { id: true, nome: true } });
  if (!setor) throw new Error("Nenhum setor ativo.");

  console.log(`Empresa: ${empresa.nome} · Colaborador: ${colaborador.nome} · Setor: ${setor.nome}`);
  console.log("(tudo roda em transação e termina em ROLLBACK)\n");

  console.log("1. Meta individual e meta de setor, progresso e status atualizados");
  await rodarComRollback(async (tx) => {
    const metaIndividual = await tx.meta.create({
      data: {
        empresaId: empresa.id,
        colaboradorId: colaborador.id,
        titulo: "Concluir certificação NR-10",
        dataInicio: dataUTC(2026, 6, 1),
        dataFim: dataUTC(2026, 8, 31),
      },
    });
    ok(metaIndividual.status === "EM_ANDAMENTO" && metaIndividual.progresso === 0, "meta individual nasce em andamento, 0%");

    const metaSetor = await tx.meta.create({
      data: {
        empresaId: empresa.id,
        setorId: setor.id,
        titulo: "Reduzir absenteísmo do setor em 20%",
        dataInicio: dataUTC(2026, 6, 1),
        dataFim: dataUTC(2026, 12, 31),
      },
    });
    ok(metaSetor.colaboradorId === null && metaSetor.setorId === setor.id, "meta de setor não tem colaboradorId");

    const atualizada = await tx.meta.update({
      where: { id: metaIndividual.id },
      data: { progresso: 60, status: "EM_ANDAMENTO" },
    });
    ok(atualizada.progresso === 60, "progresso atualizado para 60%");

    const concluida = await tx.meta.update({
      where: { id: metaIndividual.id },
      data: { progresso: 100, status: "ATINGIDA" },
    });
    ok(concluida.status === "ATINGIDA" && concluida.progresso === 100, "meta marcada como atingida a 100%");

    throw new RollbackProposital();
  });

  console.log("2. Constraint CHECK impede meta sem alvo ou com os dois alvos");
  await rodarComRollback(async (tx) => {
    try {
      await tx.meta.create({
        data: {
          empresaId: empresa.id,
          titulo: "Meta sem alvo — não deveria existir",
          dataInicio: dataUTC(2026, 6, 1),
          dataFim: dataUTC(2026, 6, 30),
        },
      });
      ok(false, "deveria ter sido recusado (sem alvo)");
    } catch (e) {
      ok(e instanceof Error && e.message.includes("Meta_colaborador_xor_setor_check"), "CHECK recusa meta sem colaborador nem setor");
    }
    throw new RollbackProposital();
  });

  await rodarComRollback(async (tx) => {
    try {
      await tx.meta.create({
        data: {
          empresaId: empresa.id,
          colaboradorId: colaborador.id,
          setorId: setor.id,
          titulo: "Meta com os dois alvos — não deveria existir",
          dataInicio: dataUTC(2026, 6, 1),
          dataFim: dataUTC(2026, 6, 30),
        },
      });
      ok(false, "deveria ter sido recusado (dois alvos)");
    } catch (e) {
      ok(e instanceof Error && e.message.includes("Meta_colaborador_xor_setor_check"), "CHECK recusa meta com colaborador E setor ao mesmo tempo");
    }
    throw new RollbackProposital();
  });

  console.log("3. Item de PDI: criar, concluir, reabrir");
  await rodarComRollback(async (tx) => {
    const item = await tx.planoDesenvolvimento.create({
      data: {
        empresaId: empresa.id,
        colaboradorId: colaborador.id,
        titulo: "Curso de liderança para técnicos",
        prazo: dataUTC(2026, 9, 30),
      },
    });
    ok(!item.concluido, "item nasce pendente");

    const concluido = await tx.planoDesenvolvimento.update({
      where: { id: item.id },
      data: { concluido: true, concluidoEm: dataUTC(2026, 7, 1), concluidoPorNome: "Teste Smoke" },
    });
    ok(concluido.concluido && concluido.concluidoEm !== null, "item marcado como concluído com data e responsável");

    const reaberto = await tx.planoDesenvolvimento.update({
      where: { id: item.id },
      data: { concluido: false, concluidoEm: null, concluidoPorId: null, concluidoPorNome: null },
    });
    ok(!reaberto.concluido && reaberto.concluidoPorNome === null, "reabrir limpa data e responsável");

    throw new RollbackProposital();
  });

  const sobrouMeta = await prisma.meta.count({ where: { empresaId: empresa.id, titulo: { contains: "NR-10" } } });
  const sobrouMetaSetor = await prisma.meta.count({ where: { setorId: setor.id, titulo: { contains: "absenteísmo" } } });
  const sobrouPdi = await prisma.planoDesenvolvimento.count({ where: { colaboradorId: colaborador.id, titulo: { contains: "liderança" } } });
  ok(sobrouMeta === 0, "nenhuma meta individual de teste sobrou no banco");
  ok(sobrouMetaSetor === 0, "nenhuma meta de setor de teste sobrou no banco");
  ok(sobrouPdi === 0, "nenhum item de PDI de teste sobrou no banco");

  console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
