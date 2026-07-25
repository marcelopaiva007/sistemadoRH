// Fumaça do Departamento Pessoal contra o banco de verdade.
//
// Faz o ciclo completo (ficha -> dependente -> documento com anexo -> férias ->
// ausência -> auditoria) DENTRO de uma transação que sempre termina em rollback:
// nada fica no banco. Serve para provar que as colunas, o bytea e as FKs novas
// funcionam de ponta a ponta.
//
//   npx tsx scripts/smoke-dp.ts
import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { dataUTC } from "../lib/datas";

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
    select: { id: true, nome: true },
  });
  if (!colaborador) throw new Error("Nenhum colaborador cadastrado nessa empresa.");

  console.log(`Empresa: ${empresa.nome} · Colaborador de teste: ${colaborador.nome}`);
  console.log("(tudo roda em transação e termina em ROLLBACK)\n");

  try {
    await prisma.$transaction(
      async (tx) => {
        console.log("1. Ficha completa");
        const ficha = await tx.colaborador.update({
          where: { id: colaborador.id },
          data: {
            dataAdmissao: dataUTC(2023, 3, 10),
            tipoContrato: "CLT",
            jornadaSemanal: 44,
            salarioBase: 2500.5,
            emergenciaNome: "Contato de teste",
            bancoNome: "Banco de teste",
          },
        });
        ok(ficha.dataAdmissao?.toISOString().startsWith("2023-03-10") === true, "data de admissão grava como 10/03 em UTC");
        ok(ficha.salarioBase === 2500.5, "salário base com centavos");

        console.log("2. Dependente");
        const dependente = await tx.dependente.create({
          data: { colaboradorId: colaborador.id, nome: "Dependente teste", parentesco: "FILHO", irrf: true },
        });
        ok(dependente.irrf === true, "dependente marcado para IRRF");

        console.log("3. Documento com anexo (bytea)");
        const conteudo = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // "%PDF-1.4"
        const arquivo = await tx.arquivo.create({
          data: {
            empresaId: empresa.id,
            nome: "aso-teste.pdf",
            mimeType: "application/pdf",
            tamanhoBytes: conteudo.byteLength,
            conteudo,
          },
        });
        const documento = await tx.documentoColaborador.create({
          data: {
            empresaId: empresa.id,
            colaboradorId: colaborador.id,
            tipo: "ASO",
            validoAte: dataUTC(2026, 9, 1),
            arquivoId: arquivo.id,
          },
          include: { arquivo: { select: { conteudo: true, nome: true } } },
        });
        ok(documento.arquivo?.nome === "aso-teste.pdf", "documento aponta para o anexo");
        ok(
          Buffer.from(documento.arquivo!.conteudo).toString("utf8") === "%PDF-1.4",
          "o conteúdo binário volta do banco byte a byte",
        );

        console.log("4. Férias");
        const ferias = await tx.solicitacaoFerias.create({
          data: {
            empresaId: empresa.id,
            colaboradorId: colaborador.id,
            periodoAquisitivoInicio: dataUTC(2024, 3, 10),
            dataInicio: dataUTC(2026, 9, 1),
            dataFim: dataUTC(2026, 9, 30),
            dias: 30,
          },
        });
        ok(ferias.status === "PENDENTE", "férias nascem pendentes de aprovação");

        console.log("5. Ausência");
        const ausencia = await tx.ausencia.create({
          data: {
            empresaId: empresa.id,
            colaboradorId: colaborador.id,
            tipo: "ATESTADO",
            dataInicio: dataUTC(2026, 7, 20),
            dataFim: dataUTC(2026, 7, 21),
            dias: 2,
            abonada: true,
          },
        });
        ok(ausencia.abonada === true, "ausência abonada");

        console.log("6. Auditoria");
        const log = await tx.auditLog.create({
          data: {
            empresaId: empresa.id,
            acao: "ATUALIZAR",
            entidade: "Colaborador",
            entidadeId: colaborador.id,
            resumo: "smoke test",
            detalhes: { campo: { de: null, para: "x" } },
          },
        });
        ok(log.detalhes !== null, "detalhes gravam como JSONB");

        console.log("7. Consultas das telas novas");
        const vencendo = await tx.documentoColaborador.count({
          where: { empresaId: empresa.id, validoAte: { not: null, lte: dataUTC(2026, 12, 31) } },
        });
        ok(vencendo >= 1, "o painel de vencimentos enxerga o documento com validade");
        const pendentes = await tx.solicitacaoFerias.count({
          where: { empresaId: empresa.id, status: "PENDENTE" },
        });
        ok(pendentes >= 1, "a central de aprovações enxerga as férias pendentes");

        throw new RollbackProposital();
      },
      { timeout: 30_000 },
    );
  } catch (e) {
    if (!(e instanceof RollbackProposital)) throw e;
    console.log("\n↩ rollback executado — nada foi gravado.");
  }

  const sobrou = await prisma.documentoColaborador.count({ where: { tipo: "ASO", descricao: null } });
  const arquivosDeTeste = await prisma.arquivo.count({ where: { nome: "aso-teste.pdf" } });
  ok(arquivosDeTeste === 0, "nenhum arquivo de teste sobrou no banco");
  console.log(`  (documentos ASO reais no banco: ${sobrou})`);

  console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
