// Fumaça do retrato do desligamento e da causa gerencial (v1.213.0), contra o
// banco de verdade. Em transação com rollback proposital — nada fica gravado.
//
// O que prova:
//   1. gravarRetratoDesligamento copia setor, cargo, líder e admissão como
//      TEXTO do momento da saída;
//   2. mudar o setor da ficha DEPOIS não reescreve o retrato (é o motivo de
//      ele existir: a saída conta no setor da época);
//   3. desligar de novo (reativado e desligado outra vez) sobrescreve, não
//      duplica — um retrato por ficha (UNIQUE em colaboradorId);
//   4. apagar a ficha leva o retrato junto (ON DELETE CASCADE);
//   5. as regras puras da causa: lista fechada e sugestão pelo motivo legal.
//
//   npx tsx scripts/smoke-retrato-desligamento.ts
import "dotenv/config";
import { PrismaClient, Prisma } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { dataUTC } from "../lib/datas";
import { gravarRetratoDesligamento } from "../lib/retrato-desligamento";
import { causaSugerida, ehCausaDesligamento } from "../lib/constants-dp";
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
  console.log("0. Regras puras da causa");
  ok(ehCausaDesligamento("DESEMPENHO"), "DESEMPENHO é causa válida");
  ok(!ehCausaDesligamento("SEM_JUSTA_CAUSA"), "tipo legal não passa por causa gerencial");
  ok(!ehCausaDesligamento(""), "vazio não é causa");
  ok(causaSugerida("PEDIDO_DEMISSAO") === "PEDIDO_COLABORADOR", "pedido de demissão sugere 'pedido do colaborador'");
  ok(causaSugerida("FIM_CONTRATO") === "FIM_CONTRATO", "fim de contrato sugere 'fim de contrato'");
  ok(causaSugerida("SEM_JUSTA_CAUSA") === "", "dispensa sem justa causa NÃO sugere — é onde a escolha importa");
  ok(causaSugerida("TRANSFERENCIA_GRUPO") === "", "transferência não sugere causa");

  const empresa = await empresaDeTeste(prisma, { comSetor: true });
  if (!empresa) throw new Error("Nenhuma empresa cadastrada.");

  console.log(`\nEmpresa: ${empresa.nome} (tudo termina em ROLLBACK)\n`);

  await rodarComRollback(async (tx) => {
    const setorA = await tx.setor.create({ data: { empresaId: empresa.id, nome: "Smoke Retrato A" } });
    const setorB = await tx.setor.create({ data: { empresaId: empresa.id, nome: "Smoke Retrato B" } });
    const cargo = await tx.posicao.create({ data: { empresaId: empresa.id, nome: "Smoke Retrato Cargo" } });
    const lider = await tx.colaborador.create({
      data: { empresaId: empresa.id, nome: "Líder Smoke", setorId: setorA.id, posicaoId: cargo.id },
    });
    const pessoa = await tx.colaborador.create({
      data: {
        empresaId: empresa.id,
        nome: "Pessoa Smoke",
        setorId: setorA.id,
        posicaoId: cargo.id,
        supervisorId: lider.id,
        dataAdmissao: dataUTC(2026, 3, 2),
      },
    });

    console.log("1. Retrato copia a estrutura do momento da saída");
    await tx.colaborador.update({
      where: { id: pessoa.id },
      data: {
        ativo: false,
        dataDesligamento: dataUTC(2026, 10, 15),
        motivoDesligamento: "SEM_JUSTA_CAUSA",
        causaDesligamento: "DESEMPENHO",
      },
    });
    await gravarRetratoDesligamento(tx, pessoa.id, { id: "u-smoke", name: "RH Smoke" });
    const r1 = await tx.retratoDesligamento.findUnique({ where: { colaboradorId: pessoa.id } });
    ok(r1?.setorNome === "Smoke Retrato A" && r1.setorId === setorA.id, "setor da época gravado (nome e id)");
    ok(r1?.posicaoNome === "Smoke Retrato Cargo", "cargo da época gravado");
    ok(r1?.supervisorNome === "Líder Smoke" && r1.supervisorId === lider.id, "líder da época gravado");
    ok(r1?.dataAdmissao?.getTime() === dataUTC(2026, 3, 2).getTime(), "admissão copiada");
    ok(r1?.registradoPorNome === "RH Smoke" && r1.empresaId === empresa.id, "quem registrou e o CNPJ");

    console.log("2. Corrigir o setor da ficha depois não reescreve o passado");
    await tx.colaborador.update({ where: { id: pessoa.id }, data: { setorId: setorB.id } });
    await tx.setor.update({ where: { id: setorA.id }, data: { nome: "Smoke Retrato A (renomeado)" } });
    const r2 = await tx.retratoDesligamento.findUnique({ where: { colaboradorId: pessoa.id } });
    ok(r2?.setorNome === "Smoke Retrato A", "retrato segue no setor e no nome da época");

    console.log("3. Desligar de novo sobrescreve — um retrato por ficha");
    await gravarRetratoDesligamento(tx, pessoa.id, null);
    const qtd = await tx.retratoDesligamento.count({ where: { colaboradorId: pessoa.id } });
    const r3 = await tx.retratoDesligamento.findUnique({ where: { colaboradorId: pessoa.id } });
    ok(qtd === 1, "continua um retrato só");
    ok(r3?.setorNome === "Smoke Retrato B" && r3.registradoPorNome === null, "o novo retrato vale para a saída mais recente");

    console.log("4. Apagar a ficha leva o retrato junto");
    await tx.colaborador.delete({ where: { id: pessoa.id } });
    ok((await tx.retratoDesligamento.count({ where: { colaboradorId: pessoa.id } })) === 0, "cascade apagou o retrato");

    throw new RollbackProposital();
  });

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
