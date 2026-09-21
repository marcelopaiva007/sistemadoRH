// A corrida do NSR — o número sequencial do ponto não pode repetir na empresa.
//
// O NSR é o Número Sequencial de Registro da Portaria MTP 671/2021, e o AFD o
// escreve como identificador da linha entregue à fiscalização. Ele é calculado
// como "maior da empresa + 1", que é ler-depois-escrever: entre a consulta e o
// insert cabe outra batida. Sem restrição no banco, as duas gravavam com o
// mesmo número — e ninguém percebia até a fiscalização abrir o arquivo.
//
// Este smoke bate de verdade contra Postgres, em paralelo, e confere que o
// banco recusa a repetição. Sem o índice único da migração 20260813180000 ele
// falha — que é exatamente o ponto.
//
// Rollback ao final: nada do que este teste cria sobrevive.

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

let falhas = 0;
function ok(condicao: boolean, descricao: string) {
  console.log(`${condicao ? "✅" : "❌"} ${descricao}`);
  if (!condicao) falhas++;
}

async function main() {
  const empresa = await prisma.empresa.findFirst({ select: { id: true } });
  const colaborador = await prisma.colaborador.findFirst({
    where: { empresaId: empresa?.id },
    select: { id: true, empresaId: true },
  });
  if (!colaborador) throw new Error("fixture sem colaborador — rode scripts/ci-fixture-banco.ts");

  const criados: string[] = [];
  const base = { empresaId: colaborador.empresaId, colaboradorId: colaborador.id, hashSHA256: "x" };

  try {
    console.log("\nO índice único existe e recusa NSR repetido\n");

    // O NSR precisa ser alto para não colidir com o que já houver na base.
    const maior = await prisma.registroPonto.findFirst({
      where: { empresaId: colaborador.empresaId },
      orderBy: { nsr: "desc" },
      select: { nsr: true },
    });
    const nsr = (maior?.nsr ?? BigInt(0)) + BigInt(1000);

    const primeiro = await prisma.registroPonto.create({
      data: { ...base, dataHora: new Date(), tipo: "ENTRADA_1", nsr },
    });
    criados.push(primeiro.id);
    ok(true, `primeira batida grava com NSR ${nsr}`);

    let recusou = false;
    try {
      const repetido = await prisma.registroPonto.create({
        data: { ...base, dataHora: new Date(), tipo: "SAIDA_1", nsr },
      });
      criados.push(repetido.id);
    } catch {
      recusou = true;
    }
    ok(recusou, "o banco RECUSA uma segunda batida com o mesmo NSR na mesma empresa");

    console.log("\nDuas batidas simultâneas: uma só pode vencer\n");

    // O DESFECHO da corrida é o que se testa aqui, e ele tem que ser
    // determinístico — senão o teste mede o escalonador, não o banco.
    //
    // A primeira versão disparava duas funções que faziam LER-depois-ESCREVER
    // em paralelo e afirmava `gravaram <= 1`. Isso só vale se as duas leituras
    // caírem antes de qualquer escrita. Quando o pool serializa (escrita da
    // primeira antes da leitura da segunda), a segunda lê o NSR recém-gravado,
    // calcula OUTRO número, e as duas gravam — vermelho sem defeito nenhum.
    // Aconteceu em 21/09/2026, num PR que não encostava em ponto: `gravaram 2`
    // com `duplicados: 0`, ou seja, o índice único intacto e a corrida apenas
    // não tendo ocorrido. Teste que pisca ensina o time a ignorar CI vermelha.
    //
    // Agora a leitura acontece UMA vez e as duas escritas saem com o MESMO
    // número — que é a situação real que o índice único existe para barrar:
    // duas batidas na virada de turno que calcularam o mesmo NSR. Sem depender
    // de quem chega primeiro, o resultado é sempre "uma grava, a outra é
    // recusada", e a asserção pode ser `=== 1` em vez de `<= 1`.
    const ultimo = await prisma.registroPonto.findFirst({
      where: { empresaId: colaborador.empresaId },
      orderBy: { nsr: "desc" },
      select: { nsr: true },
    });
    const mesmoNsr = (ultimo?.nsr ?? BigInt(0)) + BigInt(1);

    const corrida = await Promise.allSettled([
      prisma.registroPonto.create({
        data: { ...base, dataHora: new Date(), tipo: "ENTRADA_1", nsr: mesmoNsr },
      }),
      prisma.registroPonto.create({
        data: { ...base, dataHora: new Date(), tipo: "ENTRADA_2", nsr: mesmoNsr },
      }),
    ]);
    corrida.forEach((r) => r.status === "fulfilled" && criados.push(r.value.id));

    const gravaram = corrida.filter((r) => r.status === "fulfilled").length;
    ok(gravaram === 1, `exatamente uma das duas com o MESMO NSR grava (gravaram ${gravaram})`);

    // A prova final: nenhum NSR repetido na empresa, olhando a tabela inteira.
    const duplicados = await prisma.$queryRaw<{ nsr: bigint; quantas: bigint }[]>`
      SELECT "nsr", COUNT(*) AS quantas
      FROM "rh"."RegistroPonto"
      WHERE "empresaId" = ${colaborador.empresaId}
      GROUP BY "nsr" HAVING COUNT(*) > 1
    `;
    ok(duplicados.length === 0, `nenhum NSR repetido na empresa (achados: ${duplicados.length})`);
  } finally {
    if (criados.length) {
      await prisma.registroPonto.deleteMany({ where: { id: { in: criados } } });
    }
    await prisma.$disconnect();
  }

  console.log(falhas === 0 ? "\n✅ NSR: tudo certo\n" : `\n❌ ${falhas} falha(s)\n`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
