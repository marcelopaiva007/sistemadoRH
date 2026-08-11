// Fumaça da criação idempotente de ciclo de pesquisa (lib/pesquisa-ciclo.ts)
// contra o banco de verdade.
//
// Reproduz o incidente de 31/07/2026: invocações simultâneas (cron × botão
// manual) criando o mesmo ciclo. Três chamadas concorrentes de
// criarCicloRascunho para a mesma marca+título devem resultar em UMA pesquisa
// — as demais devolvem a existente (jaExistia). Também confere o índice único
// parcial Pesquisa_marcaId_titulo_key: barra rascunho duplicado que contorne a
// função, mas NÃO barra as campanhas permanentes por evento (P06/P09), que
// nascem ACTIVE com título fixo e são recriadas com o mesmo título quando a
// anterior encerra.
//
// Cria marca e empresa próprias, INATIVAS (o cron e as telas ignoram), e apaga
// tudo no finally — inclusive sobras de uma execução anterior interrompida.
//
//   npx tsx scripts/smoke-ciclo-pesquisa.ts
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { criarCicloRascunho, type CicloCandidato } from "../lib/pesquisa-ciclo";
import { violouUnique } from "../lib/prisma-erros";

const NOME_MARCA = "ZZ SMOKE CICLO (apagar)";
const NOME_EMPRESA = "ZZ SMOKE CICLO LTDA (apagar)";
const TITULO = "Pulso de Clima 2099 T1";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

async function limpar() {
  const marca = await prisma.marca.findUnique({ where: { nome: NOME_MARCA } });
  if (!marca) return;
  await prisma.pergunta.deleteMany({ where: { pesquisa: { marcaId: marca.id } } });
  await prisma.pesquisa.deleteMany({ where: { marcaId: marca.id } });
  await prisma.empresa.deleteMany({ where: { marcaId: marca.id } });
  await prisma.marca.delete({ where: { id: marca.id } });
}

async function main() {
  await limpar(); // sobras de execução anterior interrompida

  const marca = await prisma.marca.create({
    data: { nome: NOME_MARCA, ativo: false },
  });
  const empresa = await prisma.empresa.create({
    data: { nome: NOME_EMPRESA, marcaId: marca.id, ativo: false },
  });

  try {
    // Ano improvável de propósito: o título não pode colidir com ciclo real.
    const cand: CicloCandidato = {
      marcaId: marca.id,
      marcaNome: marca.nome,
      empresaId: empresa.id,
      empresaNome: empresa.nome,
      tipo: "PULSO",
      ano: 2099,
      trimestre: 1,
    };

    console.log("1. Três criações concorrentes do mesmo ciclo");
    const resultados = await Promise.all([
      criarCicloRascunho(cand),
      criarCicloRascunho(cand),
      criarCicloRascunho(cand),
    ]);

    const criados = resultados.filter((r) => !r.jaExistia);
    const ids = new Set(resultados.map((r) => r.pesquisaId));
    ok(criados.length === 1, `exatamente uma chamada criou (${criados.length} criaram)`);
    ok(ids.size === 1, "as três chamadas devolveram a MESMA pesquisa");

    const noBanco = await prisma.pesquisa.findMany({
      where: { marcaId: marca.id, titulo: TITULO },
      include: { _count: { select: { perguntas: true } } },
    });
    ok(noBanco.length === 1, `uma única pesquisa no banco (há ${noBanco.length})`);
    ok(noBanco[0]?._count.perguntas === 6, "pulso nasceu com as 6 perguntas");
    ok(noBanco[0]?.status === "DRAFT", "nasceu em DRAFT (RH ativa depois)");

    console.log("2. Chamada repetida depois do commit");
    const denovo = await criarCicloRascunho(cand);
    ok(denovo.jaExistia, "reexecução devolve a existente em vez de criar");
    ok(denovo.pesquisaId === noBanco[0]?.id, "e é a mesma pesquisa");

    console.log("3. Índice único parcial segura rascunho que contorna a função");
    try {
      await prisma.pesquisa.create({
        data: {
          marcaId: marca.id,
          empresaId: empresa.id,
          titulo: TITULO,
          modelo: "CLIMA",
          anonima: true,
          status: "DRAFT",
        },
      });
      ok(false, "rascunho direto com título repetido deveria ter falhado");
    } catch (e) {
      ok(
        violouUnique(e, "Pesquisa_marcaId_titulo_key"),
        "UNIQUE parcial (marcaId, titulo) WHERE DRAFT barrou o rascunho duplicado",
      );
    }

    console.log("4. Campanha por evento (título fixo, ACTIVE) não é barrada");
    // Padrão P06/P09: campanha nasce ACTIVE; encerrada, é recriada com o
    // MESMO título. O índice parcial não pode atrapalhar esse fluxo.
    const camp1 = await prisma.pesquisa.create({
      data: { marcaId: marca.id, empresaId: empresa.id, titulo: "ZZ Campanha Permanente", modelo: "P06-ONB30", anonima: false, status: "ACTIVE" },
    });
    await prisma.pesquisa.update({ where: { id: camp1.id }, data: { status: "FINISHED" } });
    const camp2 = await prisma.pesquisa.create({
      data: { marcaId: marca.id, empresaId: empresa.id, titulo: "ZZ Campanha Permanente", modelo: "P06-ONB30", anonima: false, status: "ACTIVE" },
    });
    ok(camp2.id !== camp1.id, "campanha recriada com o mesmo título após encerrar a anterior");
  } finally {
    await limpar();
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    if (falhas > 0) {
      console.error(`\n${falhas} verificação(ões) falharam.`);
      process.exit(1);
    }
    console.log("\nTudo certo.");
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
