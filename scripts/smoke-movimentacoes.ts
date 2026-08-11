// Fumaça das movimentações e do organograma contra o banco de verdade.
//
// Em transação com rollback proposital: define um líder, registra uma
// transferência de setor com histórico, e confere que a foto (Colaborador) e o
// filme (Movimentacao) nasceram juntos. Nada fica gravado.
//
//   npx tsx scripts/smoke-movimentacoes.ts
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
  const [pessoa, lider] = await prisma.colaborador.findMany({
    where: { empresaId: empresa.id, ativo: true },
    take: 2,
    select: { id: true, nome: true, setorId: true, supervisorId: true, setor: { select: { nome: true } } },
  });
  if (!pessoa || !lider) throw new Error("Preciso de ao menos 2 colaboradores ativos.");
  const outroSetor = await prisma.setor.findFirst({
    where: { empresaId: empresa.id, ativo: true, id: { not: pessoa.setorId } },
  });

  console.log(`Empresa: ${empresa.nome} · ${pessoa.nome} passa a reportar a ${lider.nome}`);
  console.log("(tudo roda em transação e termina em ROLLBACK)\n");

  try {
    await prisma.$transaction(
      async (tx) => {
        console.log("1. Definir líder (foto)");
        const comLider = await tx.colaborador.update({
          where: { id: pessoa.id },
          data: { supervisorId: lider.id },
          include: { supervisor: { select: { nome: true } }, },
        });
        ok(comLider.supervisor?.nome === lider.nome, "supervisorId gravado e relação resolvendo");

        const subordinados = await tx.colaborador.count({ where: { supervisorId: lider.id } });
        ok(subordinados >= 1, "o organograma enxerga o subordinado do líder");

        if (outroSetor) {
          console.log("2. Transferência de setor com histórico (foto + filme na mesma transação)");
          await tx.colaborador.update({ where: { id: pessoa.id }, data: { setorId: outroSetor.id } });
          const mov = await tx.movimentacao.create({
            data: {
              empresaId: empresa.id,
              colaboradorId: pessoa.id,
              tipo: "TRANSFERENCIA_SETOR",
              dataEfetiva: dataUTC(2026, 7, 25),
              setorAnteriorNome: pessoa.setor.nome,
              setorNovoId: outroSetor.id,
              setorNovoNome: outroSetor.nome,
              motivo: "smoke test",
            },
          });
          const atual = await tx.colaborador.findUnique({
            where: { id: pessoa.id },
            select: { setor: { select: { nome: true } } },
          });
          ok(atual?.setor.nome === outroSetor.nome, "a foto mudou junto com o registro");
          ok(mov.setorAnteriorNome === pessoa.setor.nome, "o filme guarda de onde a pessoa veio");

          const historico = await tx.movimentacao.count({
            where: { colaboradorId: pessoa.id, tipo: "TRANSFERENCIA_SETOR" },
          });
          ok(historico >= 1, "a aba Carreira enxerga o registro");
        } else {
          console.log("2. (pulado: empresa só tem um setor ativo)");
        }

        throw new RollbackProposital();
      },
      { timeout: 30_000 },
    );
  } catch (e) {
    if (!(e instanceof RollbackProposital)) throw e;
    console.log("\n↩ rollback executado — nada foi gravado.");
  }

  const sobrou = await prisma.movimentacao.count({ where: { motivo: "smoke test" } });
  // Compara com o estado anterior em vez de exigir supervisorId nulo: numa
  // empresa de verdade a pessoa sorteada já pode ter chefia legítima, e a
  // versão antiga acusava vazamento por causa dela.
  const depois = await prisma.colaborador.findUniqueOrThrow({
    where: { id: pessoa.id },
    select: { supervisorId: true },
  });
  const liderSobrou = depois.supervisorId === pessoa.supervisorId ? 0 : 1;
  ok(sobrou === 0, "nenhuma movimentação de teste sobrou");
  ok(liderSobrou === 0, "o vínculo de líder de teste não sobrou");

  console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
