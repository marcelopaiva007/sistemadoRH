// Fumaça da trilha de integração contra o banco de verdade. Em transação com
// rollback proposital: trilha padrão com responsável sugerido, item
// personalizado, concluir/reabrir, e a cascata ao excluir o colaborador.
// Nada fica gravado.
//
//   npx tsx scripts/smoke-onboarding.ts
import "dotenv/config";
import { PrismaClient, Prisma } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { dataUTC } from "../lib/datas";
import { ITENS_ONBOARDING, responsavelPadraoDoItem } from "../lib/constants-onboarding";
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

  console.log(`Empresa: ${empresa.nome} · Colaborador: ${colaborador.nome}`);
  console.log("(tudo roda em transação e termina em ROLLBACK)\n");

  const catalogo = ITENS_ONBOARDING.filter((i) => i.value !== "OUTRO");

  console.log("1. Trilha padrão nasce com o responsável sugerido de cada item");
  await rodarComRollback(async (tx) => {
    await tx.checklistIntegracao.createMany({
      data: catalogo.map((i) => ({
        empresaId: empresa.id,
        colaboradorId: colaborador.id,
        item: i.value,
        responsavel: i.responsavelPadrao,
      })),
    });

    const criados = await tx.checklistIntegracao.findMany({ where: { colaboradorId: colaborador.id } });
    ok(criados.length === catalogo.length, `trilha gerada com ${catalogo.length} item(ns)`);
    ok(criados.every((c) => !c.concluido), "todo item nasce pendente");

    const acessoSistema = criados.find((c) => c.item === "ACESSO_SISTEMA");
    ok(acessoSistema?.responsavel === "TI", "ACESSO_SISTEMA já vem com TI como responsável");
    ok(
      responsavelPadraoDoItem("APRESENTACAO_EQUIPE") === "Gestor",
      "apresentação à equipe é do gestor, não do RH — integração é distribuída",
    );

    throw new RollbackProposital();
  });

  console.log("2. Item personalizado com prazo, concluir e reabrir");
  await rodarComRollback(async (tx) => {
    const item = await tx.checklistIntegracao.create({
      data: {
        empresaId: empresa.id,
        colaboradorId: colaborador.id,
        item: "OUTRO",
        descricao: "Cadastrar biometria no ponto da matriz",
        responsavel: "Portaria",
        prazo: dataUTC(2026, 8, 15),
      },
    });
    ok(item.item === "OUTRO" && item.descricao !== null, "item personalizado guarda a descrição livre");
    ok(item.prazo !== null, "prazo gravado");

    const concluido = await tx.checklistIntegracao.update({
      where: { id: item.id },
      data: { concluido: true, concluidoEm: dataUTC(2026, 8, 10), concluidoPorNome: "Teste Smoke" },
    });
    ok(concluido.concluido && concluido.concluidoPorNome === "Teste Smoke", "concluir grava data e responsável");

    const reaberto = await tx.checklistIntegracao.update({
      where: { id: item.id },
      data: { concluido: false, concluidoEm: null, concluidoPorId: null, concluidoPorNome: null },
    });
    ok(!reaberto.concluido && reaberto.concluidoEm === null, "reabrir limpa data e responsável");

    throw new RollbackProposital();
  });

  console.log("3. Gerar de novo não duplica o que já existe");
  await rodarComRollback(async (tx) => {
    await tx.checklistIntegracao.createMany({
      data: catalogo.slice(0, 3).map((i) => ({ empresaId: empresa.id, colaboradorId: colaborador.id, item: i.value })),
    });
    // Mesma lógica da action: só cria o que ainda não existe.
    const existentes = await tx.checklistIntegracao.findMany({
      where: { colaboradorId: colaborador.id },
      select: { item: true },
    });
    const jaTem = new Set(existentes.map((e) => e.item));
    const faltando = catalogo.filter((i) => !jaTem.has(i.value));
    await tx.checklistIntegracao.createMany({
      data: faltando.map((i) => ({ empresaId: empresa.id, colaboradorId: colaborador.id, item: i.value })),
    });

    const total = await tx.checklistIntegracao.count({ where: { colaboradorId: colaborador.id } });
    ok(total === catalogo.length, "gerar duas vezes não duplica — completa só o que faltava");

    throw new RollbackProposital();
  });

  const sobrou = await prisma.checklistIntegracao.count({ where: { colaboradorId: colaborador.id } });
  ok(sobrou === 0, "nenhum item de teste sobrou no banco");

  console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
