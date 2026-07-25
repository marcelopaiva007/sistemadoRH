// Fumaça de acidentes/CAT contra o banco de verdade. Em transação com rollback
// proposital: acidente vinculado a um afastamento (Ausencia tipo
// ACIDENTE_TRABALHO), emissão de CAT, conclusão da investigação, e a guarda
// contra vincular a mesma ausência duas vezes. Nada fica gravado.
//
//   npx tsx scripts/smoke-cat.ts
import "dotenv/config";
import { PrismaClient, Prisma } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { dataUTC } from "../lib/datas";

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

  console.log("1. Acidente com afastamento vinculado, CAT emitida, investigação concluída");
  await rodarComRollback(async (tx) => {
    const ausencia = await tx.ausencia.create({
      data: {
        empresaId: empresa.id,
        colaboradorId: colaborador.id,
        tipo: "ACIDENTE_TRABALHO",
        dataInicio: dataUTC(2026, 6, 1),
        dataFim: dataUTC(2026, 6, 10),
        dias: 10,
        abonada: true,
        status: "APROVADA",
      },
    });

    const acidente = await tx.acidenteTrabalho.create({
      data: {
        empresaId: empresa.id,
        colaboradorId: colaborador.id,
        dataHora: dataUTC(2026, 6, 1),
        tipo: "TIPICO",
        descricao: "Queda de escada durante manutenção em poste.",
        houveAfastamento: true,
        ausenciaId: ausencia.id,
      },
    });
    ok(acidente.situacao === "EM_INVESTIGACAO", "acidente nasce em investigação");
    ok(acidente.catEmitida === false, "CAT nasce pendente");

    const comCat = await tx.acidenteTrabalho.update({
      where: { id: acidente.id },
      data: { catEmitida: true, catNumero: "CAT-TESTE-001", catEmitidaEm: dataUTC(2026, 6, 2) },
    });
    ok(comCat.catEmitida && comCat.catNumero === "CAT-TESTE-001", "CAT registrada com número e data");

    const concluido = await tx.acidenteTrabalho.update({
      where: { id: acidente.id },
      data: { situacao: "CONCLUIDO", medidasCorretivas: "Escada trocada por modelo antiderrapante." },
    });
    ok(concluido.situacao === "CONCLUIDO", "investigação concluída");

    const ausenciaComAcidente = await tx.ausencia.findUnique({
      where: { id: ausencia.id },
      select: { acidente: { select: { id: true } } },
    });
    ok(ausenciaComAcidente?.acidente?.id === acidente.id, "a ausência enxerga o acidente vinculado (back-relation)");

    throw new RollbackProposital();
  });

  console.log("2. Não vincula a mesma ausência a dois acidentes (constraint UNIQUE)");
  await rodarComRollback(async (tx) => {
    const ausencia = await tx.ausencia.create({
      data: {
        empresaId: empresa.id,
        colaboradorId: colaborador.id,
        tipo: "ACIDENTE_TRABALHO",
        dataInicio: dataUTC(2026, 5, 1),
        dataFim: dataUTC(2026, 5, 3),
        dias: 3,
        abonada: true,
        status: "APROVADA",
      },
    });
    await tx.acidenteTrabalho.create({
      data: {
        empresaId: empresa.id,
        colaboradorId: colaborador.id,
        dataHora: dataUTC(2026, 5, 1),
        tipo: "TRAJETO",
        descricao: "Primeiro registro.",
        houveAfastamento: true,
        ausenciaId: ausencia.id,
      },
    });
    try {
      await tx.acidenteTrabalho.create({
        data: {
          empresaId: empresa.id,
          colaboradorId: colaborador.id,
          dataHora: dataUTC(2026, 5, 1),
          tipo: "TRAJETO",
          descricao: "Tentativa de vincular a mesma ausência de novo.",
          houveAfastamento: true,
          ausenciaId: ausencia.id,
        },
      });
      ok(false, "deveria ter sido recusado");
    } catch (e) {
      ok(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002", "a constraint UNIQUE impede duas ligações à mesma ausência");
    }
    throw new RollbackProposital();
  });

  console.log("3. Excluir o acidente não apaga a ausência (afastamento é dado independente)");
  await rodarComRollback(async (tx) => {
    const ausencia = await tx.ausencia.create({
      data: {
        empresaId: empresa.id,
        colaboradorId: colaborador.id,
        tipo: "ACIDENTE_TRABALHO",
        dataInicio: dataUTC(2026, 4, 1),
        dataFim: dataUTC(2026, 4, 2),
        dias: 2,
        abonada: true,
        status: "APROVADA",
      },
    });
    const acidente = await tx.acidenteTrabalho.create({
      data: {
        empresaId: empresa.id,
        colaboradorId: colaborador.id,
        dataHora: dataUTC(2026, 4, 1),
        tipo: "TIPICO",
        descricao: "Registro a ser excluído.",
        ausenciaId: ausencia.id,
      },
    });
    await tx.acidenteTrabalho.delete({ where: { id: acidente.id } });
    const ausenciaSobrou = await tx.ausencia.count({ where: { id: ausencia.id } });
    ok(ausenciaSobrou === 1, "a ausência continua existindo depois de excluir o acidente");
    throw new RollbackProposital();
  });

  const sobrouAcidente = await prisma.acidenteTrabalho.count({ where: { colaboradorId: colaborador.id, descricao: { contains: "escada" } } });
  const sobrouAusencia = await prisma.ausencia.count({ where: { colaboradorId: colaborador.id, dataInicio: dataUTC(2026, 6, 1) } });
  ok(sobrouAcidente === 0, "nenhum acidente de teste sobrou no banco");
  ok(sobrouAusencia === 0, "nenhuma ausência de teste sobrou no banco");

  console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
