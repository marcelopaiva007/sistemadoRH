// Fumaça do motor de alertas (fase 3, lib/alertas.ts — AL08/AL09/AL10) contra
// o banco de verdade. Em transação com rollback proposital: marca/empresa/
// setor/colaboradores/pesquisa próprios do teste. Nada fica gravado.
//
// SMTP não configurado neste ambiente é esperado: os asserts checam a
// DETECÇÃO (quantos `avaliados`), não o envio de e-mail em si — `erros` sobe
// quando há destinatário com e-mail e SMTP não está configurado, o que é
// diferente de "não detectou".
//
//   npx tsx scripts/smoke-alertas-rh.ts
import "dotenv/config";
import { PrismaClient, Prisma } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  verificarPlanosDeAcaoVencidos,
  verificarDesligamentosConcentrados,
  verificarTaxaRespostaBaixa,
} from "../lib/alertas";

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
const ONTEM = new Date(HOJE.getTime() - 24 * 3600 * 1000);
const AMANHA = new Date(HOJE.getTime() + 24 * 3600 * 1000);
const D_40 = new Date(HOJE.getTime() - 40 * 24 * 3600 * 1000);
const D_95 = new Date(HOJE.getTime() - 95 * 24 * 3600 * 1000); // fora da janela de 90d

async function novaEmpresa(tx: Prisma.TransactionClient, sufixo: string) {
  const marca = await tx.marca.create({ data: { nome: `__smoke_alertas_marca_${sufixo}_${Date.now()}` } });
  const empresa = await tx.empresa.create({ data: { nome: `__smoke_alertas_empresa_${sufixo}_${Date.now()}`, marcaId: marca.id } });
  const posicao = await tx.posicao.create({ data: { nome: "__smoke_cargo", empresaId: empresa.id } });
  return { marca, empresa, posicao };
}

