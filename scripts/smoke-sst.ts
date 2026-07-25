// Fumaça da conformidade SST (Fase 2) contra o banco de verdade.
//
// Roda em transação com rollback proposital: requisito de NR numa função real,
// certificado vencido e certificado em dia para a mesma norma (a reciclagem
// precisa vencer o antigo), ASO com restrição, e confere que o motor de
// conformidade e as consultas do painel de vencimentos enxergam tudo certo.
// Nada fica gravado.
//
//   npx tsx scripts/smoke-sst.ts
import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { dataUTC } from "../lib/datas";
import { conformidadeDoColaborador, situacaoDoExame } from "../lib/conformidade";

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
  const empresa = await prisma.empresa.findFirst({ where: { ativo: true } });
  if (!empresa) throw new Error("Nenhuma empresa cadastrada — rode o seed antes.");
  const colaborador = await prisma.colaborador.findFirst({
    where: { empresaId: empresa.id },
    select: { id: true, nome: true, posicaoId: true },
  });
  if (!colaborador) throw new Error("Nenhum colaborador cadastrado nessa empresa.");

  console.log(`Empresa: ${empresa.nome} · Colaborador de teste: ${colaborador.nome}`);
  console.log("(tudo roda em transação e termina em ROLLBACK)\n");

  try {
    await prisma.$transaction(
      async (tx) => {
        console.log("1. Requisito de NR na função do colaborador");
        const requisito = await tx.requisitoNR.upsert({
          where: { posicaoId_norma: { posicaoId: colaborador.posicaoId, norma: "NR-35" } },
          create: { empresaId: empresa.id, posicaoId: colaborador.posicaoId, norma: "NR-35", validadeMeses: 24 },
          update: { validadeMeses: 24 },
        });
        ok(requisito.norma === "NR-35", "requisito criado/atualizado para a função");

        console.log("2. Certificado vencido + reciclagem em dia (mesma norma)");
        await tx.certificadoNR.create({
          data: {
            empresaId: empresa.id,
            colaboradorId: colaborador.id,
            norma: "NR-35",
            realizadoEm: dataUTC(2022, 1, 10),
            validoAte: dataUTC(2024, 1, 10),
          },
        });
        await tx.certificadoNR.create({
          data: {
            empresaId: empresa.id,
            colaboradorId: colaborador.id,
            norma: "NR-35",
            realizadoEm: dataUTC(2026, 6, 1),
            validoAte: dataUTC(2028, 6, 1),
          },
        });

        console.log("3. ASO com restrição");
        await tx.exameOcupacional.create({
          data: {
            empresaId: empresa.id,
            colaboradorId: colaborador.id,
            tipo: "PERIODICO",
            realizadoEm: dataUTC(2026, 6, 1),
            validoAte: dataUTC(2027, 6, 1),
            resultado: "APTO_COM_RESTRICAO",
            restricoes: "Sem trabalho em altura acima de 2m",
          },
        });

        console.log("4. Motor de conformidade lê o estado certo");
        const requisitos = await tx.requisitoNR.findMany({ where: { posicaoId: colaborador.posicaoId } });
        const certificados = await tx.certificadoNR.findMany({ where: { colaboradorId: colaborador.id } });
        const exames = await tx.exameOcupacional.findMany({ where: { colaboradorId: colaborador.id } });

        const conformidade = conformidadeDoColaborador(requisitos, certificados, dataUTC(2026, 7, 25));
        const itemNR35 = conformidade.itens.find((i) => i.norma === "NR-35");
        ok(itemNR35?.situacao === "EM_DIA", "a reciclagem mais recente vence o certificado antigo");
        ok(conformidade.regular, "colaborador regular com a reciclagem feita");

        const exame = situacaoDoExame(exames, dataUTC(2026, 7, 25));
        ok(exame.situacao === "EM_DIA", "ASO dentro da validade");
        ok(exame.restricoes === "Sem trabalho em altura acima de 2m", "restrição do ASO preservada");

        console.log("5. Consultas do painel de vencimentos enxergam o registro");
        const certificadosDaEmpresa = await tx.certificadoNR.count({ where: { empresaId: empresa.id, validoAte: { not: null } } });
        ok(certificadosDaEmpresa >= 2, "certificados aparecem na contagem por empresa");
        const examesDaEmpresa = await tx.exameOcupacional.count({
          where: { empresaId: empresa.id, validoAte: { not: null }, tipo: { not: "DEMISSIONAL" } },
        });
        ok(examesDaEmpresa >= 1, "exame aparece na contagem por empresa (fora do demissional)");

        console.log("6. Remoção do requisito");
        await tx.requisitoNR.delete({ where: { id: requisito.id } });
        const semRequisito = await tx.requisitoNR.findFirst({ where: { posicaoId: colaborador.posicaoId, norma: "NR-35" } });
        ok(semRequisito === null, "requisito removido");

        throw new RollbackProposital();
      },
      { timeout: 30_000 },
    );
  } catch (e) {
    if (!(e instanceof RollbackProposital)) throw e;
    console.log("\n↩ rollback executado — nada foi gravado.");
  }

  const sobrouCertificado = await prisma.certificadoNR.count({ where: { colaboradorId: colaborador.id, norma: "NR-35" } });
  const sobrouExame = await prisma.exameOcupacional.count({
    where: { colaboradorId: colaborador.id, resultado: "APTO_COM_RESTRICAO", restricoes: { contains: "acima de 2m" } },
  });
  ok(sobrouCertificado === 0, "nenhum certificado de teste sobrou no banco");
  ok(sobrouExame === 0, "nenhum exame de teste sobrou no banco");

  console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
