// Fumaça da área Desligamentos contra o banco de verdade (v1.215.0).
//
// O motor (lib/desligamentos/painel.ts) já está em
// scripts/test-painel-desligamentos.ts. Aqui fica o que só o banco prova, em
// lib/desligamentos/base.ts:
//   1. a atribuição do gestor responsável, na ordem: líder do dia da saída
//      (retrato) → líder no cadastro → gestor do setor (GESTOR_SETOR) → sem;
//   2. o setor da época para quem tem retrato;
//   3. a configuração do cliente: padrão sem linha, valores gravados com linha.
//
// Cria grupo, marca e CNPJ próprios e apaga tudo no fim (as funções usam o
// cliente global do Prisma, então rollback não serviria).
//
//   npx tsx scripts/smoke-area-desligamentos.ts
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { dataUTC, somarMesesUTC, hojeUTC } from "../lib/datas";
import { carregarBaseDaArea, configuracaoDaArea } from "../lib/desligamentos/base";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

const sufixo = `smoke-area-${Date.now()}`;

async function main() {
  const haDoisMeses = somarMesesUTC(hojeUTC(), -2);
  const grupo = await prisma.grupo.create({ data: { nome: `Grupo ${sufixo}` } });
  const marca = await prisma.marca.create({ data: { nome: `Marca ${sufixo}`, grupoId: grupo.id } });
  const empresa = await prisma.empresa.create({ data: { nome: `CNPJ ${sufixo}`, marcaId: marca.id } });
  const userIds: string[] = [];

  try {
    const [comercial, financeiro, marketing, cargo] = await Promise.all([
      prisma.setor.create({ data: { empresaId: empresa.id, nome: "Comercial" } }),
      prisma.setor.create({ data: { empresaId: empresa.id, nome: "Financeiro" } }),
      prisma.setor.create({ data: { empresaId: empresa.id, nome: "Marketing" } }),
      prisma.posicao.create({ data: { empresaId: empresa.id, nome: "Analista" } }),
    ]);
    const base = { empresaId: empresa.id, posicaoId: cargo.id, dataAdmissao: dataUTC(2024, 1, 2) };

    const lider = await prisma.colaborador.create({ data: { ...base, nome: "Líder Comercial", setorId: comercial.id } });
    const comLider = await prisma.colaborador.create({
      data: { ...base, nome: "Liderada", setorId: comercial.id, supervisorId: lider.id },
    });
    // Saiu do Comercial com outro líder; a ficha foi depois movida para o
    // Financeiro e o líder trocado — o retrato guarda os dois da época.
    const comRetrato = await prisma.colaborador.create({
      data: {
        ...base, nome: "Saiu com retrato", setorId: financeiro.id, supervisorId: lider.id, ativo: false,
        dataDesligamento: haDoisMeses, motivoDesligamento: "SEM_JUSTA_CAUSA", causaDesligamento: "DESEMPENHO",
      },
    });
    await prisma.retratoDesligamento.create({
      data: {
        empresaId: empresa.id, colaboradorId: comRetrato.id, setorId: comercial.id, setorNome: "Comercial",
        posicaoNome: "Vendedor", supervisorId: "lider-antigo", supervisorNome: "Líder antigo",
      },
    });
    // Saída antiga, sem retrato e sem líder no cadastro, no Comercial: vai para
    // o principal líder do setor (quem lidera mais gente ativa ali).
    const antigaNoComercial = await prisma.colaborador.create({
      data: {
        ...base, nome: "Saída antiga sem líder", setorId: comercial.id, ativo: false,
        dataDesligamento: haDoisMeses, motivoDesligamento: "PEDIDO_DEMISSAO",
      },
    });
    const noFinanceiro = await prisma.colaborador.create({ data: { ...base, nome: "Sem líder no Financeiro", setorId: financeiro.id } });
    const noMarketing = await prisma.colaborador.create({ data: { ...base, nome: "Sem ninguém no Marketing", setorId: marketing.id } });

    const gestor = await prisma.user.create({
      data: { nome: "Gestora do Financeiro", username: `gestora-${sufixo}`, passwordHash: "x", role: "GESTOR_SETOR", grupoId: grupo.id },
    });
    userIds.push(gestor.id);
    await prisma.userEmpresa.create({
      data: { userId: gestor.id, empresaId: empresa.id, role: "GESTOR_SETOR", setorId: financeiro.id },
    });

    console.log("1. Gestor responsável e setor da época");
    const area = await carregarBaseDaArea(empresa.id, [empresa.id]);
    const porId = new Map(area.fichas.map((f) => [f.id, f]));
    const a = porId.get(comLider.id)!;
    ok(a.gestorOrigem === "lider" && a.gestorNome === "Líder Comercial", "ativo com líder: o líder do cadastro");
    const r = porId.get(comRetrato.id)!;
    ok(r.gestorOrigem === "retrato" && r.gestorNome === "Líder antigo", "desligado com retrato: o líder do dia da saída");
    ok(r.setor === "Comercial" && r.cargo === "Vendedor", "desligado com retrato: setor e cargo da época, não os de hoje");
    ok(r.temRetrato && r.causaDesligamento === "DESEMPENHO", "a causa da saída chega junto");
    const antiga = porId.get(antigaNoComercial.id)!;
    ok(
      antiga.gestorOrigem === "lider_do_setor" && antiga.gestorChave === a.gestorChave,
      "saída antiga sem líder: o principal líder do setor — soma com a equipe dele",
    );
    const fin = porId.get(noFinanceiro.id)!;
    ok(
      fin.gestorOrigem === "gestor_do_setor" && fin.gestorNome === "Gestora do Financeiro",
      "setor sem líder nenhum entre os ativos: o gestor do setor no sistema",
    );
    const mkt = porId.get(noMarketing.id)!;
    ok(mkt.gestorOrigem === "sem_gestor" && mkt.gestorChave === "sem-gestor", "sem líder e sem gestor de setor: 'sem gestor'");
    ok(!("cpf" in a), "o CPF não sai da carga (só serve para reconhecer transferência)");

    console.log("2. Configuração do cliente");
    const padrao = await configuracaoDaArea(empresa.id);
    ok(!padrao.personalizada && padrao.custoPorDesligamento === 4000 && padrao.metaPct === 10 && padrao.limitePct === 15, "sem linha: os padrões (R$ 4.000, 10%, 15%)");
    await prisma.configuracaoDesligamentos.create({
      data: { grupoId: grupo.id, custoPorDesligamentoCentavos: 550050, metaPct: 8, limitePct: 12 },
    });
    const gravada = await configuracaoDaArea(empresa.id);
    ok(gravada.personalizada && gravada.custoPorDesligamento === 5500.5 && gravada.metaPct === 8 && gravada.limitePct === 12, "com linha: os valores gravados, centavos convertidos");
  } finally {
    // A configuração e os indicadores do grupo caem em cascata com o grupo.
    await prisma.userEmpresa.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.colaborador.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.setor.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.posicao.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.empresa.delete({ where: { id: empresa.id } });
    await prisma.marca.delete({ where: { id: marca.id } });
    await prisma.grupo.delete({ where: { id: grupo.id } });
  }

  ok((await prisma.grupo.count({ where: { nome: { endsWith: sufixo } } })) === 0, "nada do teste sobrou no banco");
  ok((await prisma.configuracaoDesligamentos.count({ where: { grupoId: grupo.id } })) === 0, "a configuração caiu em cascata com o grupo");

  await prisma.$disconnect();
  if (falhas > 0) {
    console.error(`\n${falhas} verificação(ões) falharam.`);
    process.exit(1);
  }
  console.log("\nTudo certo.");
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
