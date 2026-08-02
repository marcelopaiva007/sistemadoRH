// Fumaça do pulso mensal de eNPS (fase 4, lib/pesquisa-enps.ts — P05-ENPS)
// contra o banco de verdade. Em transação com rollback proposital: marca/
// empresa próprios do teste. Nada fica gravado.
//
//   npx tsx scripts/smoke-pesquisa-enps.ts
import "dotenv/config";
import { PrismaClient, Prisma } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { coletarCandidatosEnps, criarPulsoEnps } from "../lib/pesquisa-enps";

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

const HOJE = new Date();

async function main() {
  console.log("P05-ENPS — candidatos e criação do pulso mensal\n");

  await rodarComRollback(async (tx) => {
    const marca = await tx.marca.create({ data: { nome: `__smoke_enps_marca_${Date.now()}` } });
    const empresa = await tx.empresa.create({ data: { nome: `__smoke_enps_empresa_${Date.now()}`, marcaId: marca.id } });

    const antes = await coletarCandidatosEnps(tx, HOJE);
    ok(antes.some((c) => c.marcaId === marca.id), "marca nova entra como candidata (sem eNPS este mês)");

    const { pesquisaId, titulo } = await criarPulsoEnps(
      { marcaId: marca.id, marcaNome: marca.nome, empresaId: empresa.id, empresaNome: empresa.nome },
      HOJE,
      tx,
    );
    ok(titulo.startsWith("eNPS —"), `título gerado (${titulo})`);

    const pesquisa = await tx.pesquisa.findUniqueOrThrow({ where: { id: pesquisaId } });
    ok(pesquisa.status === "DRAFT", "nasce em DRAFT — RH aprova antes de sair");
    ok(pesquisa.modelo === "P05-ENPS", "modelo gravado como P05-ENPS");
    ok(pesquisa.anonima === true, "anônima, como no catálogo");

    const perguntas = await tx.pergunta.findMany({ where: { pesquisaId }, orderBy: { ordem: "asc" } });
    ok(perguntas.length === 3, `3 perguntas criadas (achou ${perguntas.length})`);
    ok(perguntas[0].tipo === "NPS_10" && perguntas[0].obrigatoria, "1ª pergunta é NPS_10 obrigatória");
    ok(
      perguntas.slice(1).every((p) => p.tipo === "TEXT" && !p.obrigatoria),
      "as 2 seguintes são texto livre, opcionais",
    );

    const depois = await coletarCandidatosEnps(tx, HOJE);
    ok(!depois.some((c) => c.marcaId === marca.id), "marca some da lista de candidatas no mesmo mês (não duplica)");

    throw new RollbackProposital();
  });

  console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
