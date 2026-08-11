// Fumaça do onboarding D+30 (fase 4, lib/pesquisa-onboarding.ts — P06-ONB30)
// contra o banco de verdade. Em transação com rollback proposital: marca/
// empresa/setor/posição/colaboradores próprios do teste. Nada fica gravado.
//
//   npx tsx scripts/smoke-pesquisa-onboarding.ts
import "dotenv/config";
import { PrismaClient, Prisma } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { executarCicloOnboarding } from "../lib/pesquisa-onboarding";

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
const D_30 = new Date(HOJE.getTime() - 30 * 24 * 3600 * 1000);
const D_29 = new Date(HOJE.getTime() - 29 * 24 * 3600 * 1000);
const D_60 = new Date(HOJE.getTime() - 60 * 24 * 3600 * 1000);

async function main() {
  console.log("P06-ONB30 — gatilho por evento (D+30 da admissão)\n");

  await rodarComRollback(async (tx) => {
    const marca = await tx.marca.create({ data: { nome: `__smoke_onb_marca_${Date.now()}` } });
    const empresa = await tx.empresa.create({ data: { nome: `__smoke_onb_empresa_${Date.now()}`, marcaId: marca.id } });
    const setor = await tx.setor.create({ data: { nome: "__smoke_setor", empresaId: empresa.id } });
    const posicao = await tx.posicao.create({ data: { nome: "__smoke_cargo", empresaId: empresa.id } });

    const criar = (nome: string, dataAdmissao: Date, ativo = true) =>
      tx.colaborador.create({ data: { nome, empresaId: empresa.id, setorId: setor.id, posicaoId: posicao.id, dataAdmissao, ativo } });

    const noAlvo = await criar("__smoke completou 30 dias hoje", D_30);
    await criar("__smoke 29 dias, ainda não bateu", D_29);
    await criar("__smoke 60 dias, já passou do gatilho", D_60);
    await criar("__smoke completou 30 dias mas já foi desligado", D_30, false);

    const resultado = await executarCicloOnboarding(tx, HOJE);
    ok(resultado.convidados.length === 1, `convida só quem completou 30 dias hoje (achou ${resultado.convidados.length})`);
    ok(resultado.convidados[0]?.colaboradorNome === noAlvo.nome, "é a pessoa certa");

    const pesquisa = await tx.pesquisa.findFirstOrThrow({ where: { marcaId: marca.id, modelo: "P06-ONB30" } });
    ok(pesquisa.status === "ACTIVE", "campanha nasce ACTIVE (sem aprovação manual — convite já sai)");
    ok(pesquisa.anonima === false, "não é anônima, como no catálogo");

    const perguntas = await tx.pergunta.findMany({ where: { pesquisaId: pesquisa.id } });
    ok(perguntas.length === 12, `12 perguntas do seed criadas (achou ${perguntas.length})`);

    const token = await tx.surveyToken.findFirst({ where: { pesquisaId: pesquisa.id, colaboradorId: noAlvo.id } });
    ok(token?.status === "PENDING", "convite criado como PENDING — envio automático (lib/convites.ts) cuida do resto");

    // Reprocessar o mesmo dia não duplica nem quebra (upsert idempotente).
    const segundaRodada = await executarCicloOnboarding(tx, HOJE);
    const tokensDepois = await tx.surveyToken.count({ where: { pesquisaId: pesquisa.id, colaboradorId: noAlvo.id } });
    ok(segundaRodada.convidados.length === 1 && tokensDepois === 1, "rodar de novo no mesmo dia não duplica o convite");

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
