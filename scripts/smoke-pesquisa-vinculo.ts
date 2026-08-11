// Fumaça da RD-001 (Regra de Vínculo Ativo nas Pesquisas de RH) contra o banco
// de verdade. Em transação com rollback proposital: marca/empresa/setor/
// posição/colaboradores próprios do teste, então não depende de dado
// existente. Nada fica gravado.
//
//   npx tsx scripts/smoke-pesquisa-vinculo.ts
import "dotenv/config";
import { PrismaClient, Prisma } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { filtrarElegiveisPorVinculo, invalidarConvitesDeDesligados } from "../lib/pesquisa-vinculo";
import { CATALOGO_PESQUISAS } from "../lib/pesquisas-catalogo";

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
const SEMANA_PASSADA = new Date(HOJE.getTime() - 7 * 24 * 3600 * 1000);
const ANTEONTEM = new Date(HOJE.getTime() - 2 * 24 * 3600 * 1000);

async function main() {
  console.log("Matriz de elegibilidade — CLIMA/NR01 (RD-001)\n");

  await rodarComRollback(async (tx) => {
    const marca = await tx.marca.create({ data: { nome: `__smoke_vinculo_marca_${Date.now()}` } });
    const empresa = await tx.empresa.create({ data: { nome: `__smoke_vinculo_empresa_${Date.now()}`, marcaId: marca.id } });
    const setor = await tx.setor.create({ data: { nome: "__smoke_setor", empresaId: empresa.id } });
    const posicao = await tx.posicao.create({ data: { nome: "__smoke_cargo", empresaId: empresa.id } });

    const criarColaborador = (nome: string, extra: Partial<Prisma.ColaboradorUncheckedCreateInput> = {}) =>
      tx.colaborador.create({
        data: { nome, empresaId: empresa.id, setorId: setor.id, posicaoId: posicao.id, ...extra },
      });

    const ativo = await criarColaborador("__smoke_ativo");
    const desligado = await criarColaborador("__smoke_desligado", { ativo: false, dataDesligamento: SEMANA_PASSADA });
    const experiencia = await criarColaborador("__smoke_experiencia", { tipoContrato: "EXPERIENCIA" });
    const inss = await criarColaborador("__smoke_inss_vigente");
    const licenca = await criarColaborador("__smoke_licenca_vigente");
    const suspenso = await criarColaborador("__smoke_suspenso_vigente");
    const inssPendente = await criarColaborador("__smoke_inss_pendente"); // solicitado, ainda não aprovado
    const inssEncerrado = await criarColaborador("__smoke_inss_encerrado"); // aprovado, mas já voltou
    const deFerias = await criarColaborador("__smoke_ferias");

    const criarAusencia = (colaboradorId: string, tipo: string, status: string, dataInicio: Date, dataFim: Date) =>
      tx.ausencia.create({
        data: { empresaId: empresa.id, colaboradorId, tipo, status, dataInicio, dataFim, dias: 5 },
      });

    await criarAusencia(inss.id, "AFASTAMENTO_INSS", "APROVADA", ONTEM, AMANHA);
    await criarAusencia(licenca.id, "LICENCA_MATERNIDADE", "APROVADA", ONTEM, AMANHA);
    await criarAusencia(suspenso.id, "SUSPENSAO", "APROVADA", ONTEM, AMANHA);
    await criarAusencia(inssPendente.id, "AFASTAMENTO_INSS", "PENDENTE", ONTEM, AMANHA);
    await criarAusencia(inssEncerrado.id, "AFASTAMENTO_INSS", "APROVADA", SEMANA_PASSADA, ANTEONTEM);

    await tx.solicitacaoFerias.create({
      data: {
        empresaId: empresa.id,
        colaboradorId: deFerias.id,
        periodoAquisitivoInicio: SEMANA_PASSADA,
        dataInicio: ONTEM,
        dataFim: AMANHA,
        dias: 5,
        status: "APROVADA",
      },
    });

    const elegiveis = new Set((await filtrarElegiveisPorVinculo(tx, marca.id, "CLIMA", HOJE)).map((c) => c.id));

    ok(elegiveis.has(ativo.id), "ativo, sem afastamento: elegível (CLIMA)");
    ok(!elegiveis.has(desligado.id), "desligado (ativo=false): fora da medição (CLIMA)");
    ok(elegiveis.has(experiencia.id), "contrato de experiência: continua elegível (matriz Clima/NR-1)");
    ok(!elegiveis.has(inss.id), "afastamento INSS aprovado e vigente: fora da medição, universal");
    ok(!elegiveis.has(licenca.id), "licença-maternidade aprovada e vigente: fora da medição, universal");
    ok(!elegiveis.has(suspenso.id), "suspensão aprovada e vigente: fora da medição, universal");
    ok(elegiveis.has(inssPendente.id), "afastamento só solicitado (PENDENTE), ainda não aprovado: elegível");
    ok(elegiveis.has(inssEncerrado.id), "afastamento já encerrado (dataFim no passado): elegível de novo");
    ok(elegiveis.has(deFerias.id), "férias aprovada e vigente: continua elegível (matriz Clima/NR-1)");

    console.log("\n  -- catálogo por tipo: P08-STAY (só \"ativo\" puro, sem férias/experiência) --");
    ok(CATALOGO_PESQUISAS["P08-STAY"]?.elegibilidadeVinculo.length === 1, "P08-STAY existe no catálogo com elegibilidade estrita");
    const elegiveisStay = new Set((await filtrarElegiveisPorVinculo(tx, marca.id, "P08-STAY", HOJE)).map((c) => c.id));
    ok(elegiveisStay.has(ativo.id), "ativo puro: elegível pra P08-STAY");
    ok(!elegiveisStay.has(experiencia.id), "contrato de experiência: FORA de P08-STAY (catálogo não inclui \"experiencia\")");
    ok(!elegiveisStay.has(deFerias.id), "férias vigente: FORA de P08-STAY (catálogo não inclui \"ferias\")");
    ok(!elegiveisStay.has(desligado.id), "desligado: fora também de P08-STAY");

    throw new RollbackProposital();
  });

  console.log("\nExpiração de convite em aberto no desligamento (RD-001, item 3)\n");

  await rodarComRollback(async (tx) => {
    const marca = await tx.marca.create({ data: { nome: `__smoke_vinculo_marca2_${Date.now()}` } });
    const empresa = await tx.empresa.create({ data: { nome: `__smoke_vinculo_empresa2_${Date.now()}`, marcaId: marca.id } });
    const setor = await tx.setor.create({ data: { nome: "__smoke_setor", empresaId: empresa.id } });
    const posicao = await tx.posicao.create({ data: { nome: "__smoke_cargo", empresaId: empresa.id } });
    const colaborador = await tx.colaborador.create({
      data: { nome: "__smoke_vai_ser_desligado", empresaId: empresa.id, setorId: setor.id, posicaoId: posicao.id },
    });

    const pesquisa = await tx.pesquisa.create({
      data: { marcaId: marca.id, empresaId: empresa.id, titulo: "__smoke pesquisa", modelo: "CLIMA", status: "ACTIVE" },
    });

    const criarToken = (status: string) =>
      tx.surveyToken.create({
        data: { pesquisaId: pesquisa.id, colaboradorId: colaborador.id, token: `__smoke_${status}_${Math.random()}`, status },
      });
    // Só um token por (pesquisaId, colaboradorId) — simula os quatro estados
    // criando quatro pesquisas irmãs, uma por status.
    const pendente = await criarToken("PENDING");
    const enviado = await tx.pesquisa
      .create({ data: { marcaId: marca.id, empresaId: empresa.id, titulo: "__smoke p2", modelo: "CLIMA", status: "ACTIVE" } })
      .then((p) => tx.surveyToken.create({ data: { pesquisaId: p.id, colaboradorId: colaborador.id, token: `__smoke_sent_${Math.random()}`, status: "SENT" } }));
    const respondido = await tx.pesquisa
      .create({ data: { marcaId: marca.id, empresaId: empresa.id, titulo: "__smoke p3", modelo: "CLIMA", status: "ACTIVE" } })
      .then((p) => tx.surveyToken.create({ data: { pesquisaId: p.id, colaboradorId: colaborador.id, token: `__smoke_resp_${Math.random()}`, status: "RESPONDED" } }));

    // Desligamento: ativo true -> false, com a mesma escrita que updateColaborador/toggleColaboradorAtivo fazem.
    await tx.colaborador.update({ where: { id: colaborador.id }, data: { ativo: false } });
    const invalidados = await invalidarConvitesDeDesligados(tx, colaborador.id);
    ok(invalidados === 2, `2 convites em aberto expirados (achou ${invalidados})`);

    const pendenteDepois = await tx.surveyToken.findUniqueOrThrow({ where: { id: pendente.id } });
    const enviadoDepois = await tx.surveyToken.findUniqueOrThrow({ where: { id: enviado.id } });
    const respondidoDepois = await tx.surveyToken.findUniqueOrThrow({ where: { id: respondido.id } });

    ok(pendenteDepois.status === "EXCLUIDO", "PENDING vira EXCLUIDO no desligamento");
    ok(enviadoDepois.status === "EXCLUIDO", "SENT vira EXCLUIDO no desligamento");
    ok(respondidoDepois.status === "RESPONDED", "RESPONDED não é tocado — resposta anônima já contada");

    throw new RollbackProposital();
  });

  console.log("\nPlanoAcao (fase 2) — status default, prazo, relação com pesquisa/setor\n");

  await rodarComRollback(async (tx) => {
    const marca = await tx.marca.create({ data: { nome: `__smoke_vinculo_marca3_${Date.now()}` } });
    const empresa = await tx.empresa.create({ data: { nome: `__smoke_vinculo_empresa3_${Date.now()}`, marcaId: marca.id } });
    const setor = await tx.setor.create({ data: { nome: "__smoke_setor", empresaId: empresa.id } });
    const posicao = await tx.posicao.create({ data: { nome: "__smoke_cargo", empresaId: empresa.id } });
    const pesquisa = await tx.pesquisa.create({
      data: { marcaId: marca.id, empresaId: empresa.id, titulo: "__smoke pesquisa nr01", modelo: "NR01", status: "ENCERRADA" },
    });

    const plano = await tx.planoAcao.create({
      data: {
        empresaId: empresa.id,
        pesquisaId: pesquisa.id,
        setorId: setor.id,
        dimensaoCodigo: "A",
        titulo: "__smoke reduzir sobrecarga do setor",
        responsavelNome: "Gestor de Teste",
        prazo: AMANHA,
      },
    });
    ok(plano.status === "ABERTO", "nasce com status ABERTO por padrão");
    ok(plano.pesquisaId === pesquisa.id && plano.setorId === setor.id, "relação com pesquisa e setor gravada");

    const concluido = await tx.planoAcao.update({
      where: { id: plano.id },
      data: { status: "CONCLUIDO", concluidoEm: HOJE },
    });
    ok(concluido.status === "CONCLUIDO" && concluido.concluidoEm !== null, "conclusão grava status e data");

    // "Vencido" é derivado (prazo no passado + não concluído/cancelado), não
    // um status gravado — outro plano, ainda ABERTO, com prazo em ontem.
    const vencido = await tx.planoAcao.create({
      data: { empresaId: empresa.id, titulo: "__smoke vencido", prazo: ONTEM },
    });
    const abertosVencidos = await tx.planoAcao.count({
      where: { empresaId: empresa.id, status: { notIn: ["CONCLUIDO", "CANCELADO"] }, prazo: { lt: HOJE } },
    });
    ok(abertosVencidos === 1 && vencido.status === "ABERTO", "vencido é consulta por data, não status gravado");

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
