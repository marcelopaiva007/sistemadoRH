// Fumaça da pesquisa de desligamento (fase 4, lib/pesquisa-desligamento.ts —
// P09-OFF) contra o banco de verdade. Em transação com rollback proposital:
// marca/empresa/setor/posição/colaborador próprios do teste. Nada fica
// gravado.
//
//   npx tsx scripts/smoke-pesquisa-desligamento.ts
import "dotenv/config";
import { PrismaClient, Prisma } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { convidarParaPesquisaDesligamento, MODELO_DESLIGAMENTO } from "../lib/pesquisa-desligamento";
import { invalidarConvitesDeDesligados } from "../lib/pesquisa-vinculo";

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
  console.log("P09-OFF — pesquisa de desligamento\n");

  await rodarComRollback(async (tx) => {
    const marca = await tx.marca.create({ data: { nome: `__smoke_off_marca_${Date.now()}` } });
    const empresa = await tx.empresa.create({ data: { nome: `__smoke_off_empresa_${Date.now()}`, marcaId: marca.id } });
    const setor = await tx.setor.create({ data: { nome: "__smoke_setor", empresaId: empresa.id } });
    const posicao = await tx.posicao.create({ data: { nome: "__smoke_cargo", empresaId: empresa.id } });

    const p1 = await tx.colaborador.create({ data: { nome: "__smoke desligado 1", empresaId: empresa.id, setorId: setor.id, posicaoId: posicao.id, ativo: false } });
    const p2 = await tx.colaborador.create({ data: { nome: "__smoke desligado 2", empresaId: empresa.id, setorId: setor.id, posicaoId: posicao.id, ativo: false } });

    await convidarParaPesquisaDesligamento(tx, p1.id, empresa.id, marca.id);

    const pesquisa = await tx.pesquisa.findFirstOrThrow({ where: { marcaId: marca.id, modelo: MODELO_DESLIGAMENTO } });
    ok(pesquisa.status === "ACTIVE", "campanha nasce ACTIVE");
    ok(pesquisa.anonima === false, "não é anônima (não faz sentido pra devolutiva de desligamento)");

    const perguntas = await tx.pergunta.findMany({ where: { pesquisaId: pesquisa.id } });
    ok(perguntas.length === 22, `22 perguntas do seed criadas — sem a de múltipla escolha até-3, fora do escopo (achou ${perguntas.length})`);
    ok(perguntas.some((p) => p.tipo === "NPS_10"), "tem a pergunta de recomendação (NPS_10)");
    ok(
      perguntas.filter((p) => p.tipo === "TEXT").length === 4,
      `4 perguntas abertas (achou ${perguntas.filter((p) => p.tipo === "TEXT").length})`,
    );

    // Segunda pessoa desligada da mesma marca — reaproveita a campanha, não cria outra.
    await convidarParaPesquisaDesligamento(tx, p2.id, empresa.id, marca.id);
    const totalCampanhas = await tx.pesquisa.count({ where: { marcaId: marca.id, modelo: MODELO_DESLIGAMENTO } });
    ok(totalCampanhas === 1, `2ª pessoa reaproveita a mesma campanha (achou ${totalCampanhas} campanha(s))`);

    const tokens = await tx.surveyToken.findMany({ where: { pesquisaId: pesquisa.id } });
    ok(tokens.length === 2, `1 convite por pessoa (achou ${tokens.length})`);
    ok(tokens.every((t) => t.status === "PENDING"), "convites nascem PENDING — envio automático cuida do resto");

    // Reprocessar a mesma pessoa (ex.: RH edita a ficha de novo) não duplica.
    await convidarParaPesquisaDesligamento(tx, p1.id, empresa.id, marca.id);
    const tokensDepois = await tx.surveyToken.count({ where: { pesquisaId: pesquisa.id, colaboradorId: p1.id } });
    ok(tokensDepois === 1, "reprocessar a mesma pessoa não duplica o convite");

    throw new RollbackProposital();
  });

  console.log("\ninvalidarConvitesDeDesligados não deve tocar convites de P09-OFF do próprio desligado\n");

  await rodarComRollback(async (tx) => {
    const marca = await tx.marca.create({ data: { nome: `__smoke_off_marca2_${Date.now()}` } });
    const empresa = await tx.empresa.create({ data: { nome: `__smoke_off_empresa2_${Date.now()}`, marcaId: marca.id } });
    const setor = await tx.setor.create({ data: { nome: "__smoke_setor", empresaId: empresa.id } });
    const posicao = await tx.posicao.create({ data: { nome: "__smoke_cargo", empresaId: empresa.id } });
    const pessoa = await tx.colaborador.create({ data: { nome: "__smoke pessoa", empresaId: empresa.id, setorId: setor.id, posicaoId: posicao.id, ativo: false } });

    // Ordem real: rh-colaboradores.ts chama as duas em sequência no desligamento.
    await invalidarConvitesDeDesligados(tx, pessoa.id);
    await convidarParaPesquisaDesligamento(tx, pessoa.id, empresa.id, marca.id);

    const tokenOff = await tx.surveyToken.findFirst({ where: { colaboradorId: pessoa.id, pesquisa: { modelo: MODELO_DESLIGAMENTO } } });
    ok(tokenOff?.status === "PENDING", "convite de P09-OFF criado DEPOIS da invalidação não é afetado por ela");

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
