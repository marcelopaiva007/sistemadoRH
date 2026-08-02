// Fumaça da régua de cobrança (fase 5, lib/regua-cobranca.ts — NR01/P05-ENPS/
// CLIMA) contra o banco de verdade. Em transação com rollback proposital:
// marca/empresa/setor/posição/colaboradores/pesquisas próprios do teste.
// Nada fica gravado.
//
// SMTP não configurado neste ambiente é esperado — os asserts checam a
// DETECÇÃO do passo certo (`lembretesEnviados` conta tentativa, não sucesso
// de fato; ver comentário abaixo), não o envio em si.
//
//   npx tsx scripts/smoke-regua-cobranca.ts
import "dotenv/config";
import { PrismaClient, Prisma } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { executarReguaCobranca } from "../lib/regua-cobranca";

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
const D_MENOS_3 = new Date(HOJE.getTime() - 3 * 24 * 3600 * 1000);
const D_MENOS_7 = new Date(HOJE.getTime() - 7 * 24 * 3600 * 1000);
const D_MENOS_4 = new Date(HOJE.getTime() - 4 * 24 * 3600 * 1000); // não bate nenhum passo
const D_MENOS_16 = new Date(HOJE.getTime() - 16 * 24 * 3600 * 1000); // já passou do encerramento

async function main() {
  console.log("Régua de cobrança — NR01/P05-ENPS/CLIMA\n");

  await rodarComRollback(async (tx) => {
    const marca = await tx.marca.create({ data: { nome: `__smoke_regua_marca_${Date.now()}` } });
    const empresa = await tx.empresa.create({ data: { nome: `__smoke_regua_empresa_${Date.now()}`, marcaId: marca.id } });
    const setor = await tx.setor.create({ data: { nome: "__smoke_setor", empresaId: empresa.id } });
    const posicao = await tx.posicao.create({ data: { nome: "__smoke_cargo", empresaId: empresa.id } });

    const criarPesquisa = (modelo: string, iniciadaEm: Date) =>
      tx.pesquisa.create({
        data: { marcaId: marca.id, empresaId: empresa.id, titulo: `__smoke ${modelo}`, modelo, status: "ACTIVE", iniciadaEm },
      });

    const criarColaboradorComToken = (pesquisaId: string, n: number) =>
      tx.colaborador
        .create({ data: { nome: `__smoke pessoa ${n}`, empresaId: empresa.id, setorId: setor.id, posicaoId: posicao.id, email: `smoke${n}@example.com` } })
        .then((c) => tx.surveyToken.create({ data: { pesquisaId, colaboradorId: c.id, token: `__smoke_${n}_${Math.random()}`, status: "SENT" } }));

    // No dia 3 — deve disparar LEMBRETE_1.
    const noDia3 = await criarPesquisa("NR01", D_MENOS_3);
    await criarColaboradorComToken(noDia3.id, 1);
    await criarColaboradorComToken(noDia3.id, 2);

    // No dia 4 — não bate nenhum passo (só 3, 7, 13).
    const foraDoPasso = await criarPesquisa("P05-ENPS", D_MENOS_4);
    await criarColaboradorComToken(foraDoPasso.id, 3);

    // No dia 7 — deve disparar LEMBRETE_2.
    const noDia7 = await criarPesquisa("P05-ENPS", D_MENOS_7);
    await criarColaboradorComToken(noDia7.id, 6);

    // Além do dia 15 — deve encerrar.
    const vencida = await criarPesquisa("NR01", D_MENOS_16);
    await criarColaboradorComToken(vencida.id, 4);

    // CLIMA migrou pra régua nova em 02/08/2026 — também entra, mesmo no dia 3.
    const climaNoDia3 = await criarPesquisa("CLIMA", D_MENOS_3);
    await criarColaboradorComToken(climaNoDia3.id, 5);

    const resultado = await executarReguaCobranca(tx, HOJE);
    ok(resultado.avaliadas === 5, `avalia NR01/P05-ENPS/CLIMA ACTIVE — 5 pesquisas (achou ${resultado.avaliadas})`);
    ok(resultado.encerradas === 1, `encerra a pesquisa além do dia 15 (achou ${resultado.encerradas})`);

    const noDia3Depois = await tx.pesquisa.findUniqueOrThrow({ where: { id: noDia3.id } });
    ok(noDia3Depois.status === "ACTIVE", "pesquisa no dia 3 continua ACTIVE (lembrete não fecha)");
    const noDia7Depois = await tx.pesquisa.findUniqueOrThrow({ where: { id: noDia7.id } });
    ok(noDia7Depois.status === "ACTIVE", "pesquisa no dia 7 continua ACTIVE (lembrete não fecha)");

    const vencidaDepois = await tx.pesquisa.findUniqueOrThrow({ where: { id: vencida.id } });
    ok(vencidaDepois.status === "FINISHED" && vencidaDepois.encerradaEm !== null, "pesquisa vencida vira FINISHED com data de encerramento");

    const climaDepois = await tx.pesquisa.findUniqueOrThrow({ where: { id: climaNoDia3.id } });
    ok(climaDepois.status === "ACTIVE", "CLIMA no dia 3 continua ACTIVE (lembrete não fecha, também vale pra CLIMA agora)");

    // Rodar de novo no mesmo dia não fecha de novo nem duplica (idempotente).
    const segunda = await executarReguaCobranca(tx, HOJE);
    ok(segunda.avaliadas === 4, `2ª rodada só vê as 4 ainda ACTIVE (achou ${segunda.avaliadas})`);

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
