// Fumaça de offboarding contra o banco de verdade. Em transação com rollback
// proposital: checklist padrão, item personalizado, marcar/desmarcar
// concluído, entrevista de desligamento (upsert) e a constraint UNIQUE que
// impede duas entrevistas para o mesmo colaborador. Nada fica gravado.
//
//   npx tsx scripts/smoke-offboarding.ts
import "dotenv/config";
import { PrismaClient, Prisma } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { dataUTC } from "../lib/datas";
import { ITENS_OFFBOARDING } from "../lib/constants-offboarding";

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
  console.log("(tudo roda em transação e termina em ROLLBACK)\n");

  const itensCatalogo = ITENS_OFFBOARDING.filter((i) => i.value !== "OUTRO").map((i) => i.value);

  console.log("1. Gerar checklist padrão e marcar item como concluído");
  await rodarComRollback(async (tx) => {
    await tx.checklistDesligamento.createMany({
      data: itensCatalogo.map((item) => ({ empresaId: empresa.id, colaboradorId: colaborador.id, item })),
    });
    const total = await tx.checklistDesligamento.count({ where: { colaboradorId: colaborador.id } });
    ok(total === itensCatalogo.length, `checklist gerado com ${itensCatalogo.length} item(ns) do catálogo`);

    const primeiro = await tx.checklistDesligamento.findFirst({ where: { colaboradorId: colaborador.id } });
    const concluido = await tx.checklistDesligamento.update({
      where: { id: primeiro!.id },
      data: { concluido: true, concluidoEm: dataUTC(2026, 6, 1), concluidoPorNome: "Teste Smoke" },
    });
    ok(concluido.concluido && concluido.concluidoEm !== null, "item marcado como concluído com data e responsável");

    const desmarcado = await tx.checklistDesligamento.update({
      where: { id: primeiro!.id },
      data: { concluido: false, concluidoEm: null, concluidoPorId: null, concluidoPorNome: null },
    });
    ok(!desmarcado.concluido && desmarcado.concluidoEm === null, "item desmarcado limpa data e responsável");

    throw new RollbackProposital();
  });

  console.log("2. Item personalizado (OUTRO) guarda a descrição livre");
  await rodarComRollback(async (tx) => {
    const item = await tx.checklistDesligamento.create({
      data: {
        empresaId: empresa.id,
        colaboradorId: colaborador.id,
        item: "OUTRO",
        descricao: "Devolver crachá de acesso ao datacenter",
      },
    });
    ok(item.item === "OUTRO" && item.descricao === "Devolver crachá de acesso ao datacenter", "item personalizado criado com descrição");
    throw new RollbackProposital();
  });

  console.log("3. Entrevista de desligamento: upsert e constraint UNIQUE por colaborador");
  await rodarComRollback(async (tx) => {
    const criada = await tx.entrevistaDesligamento.create({
      data: {
        empresaId: empresa.id,
        colaboradorId: colaborador.id,
        dataEntrevista: dataUTC(2026, 6, 5),
        satisfacaoGeral: 4,
        recomendariaEmpresa: true,
      },
    });
    ok(criada.colaboradorId === colaborador.id, "entrevista criada");

    const atualizada = await tx.entrevistaDesligamento.upsert({
      where: { colaboradorId: colaborador.id },
      create: {
        empresaId: empresa.id,
        colaboradorId: colaborador.id,
        dataEntrevista: dataUTC(2026, 6, 5),
      },
      update: { satisfacaoGeral: 2, motivoReal: "Mudança de cidade" },
    });
    ok(atualizada.satisfacaoGeral === 2 && atualizada.motivoReal === "Mudança de cidade", "upsert atualiza a entrevista existente em vez de duplicar");

    try {
      await tx.entrevistaDesligamento.create({
        data: {
          empresaId: empresa.id,
          colaboradorId: colaborador.id,
          dataEntrevista: dataUTC(2026, 6, 6),
        },
      });
      ok(false, "deveria ter sido recusado");
    } catch (e) {
      ok(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002", "a constraint UNIQUE impede duas entrevistas para o mesmo colaborador");
    }

    throw new RollbackProposital();
  });

  const sobrouChecklist = await prisma.checklistDesligamento.count({ where: { colaboradorId: colaborador.id } });
  const sobrouEntrevista = await prisma.entrevistaDesligamento.count({ where: { colaboradorId: colaborador.id } });
  ok(sobrouChecklist === 0, "nenhum item de checklist de teste sobrou no banco");
  ok(sobrouEntrevista === 0, "nenhuma entrevista de teste sobrou no banco");

  console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
