// Diagnóstico read-only dos convites de pesquisa: quanto do teto diário já foi
// consumido, o que falhou e por quê, e quantos colaboradores estão sem contato.
// Nada aqui escreve no banco.
//
//   npm run diag:envios
import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { inicioDoDiaSaoPaulo } from "../lib/convites";
import { LIMITE_DIARIO_ENVIOS } from "../lib/constants-rh";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const emSaoPaulo = (d: Date) =>
  d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

async function main() {
  const inicio = inicioDoDiaSaoPaulo();

  // Conta por enviadoEm (não por status): é o que o provedor realmente
  // contabilizou. Status vira RESPONDED quando a pessoa responde.
  const enviadosHoje = await prisma.surveyToken.count({
    where: { enviadoEm: { gte: inicio } },
  });
  const restante = Math.max(0, LIMITE_DIARIO_ENVIOS - enviadosHoje);

  console.log("=== Teto do dia ===");
  console.log(`Dia (Brasília) começou em: ${emSaoPaulo(inicio)}`);
  console.log(`Enviados hoje:  ${enviadosHoje} de ${LIMITE_DIARIO_ENVIOS}`);
  console.log(`Ainda cabem:    ${restante}`);

  const porCanalStatus = await prisma.surveyToken.groupBy({
    by: ["canal", "status"],
    _count: { _all: true },
    orderBy: [{ canal: "asc" }, { status: "asc" }],
  });
  console.log("\n=== Convites por canal / status (total) ===");
  console.log("(convites PENDING ainda não têm canal definido)");
  for (const r of porCanalStatus) {
    console.log(`${r.canal.padEnd(10)} ${r.status.padEnd(10)} ${r._count._all}`);
  }

  const falhas = await prisma.surveyToken.findMany({
    where: { status: "FAILED" },
    select: { canal: true, erro: true, createdAt: true, colaborador: { select: { nome: true } } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  console.log("\n=== Últimas falhas (não são retentadas automaticamente) ===");
  if (falhas.length === 0) console.log("(nenhuma)");
  for (const f of falhas) {
    console.log(`[${f.canal}] ${emSaoPaulo(f.createdAt)} — ${f.colaborador.nome}`);
    console.log(`         ${f.erro}`);
  }

  const pendentes = await prisma.surveyToken.count({ where: { status: "PENDING" } });
  const semContato = await prisma.colaborador.count({
    where: { telegramChatId: null, email: null },
  });
  const soEmail = await prisma.colaborador.count({
    where: { telegramChatId: null, email: { not: null } },
  });
  const comTelegram = await prisma.colaborador.count({
    where: { telegramChatId: { not: null } },
  });

  console.log("\n=== Fila e contatos ===");
  console.log(`Convites pendentes: ${pendentes}`);
  if (pendentes > 0) {
    const dias = Math.ceil(pendentes / LIMITE_DIARIO_ENVIOS);
    console.log(`Ao ritmo do teto, saem em ~${dias} dia(s).`);
  }
  console.log(`Colaboradores — Telegram: ${comTelegram} | só e-mail: ${soEmail} | sem contato: ${semContato}`);
  if (semContato > 0) {
    console.log("ATENÇÃO: colaboradores sem contato nunca recebem convite (ficam FAILED).");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