async function main() {
  console.log("AL09 — plano de ação vencido\n");

  await rodarComRollback(async (tx) => {
    const { empresa } = await novaEmpresa(tx, "al09");
    const setor = await tx.setor.create({ data: { nome: "__smoke_setor", empresaId: empresa.id } });

    // Vencido, ainda ABERTO — deve ser detectado.
    await tx.planoAcao.create({
      data: { empresaId: empresa.id, setorId: setor.id, titulo: "__smoke vencido aberto", prazo: ONTEM },
    });
    // Vencido, mas CONCLUIDO — não deve ser detectado.
    await tx.planoAcao.create({
      data: { empresaId: empresa.id, titulo: "__smoke vencido concluido", prazo: ONTEM, status: "CONCLUIDO", concluidoEm: HOJE },
    });
    // Prazo no futuro, ABERTO — não deve ser detectado.
    await tx.planoAcao.create({
      data: { empresaId: empresa.id, titulo: "__smoke no prazo", prazo: AMANHA },
    });

    const resultado = await verificarPlanosDeAcaoVencidos(tx, HOJE);
    ok(resultado.avaliados === 1, `detecta só o plano vencido e aberto (achou ${resultado.avaliados})`);

    throw new RollbackProposital();
  });

  console.log("\nAL10 — desligamentos concentrados numa área em 90 dias\n");

  await rodarComRollback(async (tx) => {
    const { empresa, posicao } = await novaEmpresa(tx, "al10");
    const setorRisco = await tx.setor.create({ data: { nome: "__smoke_setor_risco", empresaId: empresa.id } });
    const setorCalmo = await tx.setor.create({ data: { nome: "__smoke_setor_calmo", empresaId: empresa.id } });

    const desligar = (setorId: string, dataDesligamento: Date, nome: string) =>
      tx.colaborador.create({
        data: { nome, empresaId: empresa.id, setorId, posicaoId: posicao.id, ativo: false, dataDesligamento },
      });

    // 3 desligamentos dentro da janela no mesmo setor — deve disparar.
    // Linha de base ANTES de qualquer dado do teste — ver o comentário do delta.
    const baseAl10 = await verificarDesligamentosConcentrados(tx, HOJE);

    await desligar(setorRisco.id, D_40, "__smoke d1");
    await desligar(setorRisco.id, D_40, "__smoke d2");
    await desligar(setorRisco.id, ONTEM, "__smoke d3");
    // Fora da janela de 90 dias — não conta pro setor de risco.
    await desligar(setorRisco.id, D_95, "__smoke d4 fora da janela");
    // Só 2 no setor calmo — abaixo do mínimo de 3.
    await desligar(setorCalmo.id, D_40, "__smoke c1");
    await desligar(setorCalmo.id, D_40, "__smoke c2");

    const resultado = await verificarDesligamentosConcentrados(tx, HOJE);
    // Delta contra a linha de base, não o total: a função varre o banco
    // INTEIRO, e a base de produção tem desligamentos reais na janela. Afirmar
    // `=== 2` só funcionava com o banco vazio — quebrou assim que a base
    // cresceu, sem que nada no código de alerta tivesse mudado.
    ok(
      resultado.avaliados - baseAl10.avaliados === 2,
      `os 2 setores do teste entram na avaliação (delta ${resultado.avaliados - baseAl10.avaliados}, base ${baseAl10.avaliados})`,
    );

    throw new RollbackProposital();
  });

  console.log("\nAL08 — taxa de resposta baixa num setor, pesquisa ativa\n");

  await rodarComRollback(async (tx) => {
    const { empresa, posicao } = await novaEmpresa(tx, "al08");
    const setorBaixo = await tx.setor.create({ data: { nome: "__smoke_setor_baixo", empresaId: empresa.id } });
    const setorAlto = await tx.setor.create({ data: { nome: "__smoke_setor_alto", empresaId: empresa.id } });
    const setorPequeno = await tx.setor.create({ data: { nome: "__smoke_setor_pequeno", empresaId: empresa.id } });

    const pesquisa = await tx.pesquisa.create({
      data: { marcaId: empresa.marcaId, empresaId: empresa.id, titulo: "__smoke pesquisa ativa", modelo: "CLIMA", status: "ACTIVE" },
    });

    const criarColaboradorComToken = (setorId: string, status: string, n: number) =>
      tx.colaborador
        .create({ data: { nome: `__smoke ${setorId}-${n}`, empresaId: empresa.id, setorId, posicaoId: posicao.id } })
        .then((c) =>
          tx.surveyToken.create({
            data: { pesquisaId: pesquisa.id, colaboradorId: c.id, token: `__smoke_${setorId}_${n}_${Math.random()}`, status },
          }),
        );

    // Setor baixo: 5 convites, 2 respondidos = 40% (< 60%, acima do n mínimo de 5) — deve disparar.
    // Linha de base ANTES do dado do teste — mesma razão do AL10.
    const baseAl08 = await verificarTaxaRespostaBaixa(tx);

    for (let i = 0; i < 2; i++) await criarColaboradorComToken(setorBaixo.id, "RESPONDED", i);
    for (let i = 2; i < 5; i++) await criarColaboradorComToken(setorBaixo.id, "SENT", i);

    // Setor alto: 5 convites, 4 respondidos = 80% (>= 60%) — não deve disparar.
    for (let i = 0; i < 4; i++) await criarColaboradorComToken(setorAlto.id, "RESPONDED", i);
    await criarColaboradorComToken(setorAlto.id, "SENT", 4);

    // Setor pequeno: 3 convites, 0 respondidos = 0% — mas abaixo do n mínimo (5), não deve disparar.
    for (let i = 0; i < 3; i++) await criarColaboradorComToken(setorPequeno.id, "SENT", i);

    const resultado = await verificarTaxaRespostaBaixa(tx);
    ok(
      resultado.avaliados - baseAl08.avaliados === 2,
      `os 2 setores do teste com amostra >= mínimo entram (delta ${resultado.avaliados - baseAl08.avaliados}, base ${baseAl08.avaliados})`,
    );

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
