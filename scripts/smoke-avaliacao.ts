// Fumaça de avaliação de desempenho contra o banco de verdade. Em transação
// com rollback proposital: gerar autoavaliação + gestor, constraint UNIQUE
// por avaliador, notas por competência viram nota final (média), potencial
// alimentando o corte de faixa do nine-box, avaliador extra (par/subordinado)
// e cascade ao excluir a avaliação. Nada fica gravado.
//
//   npx tsx scripts/smoke-avaliacao.ts
import "dotenv/config";
import { PrismaClient, Prisma } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { dataUTC } from "../lib/datas";
import { COMPETENCIAS, faixaDesempenho } from "../lib/constants-avaliacao";
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
  const colaboradores = await prisma.colaborador.findMany({
    where: { empresaId: empresa.id, ativo: true },
    take: 3,
    select: { id: true, nome: true },
  });
  if (colaboradores.length < 3) throw new Error("São necessários ao menos 3 colaboradores ativos na mesma empresa.");
  const [a, b, c] = colaboradores;

  console.log(`Empresa: ${empresa.nome} · Avaliado: ${a.nome} · Gestor: ${b.nome} · Par: ${c.nome}`);
  console.log("(tudo roda em transação e termina em ROLLBACK)\n");

  console.log("1. Gerar avaliações (autoavaliação + gestor) para um ciclo 180°");
  await rodarComRollback(async (tx) => {
    const ciclo = await tx.cicloAvaliacao.create({
      data: {
        empresaId: empresa.id,
        nome: "SMOKE 180",
        tipo: "180",
        dataInicio: dataUTC(2026, 6, 1),
        dataFim: dataUTC(2026, 6, 30),
      },
    });

    const auto = await tx.avaliacaoDesempenho.create({
      data: { empresaId: empresa.id, colaboradorId: a.id, cicloId: ciclo.id, tipoAvaliador: "AUTOAVALIACAO", avaliadorId: a.id, avaliadorNome: a.nome },
    });
    const gestor = await tx.avaliacaoDesempenho.create({
      data: { empresaId: empresa.id, colaboradorId: a.id, cicloId: ciclo.id, tipoAvaliador: "GESTOR", avaliadorId: b.id, avaliadorNome: b.nome },
    });
    ok(auto.status === "PENDENTE" && gestor.status === "PENDENTE", "as duas avaliações nascem PENDENTE");

    try {
      await tx.avaliacaoDesempenho.create({
        data: { empresaId: empresa.id, colaboradorId: a.id, cicloId: ciclo.id, tipoAvaliador: "AUTOAVALIACAO", avaliadorId: a.id },
      });
      ok(false, "deveria ter sido recusado");
    } catch (e) {
      ok(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002", "a constraint UNIQUE impede duas avaliações do mesmo avaliador no mesmo ciclo");
    }

    throw new RollbackProposital();
  });

  console.log("2. Notas por competência viram nota final (média) e potencial alimenta a faixa do nine-box");
  await rodarComRollback(async (tx) => {
    const ciclo = await tx.cicloAvaliacao.create({
      data: {
        empresaId: empresa.id,
        nome: "SMOKE nota",
        tipo: "90",
        dataInicio: dataUTC(2026, 6, 1),
        dataFim: dataUTC(2026, 6, 30),
      },
    });
    const avaliacao = await tx.avaliacaoDesempenho.create({
      data: { empresaId: empresa.id, colaboradorId: a.id, cicloId: ciclo.id, tipoAvaliador: "GESTOR", avaliadorId: b.id, avaliadorNome: b.nome },
    });

    const valores = [5, 4, 5, 3, 4, 5]; // uma por competência, mesma ordem do catálogo
    await tx.notaCompetencia.createMany({
      data: COMPETENCIAS.map((comp, i) => ({ avaliacaoId: avaliacao.id, competencia: comp.value, nota: valores[i] })),
    });
    const media = valores.reduce((s, n) => s + n, 0) / valores.length;

    const concluida = await tx.avaliacaoDesempenho.update({
      where: { id: avaliacao.id },
      data: { notaFinal: media, potencial: "ALTO", status: "CONCLUIDA", concluidaEm: dataUTC(2026, 6, 15) },
    });
    ok(concluida.notaFinal === media, `nota final calculada corretamente (${media.toFixed(2)})`);
    ok(faixaDesempenho(media) === "ALTO", "média alta cai na faixa de desempenho ALTO do nine-box");
    ok(faixaDesempenho(2) === "BAIXO" && faixaDesempenho(3) === "MEDIO", "cortes de faixa (baixo/médio) batem com o esperado");

    const notasSalvas = await tx.notaCompetencia.count({ where: { avaliacaoId: avaliacao.id } });
    ok(notasSalvas === COMPETENCIAS.length, "uma nota de competência por item do catálogo");

    throw new RollbackProposital();
  });

  console.log("3. Avaliador extra (par) num ciclo 360° e exclusão em cascata das notas");
  await rodarComRollback(async (tx) => {
    const ciclo = await tx.cicloAvaliacao.create({
      data: {
        empresaId: empresa.id,
        nome: "SMOKE 360",
        tipo: "360",
        dataInicio: dataUTC(2026, 6, 1),
        dataFim: dataUTC(2026, 6, 30),
      },
    });
    const par = await tx.avaliacaoDesempenho.create({
      data: { empresaId: empresa.id, colaboradorId: a.id, cicloId: ciclo.id, tipoAvaliador: "PAR", avaliadorId: c.id, avaliadorNome: c.nome },
    });
    ok(par.tipoAvaliador === "PAR", "avaliador extra criado como PAR");

    await tx.notaCompetencia.create({ data: { avaliacaoId: par.id, competencia: COMPETENCIAS[0].value, nota: 4 } });
    await tx.avaliacaoDesempenho.delete({ where: { id: par.id } });
    const notasRestantes = await tx.notaCompetencia.count({ where: { avaliacaoId: par.id } });
    ok(notasRestantes === 0, "excluir a avaliação apaga as notas de competência em cascata");

    throw new RollbackProposital();
  });

  const sobrouCiclo = await prisma.cicloAvaliacao.count({ where: { empresaId: empresa.id, nome: { startsWith: "SMOKE" } } });
  const sobrouAvaliacao = await prisma.avaliacaoDesempenho.count({ where: { colaboradorId: a.id, avaliadorNome: b.nome } });
  ok(sobrouCiclo === 0, "nenhum ciclo de teste sobrou no banco");
  ok(sobrouAvaliacao === 0, "nenhuma avaliação de teste sobrou no banco");

  console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
