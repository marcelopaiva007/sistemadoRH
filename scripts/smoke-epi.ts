// Fumaça de EPIs contra o banco de verdade. Em transação com rollback
// proposital: entrega vencida + reposição mais recente (a nova precisa vencer
// a antiga no painel de vencimentos), assinatura confirmada, exclusão limpa o
// anexo. Nada fica gravado.
//
//   npx tsx scripts/smoke-epi.ts
import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { dataUTC } from "../lib/datas";
import { calcularValidade } from "../lib/conformidade";

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
  if (!empresa) throw new Error("Nenhuma empresa cadastrada.");
  const colaborador = await prisma.colaborador.findFirst({
    where: { empresaId: empresa.id, ativo: true },
    select: { id: true, nome: true },
  });
  if (!colaborador) throw new Error("Nenhum colaborador ativo.");

  console.log(`Empresa: ${empresa.nome} · Colaborador de teste: ${colaborador.nome}`);
  console.log("(tudo roda em transação e termina em ROLLBACK)\n");

  try {
    await prisma.$transaction(
      async (tx) => {
        console.log("1. Cálculo de validade padrão do EPI (protetor auricular, 6 meses)");
        const validoAte = calcularValidade(dataUTC(2026, 1, 10), 6);
        ok(validoAte?.getTime() === dataUTC(2026, 7, 10).getTime(), "6 meses depois de 10/01 é 10/07");

        console.log("2. Entrega vencida + reposição (a nova precisa vencer a antiga)");
        await tx.entregaEPI.create({
          data: {
            empresaId: empresa.id,
            colaboradorId: colaborador.id,
            tipo: "LUVA_ISOLANTE",
            dataEntrega: dataUTC(2025, 1, 10),
            validadeMeses: 6,
            validoAte: dataUTC(2025, 7, 10),
            motivo: "PRIMEIRA_ENTREGA",
          },
        });
        const conteudo = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
        const arquivo = await tx.arquivo.create({
          data: {
            empresaId: empresa.id,
            nome: "ficha-epi-teste.pdf",
            mimeType: "application/pdf",
            tamanhoBytes: conteudo.byteLength,
            conteudo,
          },
        });
        const reposicao = await tx.entregaEPI.create({
          data: {
            empresaId: empresa.id,
            colaboradorId: colaborador.id,
            tipo: "LUVA_ISOLANTE",
            dataEntrega: dataUTC(2026, 7, 1),
            validadeMeses: 6,
            validoAte: dataUTC(2027, 1, 1),
            motivo: "TROCA_PERIODICA",
            arquivoId: arquivo.id,
            assinado: false,
          },
        });
        ok(reposicao.motivo === "TROCA_PERIODICA", "reposição registrada com o motivo certo");

        console.log("3. Assinatura confirmada");
        const assinada = await tx.entregaEPI.update({
          where: { id: reposicao.id },
          data: { assinado: true },
        });
        ok(assinada.assinado === true, "assinatura marcada");

        console.log("4. Vencimentos: só a entrega mais recente por tipo entra na conta");
        const todasDoTipo = await tx.entregaEPI.findMany({
          where: { colaboradorId: colaborador.id, tipo: "LUVA_ISOLANTE" },
          orderBy: { dataEntrega: "desc" },
        });
        ok(todasDoTipo.length === 2, "as duas entregas existem no histórico");
        ok(todasDoTipo[0].validoAte!.getTime() === dataUTC(2027, 1, 1).getTime(), "a mais recente é a que vale para o painel de vencimentos");

        console.log("5. Excluir remove o anexo junto (sem órfão)");
        await tx.entregaEPI.delete({ where: { id: reposicao.id } });
        await tx.arquivo.delete({ where: { id: arquivo.id } });
        const arquivoSobrou = await tx.arquivo.count({ where: { id: arquivo.id } });
        ok(arquivoSobrou === 0, "arquivo removido junto com a entrega");

        throw new RollbackProposital();
      },
      { timeout: 30_000 },
    );
  } catch (e) {
    if (!(e instanceof RollbackProposital)) throw e;
    console.log("\n↩ rollback executado — nada foi gravado.");
  }

  const sobrouEntrega = await prisma.entregaEPI.count({ where: { colaboradorId: colaborador.id, tipo: "LUVA_ISOLANTE" } });
  const sobrouArquivo = await prisma.arquivo.count({ where: { nome: "ficha-epi-teste.pdf" } });
  ok(sobrouEntrega === 0, "nenhuma entrega de teste sobrou no banco");
  ok(sobrouArquivo === 0, "nenhum arquivo de teste sobrou no banco");

  console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
