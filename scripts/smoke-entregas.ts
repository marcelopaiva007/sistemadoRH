// Fumaça de entregas ao colaborador contra o banco de verdade. Em transação
// com rollback proposital: lote para várias pessoas, confirmação vinda do
// colaborador, devolução, e a fila "quem ainda não confirmou". Nada fica
// gravado.
//
// O que este smoke protege que o teste puro não alcança: a fila de cobrança é
// uma CONSULTA (confirmadoEm: null, devolvidoEm: null), não uma função. Se o
// índice ou a coluna mudarem de nome, o teste puro continua verde e o portal
// para de pedir confirmação em silêncio — que é o pior jeito de quebrar, já
// que a tela simplesmente não mostra nada.
//
//   npx tsx scripts/smoke-entregas.ts
import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { dataUTC } from "../lib/datas";
import { aguardandoConfirmacao, situacaoDaEntrega } from "../lib/constants-entregas";
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
  const empresa = await empresaDeTeste(prisma, { colaboradoresAtivos: 2 });
  const pessoas = await prisma.colaborador.findMany({
    where: { empresaId: empresa.id, ativo: true },
    orderBy: { nome: "asc" },
    take: 2,
    select: { id: true, nome: true },
  });

  console.log(`Empresa: ${empresa.nome} · ${pessoas.map((p) => p.nome).join(", ")}`);
  console.log("(tudo roda em transação e termina em ROLLBACK)\n");

  try {
    await prisma.$transaction(
      async (tx) => {
        console.log("1. Lote: a mesma entrega para todo mundo de uma vez");
        const criadas = await tx.entregaAoColaborador.createMany({
          data: pessoas.map((p) => ({
            empresaId: empresa.id,
            colaboradorId: p.id,
            tipo: "CARTAO_BENEFICIOS",
            descricao: "Cartão de teste · smoke",
            dataEntrega: dataUTC(2026, 8, 15),
            entreguePorNome: "Smoke",
          })),
        });
        ok(criadas.count === pessoas.length, `${criadas.count} entregas criadas em um lançamento`);

        const doLote = await tx.entregaAoColaborador.findMany({
          where: { empresaId: empresa.id, descricao: "Cartão de teste · smoke" },
          select: { id: true, colaboradorId: true, confirmadoEm: true, devolvidoEm: true },
        });
        ok(
          doLote.every((e) => aguardandoConfirmacao(e)),
          "recém-criadas nascem aguardando confirmação (confirmadoEm nulo)",
        );
        ok(
          pessoas.every((p) => doLote.some((e) => e.colaboradorId === p.id)),
          "cada pessoa do lote ganhou a sua entrega",
        );

        console.log("2. A fila que o portal lê para cobrar cada pessoa");
        const daPrimeira = doLote.find((e) => e.colaboradorId === pessoas[0].id)!;
        const filaDaPrimeira = await tx.entregaAoColaborador.findMany({
          where: { colaboradorId: pessoas[0].id, confirmadoEm: null, devolvidoEm: null },
          select: { id: true, colaboradorId: true },
        });
        ok(
          filaDaPrimeira.some((e) => e.id === daPrimeira.id),
          "a entrega aparece na fila de confirmação da própria pessoa",
        );
        ok(
          filaDaPrimeira.every((e) => e.colaboradorId === pessoas[0].id),
          "a fila de uma pessoa nunca traz entrega de outra",
        );

        console.log("3. Confirmação vinda do colaborador");
        const alvo = daPrimeira;
        await tx.entregaAoColaborador.update({
          where: { id: alvo.id },
          data: { confirmadoEm: new Date(), confirmadoIp: "203.0.113.7" },
        });
        const confirmada = await tx.entregaAoColaborador.findUniqueOrThrow({
          where: { id: alvo.id },
          select: { confirmadoEm: true, devolvidoEm: true, confirmadoIp: true },
        });
        ok(situacaoDaEntrega(confirmada) === "CONFIRMADA", "a linha passa a CONFIRMADA");
        ok(confirmada.confirmadoIp === "203.0.113.7", "o IP da confirmação fica gravado");
        const filaDepois = await tx.entregaAoColaborador.count({
          where: { id: alvo.id, confirmadoEm: null, devolvidoEm: null },
        });
        ok(filaDepois === 0, "confirmada sai da fila de cobrança do portal");

        console.log("4. Devolução ganha de confirmação");
        await tx.entregaAoColaborador.update({
          where: { id: alvo.id },
          data: { devolvidoEm: new Date() },
        });
        const devolvida = await tx.entregaAoColaborador.findUniqueOrThrow({
          where: { id: alvo.id },
          select: { confirmadoEm: true, devolvidoEm: true },
        });
        ok(
          situacaoDaEntrega(devolvida) === "DEVOLVIDA",
          "item que voltou é DEVOLVIDA mesmo tendo sido confirmada antes",
        );

        console.log("5. Nunca cobrar confirmação de item já devolvido");
        const semConfirmarEDevolvida = await tx.entregaAoColaborador.create({
          data: {
            empresaId: empresa.id,
            colaboradorId: pessoas[1].id,
            tipo: "NOTEBOOK",
            descricao: "Notebook de teste · smoke",
            dataEntrega: dataUTC(2026, 8, 10),
            devolvidoEm: new Date(),
          },
          select: { id: true, confirmadoEm: true, devolvidoEm: true },
        });
        ok(
          !aguardandoConfirmacao(semConfirmarEDevolvida),
          "devolvido sem confirmar não volta a ser cobrado da pessoa",
        );
        const naFila = await tx.entregaAoColaborador.count({
          where: { id: semConfirmarEDevolvida.id, confirmadoEm: null, devolvidoEm: null },
        });
        ok(naFila === 0, "a consulta do portal concorda com a regra pura");

        throw new RollbackProposital();
      },
      { timeout: 30_000 },
    );
  } catch (e) {
    if (!(e instanceof RollbackProposital)) throw e;
    console.log("\n↩︎  Rollback aplicado — o banco ficou como estava.");
  }

  const sobrou = await prisma.entregaAoColaborador.count({
    where: { descricao: { in: ["Cartão de teste · smoke", "Notebook de teste · smoke"] } },
  });
  ok(sobrou === 0, "nada do smoke ficou gravado");

  console.log(falhas === 0 ? "\n✅ Entregas: tudo certo\n" : `\n❌ ${falhas} falha(s)\n`);
  process.exit(falhas === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
