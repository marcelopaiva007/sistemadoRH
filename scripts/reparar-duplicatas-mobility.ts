// Repara as 6 duplicatas criadas por criar-mobility-e-estagiarios.ts.
//
//   npx tsx scripts/reparar-duplicatas-mobility.ts            (simulação)
//   npx tsx scripts/reparar-duplicatas-mobility.ts --gravar   (aplica)
//
// A causa: aquele script conferia se a pessoa já existia apenas DENTRO da
// empresa de destino (`where: { empresaId }`), não no sistema inteiro. Os 4 da
// Mobility Tech já estavam na VAPT e os 2 estagiários na RSM — em vez de serem
// movidos, ganharam registro novo.
//
// É o segundo caso do mesmo tipo em 31/07/2026: antes a comparação de CPF
// ignorava o formato, agora ignorou o escopo. A lição comum: conferir
// existência SEMPRE global, por CPF em dígitos, antes de criar colaborador.
//
// O reparo move o registro antigo para a empresa nova (levando setor, cargo e
// histórico) e apaga o criado hoje.
import "dotenv/config";
import { prisma } from "../lib/prisma";

const GRAVAR = process.argv.includes("--gravar");
const CORTE = new Date("2026-07-31T12:00:00Z");

async function main() {
  const dup = (await prisma.$queryRawUnsafe(
    `SELECT cpf FROM rh."Colaborador" WHERE cpf IS NOT NULL GROUP BY cpf HAVING COUNT(*) > 1`,
  )) as { cpf: string }[];

  console.log(`${GRAVAR ? "APLICANDO" : "SIMULAÇÃO (use --gravar para aplicar)"}\n`);
  console.log(`CPFs duplicados: ${dup.length}\n`);

  let ok = 0;
  for (const { cpf } of dup) {
    const cs = await prisma.colaborador.findMany({
      where: { cpf },
      select: {
        id: true,
        nome: true,
        empresaId: true,
        setorId: true,
        posicaoId: true,
        createdAt: true,
        empresa: { select: { nome: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const antigo = cs.find((c) => c.createdAt < CORTE);
    const novo = cs.find((c) => c.createdAt >= CORTE);
    if (!antigo || !novo || cs.length !== 2) {
      console.log(`  ? ${cpf} — ${cs.length} registros, fora do padrão. Revisar à mão.`);
      continue;
    }

    console.log(
      `  ${antigo.nome.slice(0, 28).padEnd(30)} ${antigo.empresa.nome.slice(0, 16).padEnd(18)} -> ${novo.empresa.nome}`,
    );

    if (GRAVAR) {
      // O registro novo tem o destino certo (empresa, setor, cargo); o antigo
      // tem o histórico. Leva o destino para o antigo e apaga o novo.
      // Apagar primeiro por causa da unicidade (empresaId, cpf).
      await prisma.$transaction([
        prisma.colaborador.delete({ where: { id: novo.id } }),
        prisma.colaborador.update({
          where: { id: antigo.id },
          data: { empresaId: novo.empresaId, setorId: novo.setorId, posicaoId: novo.posicaoId },
        }),
        prisma.solicitacaoFerias.updateMany({
          where: { colaboradorId: antigo.id },
          data: { empresaId: novo.empresaId },
        }),
        prisma.documentoColaborador.updateMany({
          where: { colaboradorId: antigo.id },
          data: { empresaId: novo.empresaId },
        }),
      ]);
    }
    ok++;
  }

  console.log(`\n=== RESUMO ===`);
  console.log(`  Reparados: ${ok}`);
  console.log(GRAVAR ? "\nAplicado." : "\nNada foi gravado.");
}

main().finally(() => prisma.$disconnect());
