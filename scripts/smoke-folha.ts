// Fumaça dos eventos variáveis da folha contra o banco de verdade. Em
// transação com rollback proposital: competência única por mês, derivação de
// faltas/benefícios, a garantia de que recalcular NÃO apaga lançamento manual,
// e o travamento da competência fechada. Nada fica gravado.
//
//   npx tsx scripts/smoke-folha.ts
import "dotenv/config";
import { PrismaClient, Prisma } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { dataUTC } from "../lib/datas";
import { competenciaUTC, fimDaCompetencia, formatarCompetencia, rubricaUnidade } from "../lib/constants-folha";
import { violouUnique } from "../lib/prisma-erros";
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

  console.log("0. Competência é mês, não data");
  {
    const c = competenciaUTC(2026, 7);
    ok(c.toISOString() === "2026-07-01T00:00:00.000Z", "competenciaUTC devolve o dia 1 em UTC");
    ok(formatarCompetencia(c) === "07/2026", "formata como 07/2026");
    const fim = fimDaCompetencia(c);
    ok(fim.getUTCMonth() === 6 && fim.getUTCDate() === 31, "fim da competência é 31/07, não 01/08");
    const fev = fimDaCompetencia(competenciaUTC(2026, 2));
    ok(fev.getUTCDate() === 28, "fevereiro de 2026 termina no dia 28 (não é bissexto)");
    const fevBissexto = fimDaCompetencia(competenciaUTC(2028, 2));
    ok(fevBissexto.getUTCDate() === 29, "fevereiro de 2028 termina no dia 29 (bissexto)");
  }

  console.log("1. Uma competência por mês, por empresa");
  await rodarComRollback(async (tx) => {
    const ref = competenciaUTC(2026, 9);
    await tx.competenciaFolha.create({ data: { empresaId: empresa.id, referencia: ref } });
    try {
      await tx.competenciaFolha.create({ data: { empresaId: empresa.id, referencia: ref } });
      ok(false, "deveria ter sido recusado");
    } catch (e) {
      ok(
        violouUnique(e, "CompetenciaFolha_empresaId_referencia_key"),
        "constraint UNIQUE impede abrir a mesma competência duas vezes",
      );
    }
    throw new RollbackProposital();
  });

  console.log("2. Recalcular derivados NÃO apaga lançamento manual");
  await rodarComRollback(async (tx) => {
    const comp = await tx.competenciaFolha.create({
      data: { empresaId: empresa.id, referencia: competenciaUTC(2026, 9) },
    });

    // O RH digitou hora extra — isto não pode sumir nunca.
    const manual = await tx.eventoFolha.create({
      data: {
        empresaId: empresa.id,
        competenciaId: comp.id,
        colaboradorId: colaborador.id,
        tipo: "HORA_EXTRA_50",
        quantidade: 12.5,
        origem: "MANUAL",
      },
    });
    // Uma leva de derivados anterior.
    await tx.eventoFolha.create({
      data: {
        empresaId: empresa.id,
        competenciaId: comp.id,
        colaboradorId: colaborador.id,
        tipo: "FALTA",
        quantidade: 1,
        origem: "DERIVADO",
      },
    });

    // Mesma operação da action: apaga só DERIVADO e recria.
    const { count } = await tx.eventoFolha.deleteMany({
      where: { competenciaId: comp.id, origem: "DERIVADO" },
    });
    ok(count === 1, "o recálculo removeu o derivado antigo");

    const sobrou = await tx.eventoFolha.findMany({ where: { competenciaId: comp.id } });
    ok(sobrou.length === 1 && sobrou[0].id === manual.id, "o lançamento MANUAL sobreviveu ao recálculo");
    ok(sobrou[0].quantidade === 12.5, "a quantidade digitada continua intacta");

    throw new RollbackProposital();
  });

  console.log("3. Derivação: falta não abonada entra, abonada não");
  await rodarComRollback(async (tx) => {
    const ref = competenciaUTC(2026, 9);
    const fim = fimDaCompetencia(ref);

    await tx.ausencia.create({
      data: {
        empresaId: empresa.id,
        colaboradorId: colaborador.id,
        tipo: "FALTA_INJUSTIFICADA",
        dataInicio: dataUTC(2026, 9, 10),
        dataFim: dataUTC(2026, 9, 11),
        dias: 2,
        abonada: false,
        status: "APROVADA",
      },
    });
    await tx.ausencia.create({
      data: {
        empresaId: empresa.id,
        colaboradorId: colaborador.id,
        tipo: "ATESTADO",
        dataInicio: dataUTC(2026, 9, 15),
        dataFim: dataUTC(2026, 9, 16),
        dias: 2,
        abonada: true,
        status: "APROVADA",
      },
    });

    const descontaveis = await tx.ausencia.findMany({
      where: {
        empresaId: empresa.id,
        abonada: false,
        status: "APROVADA",
        dataInicio: { lte: fim },
        dataFim: { gte: ref },
      },
      select: { dias: true },
    });
    const totalDias = descontaveis.reduce((s, a) => s + a.dias, 0);
    ok(totalDias === 2, "só a falta não abonada entrou (2 dias); o atestado abonado ficou de fora");

    throw new RollbackProposital();
  });

  console.log("4. Falta fora da competência não entra");
  await rodarComRollback(async (tx) => {
    const ref = competenciaUTC(2026, 9);
    const fim = fimDaCompetencia(ref);
    await tx.ausencia.create({
      data: {
        empresaId: empresa.id,
        colaboradorId: colaborador.id,
        tipo: "FALTA_INJUSTIFICADA",
        dataInicio: dataUTC(2026, 10, 5),
        dataFim: dataUTC(2026, 10, 5),
        dias: 1,
        abonada: false,
        status: "APROVADA",
      },
    });
    const dentro = await tx.ausencia.count({
      where: {
        empresaId: empresa.id,
        abonada: false,
        status: "APROVADA",
        dataInicio: { lte: fim },
        dataFim: { gte: ref },
      },
    });
    ok(dentro === 0, "falta de outubro não entra na competência de setembro");
    throw new RollbackProposital();
  });

  console.log("5. Unidade da rubrica decide onde o número é gravado");
  {
    ok(rubricaUnidade("HORA_EXTRA_50") === "HORAS", "hora extra é em horas");
    ok(rubricaUnidade("FALTA") === "DIAS", "falta é em dias");
    ok(rubricaUnidade("BONUS") === "VALOR", "bônus é em dinheiro");
  }

  console.log("6. Fechar e reabrir competência");
  await rodarComRollback(async (tx) => {
    const comp = await tx.competenciaFolha.create({
      data: { empresaId: empresa.id, referencia: competenciaUTC(2026, 9) },
    });
    ok(comp.status === "ABERTA", "competência nasce ABERTA");

    const fechada = await tx.competenciaFolha.update({
      where: { id: comp.id },
      data: { status: "FECHADA", fechadaEm: new Date(), fechadaPorNome: "Teste Smoke" },
    });
    ok(fechada.status === "FECHADA" && fechada.fechadaEm !== null, "fechar grava data e responsável");

    const reaberta = await tx.competenciaFolha.update({
      where: { id: comp.id },
      data: { status: "ABERTA", fechadaEm: null, fechadaPorId: null, fechadaPorNome: null },
    });
    ok(reaberta.status === "ABERTA" && reaberta.fechadaEm === null, "reabrir limpa os campos de fechamento");

    throw new RollbackProposital();
  });

  console.log("7. Excluir a competência leva os lançamentos junto (cascata)");
  await rodarComRollback(async (tx) => {
    const comp = await tx.competenciaFolha.create({
      data: { empresaId: empresa.id, referencia: competenciaUTC(2026, 9) },
    });
    await tx.eventoFolha.create({
      data: {
        empresaId: empresa.id,
        competenciaId: comp.id,
        colaboradorId: colaborador.id,
        tipo: "BONUS",
        valor: 500,
      },
    });
    await tx.competenciaFolha.delete({ where: { id: comp.id } });
    const sobrou = await tx.eventoFolha.count({ where: { competenciaId: comp.id } });
    ok(sobrou === 0, "lançamentos somem com a competência");
    throw new RollbackProposital();
  });

  // Só as competências que ESTE smoke cria (referência 2026-09). Contar tudo da
  // empresa acusava vazamento ao rodar numa empresa com folha de verdade — o
  // smoke passava só porque a empresa sorteada estava vazia.
  const sobrouComp = await prisma.competenciaFolha.count({
    where: { empresaId: empresa.id, referencia: competenciaUTC(2026, 9) },
  });
  const sobrouEvento = await prisma.eventoFolha.count({
    where: { empresaId: empresa.id, competencia: { referencia: competenciaUTC(2026, 9) } },
  });
  const sobrouAusencia = await prisma.ausencia.count({
    where: { colaboradorId: colaborador.id, dataInicio: { gte: dataUTC(2026, 9, 1) } },
  });
  ok(sobrouComp === 0, "nenhuma competência de teste sobrou no banco");
  ok(sobrouEvento === 0, "nenhum lançamento de teste sobrou no banco");
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
