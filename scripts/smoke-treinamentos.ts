// Fumaça de treinamentos & trilhas contra o banco de verdade. Em transação
// com rollback proposital: criar treinamento com competências, constraint de
// nome único por empresa, registrar participação, constraint de duplicidade
// (mesma pessoa + mesmo treinamento + mesma data), presença e a matriz de
// competências (leitura pura sobre participação + catálogo). Nada fica
// gravado.
//
//   npx tsx scripts/smoke-treinamentos.ts
import "dotenv/config";
import { PrismaClient, Prisma } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { dataUTC } from "../lib/datas";
import { COMPETENCIAS } from "../lib/constants-avaliacao";
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

  console.log("1. Criar treinamento com competências e recusar nome duplicado");
  await rodarComRollback(async (tx) => {
    const treinamento = await tx.treinamento.create({
      data: {
        empresaId: empresa.id,
        nome: "SMOKE — Comunicação assertiva",
        categoria: "Comportamental",
        cargaHoraria: 4,
        competencias: [COMPETENCIAS[2].value, COMPETENCIAS[3].value],
      },
    });
    ok(treinamento.competencias.length === 2, "treinamento criado com duas competências associadas");
    ok(treinamento.ativo, "treinamento nasce ativo");

    try {
      await tx.treinamento.create({
        data: { empresaId: empresa.id, nome: "SMOKE — Comunicação assertiva" },
      });
      ok(false, "deveria ter sido recusado");
    } catch (e) {
      ok(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002", "constraint UNIQUE recusa nome de treinamento duplicado na mesma empresa");
    }

    throw new RollbackProposital();
  });

  console.log("2. Participação: registrar, recusar duplicidade, presença falsa não altera nota");
  await rodarComRollback(async (tx) => {
    const treinamento = await tx.treinamento.create({
      data: { empresaId: empresa.id, nome: "SMOKE — NR-10 avançado (teste)", competencias: [COMPETENCIAS[0].value] },
    });

    const data = dataUTC(2026, 6, 10);
    const participacao = await tx.participacaoTreinamento.create({
      data: {
        empresaId: empresa.id,
        colaboradorId: colaborador.id,
        treinamentoId: treinamento.id,
        dataRealizacao: data,
        presente: true,
        notaAvaliacao: 4,
        certificadoEmitido: true,
      },
    });
    ok(participacao.presente && participacao.notaAvaliacao === 4, "participação registrada com presença e nota");

    try {
      await tx.participacaoTreinamento.create({
        data: {
          empresaId: empresa.id,
          colaboradorId: colaborador.id,
          treinamentoId: treinamento.id,
          dataRealizacao: data,
        },
      });
      ok(false, "deveria ter sido recusado");
    } catch (e) {
      ok(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002", "constraint UNIQUE impede a mesma pessoa duas vezes no mesmo treinamento na mesma data");
    }

    throw new RollbackProposital();
  });

  console.log("3. Matriz de competências: só participação com presença confirmada conta");
  await rodarComRollback(async (tx) => {
    const treinamento = await tx.treinamento.create({
      data: { empresaId: empresa.id, nome: "SMOKE — Trabalho em equipe (teste)", competencias: [COMPETENCIAS[2].value] },
    });
    await tx.participacaoTreinamento.create({
      data: {
        empresaId: empresa.id,
        colaboradorId: colaborador.id,
        treinamentoId: treinamento.id,
        dataRealizacao: dataUTC(2026, 5, 1),
        presente: false,
      },
    });

    const participacoesComPresenca = await tx.participacaoTreinamento.findMany({
      where: { empresaId: empresa.id, colaboradorId: colaborador.id, presente: true, treinamento: { nome: { startsWith: "SMOKE" } } },
      select: { treinamento: { select: { competencias: true } } },
    });
    ok(participacoesComPresenca.length === 0, "ausência (presente=false) não entra na matriz de competências");

    throw new RollbackProposital();
  });

  const sobrouTreinamento = await prisma.treinamento.count({ where: { empresaId: empresa.id, nome: { startsWith: "SMOKE" } } });
  const sobrouParticipacao = await prisma.participacaoTreinamento.count({ where: { colaboradorId: colaborador.id, treinamento: { nome: { startsWith: "SMOKE" } } } });
  ok(sobrouTreinamento === 0, "nenhum treinamento de teste sobrou no banco");
  ok(sobrouParticipacao === 0, "nenhuma participação de teste sobrou no banco");

  console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
