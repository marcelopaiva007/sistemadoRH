// Abre o ciclo de avaliação do 1º semestre de 2026 em todas as empresas e gera
// as avaliações automáticas (autoavaliação + gestor), como faz o botão "Gerar
// avaliações" da tela do ciclo — só que nas oito de uma vez, que pela tela
// seria oito idas e vindas.
//
//   npx tsx scripts/criar-ciclos-avaliacao-2026-s1.ts            (simulação)
//   npx tsx scripts/criar-ciclos-avaliacao-2026-s1.ts --aplicar  (grava)
//
// Reexecutar é seguro: reaproveita o ciclo que já existir com o mesmo nome e
// pula quem já tem avaliação daquele avaliador.
import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { dataUTC } from "../lib/datas";
import { AVALIADORES_AUTOMATICOS } from "../lib/constants-avaliacao";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const NOME_CICLO = "Avaliação 1 semestre de 2026";
const TIPO = "360";
const INICIO = dataUTC(2026, 7, 31);
const FIM = dataUTC(2026, 8, 8);
// Quem pediu o ciclo — o mesmo usuário que abriu o da BR SISTEMAS pela tela,
// para as oito linhas ficarem com a mesma autoria.
const AUTOR = { id: "cms7wxmy4000404l8bj6jqn49", nome: "Marcelo da Silva Paiva" };

const aplicar = process.argv.includes("--aplicar");

async function main() {
  const empresas = await prisma.empresa.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } });
  const semGestor: string[] = [];
  let totalAuto = 0;
  let totalGestor = 0;

  for (const empresa of empresas) {
    let ciclo = await prisma.cicloAvaliacao.findFirst({
      where: { empresaId: empresa.id, nome: NOME_CICLO },
      select: { id: true, encerrado: true },
    });
    const jaExistia = !!ciclo;

    if (!ciclo) {
      if (aplicar) {
        ciclo = await prisma.cicloAvaliacao.create({
          data: {
            empresaId: empresa.id,
            nome: NOME_CICLO,
            tipo: TIPO,
            dataInicio: INICIO,
            dataFim: FIM,
            criadoPorId: AUTOR.id,
            criadoPorNome: AUTOR.nome,
          },
          select: { id: true, encerrado: true },
        });
        await prisma.auditLog.create({
          data: {
            empresaId: empresa.id,
            usuarioId: AUTOR.id,
            usuarioNome: AUTOR.nome,
            usuarioRole: "ADMIN",
            acao: "CRIAR",
            entidade: "CicloAvaliacao",
            entidadeId: ciclo.id,
            resumo: `Ciclo de avaliação "${NOME_CICLO}" (360°) criado em lote para todas as empresas.`,
          },
        });
      } else {
        ciclo = { id: "(simulado)", encerrado: false };
      }
    }

    if (ciclo.encerrado) {
      console.log(`${empresa.nome}: ciclo encerrado — nada a gerar.`);
      continue;
    }

    const colaboradores = await prisma.colaborador.findMany({
      where: { empresaId: empresa.id, ativo: true },
      select: { id: true, nome: true, supervisorId: true, supervisor: { select: { nome: true } } },
    });

    const existentes =
      ciclo.id === "(simulado)"
        ? []
        : await prisma.avaliacaoDesempenho.findMany({
            where: { cicloId: ciclo.id },
            select: { colaboradorId: true, avaliadorId: true },
          });
    const jaTem = new Set(existentes.map((e) => `${e.colaboradorId}:${e.avaliadorId}`));

    const tipos = AVALIADORES_AUTOMATICOS[TIPO] ?? [];
    const linhas: {
      empresaId: string;
      colaboradorId: string;
      cicloId: string;
      tipoAvaliador: string;
      avaliadorId: string;
      avaliadorNome: string | null;
    }[] = [];

    for (const c of colaboradores) {
      if (tipos.includes("AUTOAVALIACAO") && !jaTem.has(`${c.id}:${c.id}`)) {
        linhas.push({
          empresaId: empresa.id,
          colaboradorId: c.id,
          cicloId: ciclo.id,
          tipoAvaliador: "AUTOAVALIACAO",
          avaliadorId: c.id,
          avaliadorNome: c.nome,
        });
      }
      if (tipos.includes("GESTOR")) {
        if (!c.supervisorId) semGestor.push(`${empresa.nome} · ${c.nome}`);
        else if (!jaTem.has(`${c.id}:${c.supervisorId}`)) {
          linhas.push({
            empresaId: empresa.id,
            colaboradorId: c.id,
            cicloId: ciclo.id,
            tipoAvaliador: "GESTOR",
            avaliadorId: c.supervisorId,
            avaliadorNome: c.supervisor?.nome ?? null,
          });
        }
      }
    }

    const auto = linhas.filter((l) => l.tipoAvaliador === "AUTOAVALIACAO").length;
    const gestor = linhas.length - auto;
    totalAuto += auto;
    totalGestor += gestor;

    if (aplicar && linhas.length > 0) {
      await prisma.avaliacaoDesempenho.createMany({ data: linhas });
      await prisma.auditLog.create({
        data: {
          empresaId: empresa.id,
          usuarioId: AUTOR.id,
          usuarioNome: AUTOR.nome,
          usuarioRole: "ADMIN",
          acao: "CRIAR",
          entidade: "AvaliacaoDesempenho",
          entidadeId: ciclo.id,
          resumo: `${linhas.length} avaliação(ões) geradas em lote para o ciclo "${NOME_CICLO}".`,
        },
      });
    }

    console.log(
      `${empresa.nome}: ciclo ${jaExistia ? "reaproveitado" : "criado"} · ` +
        `${colaboradores.length} ativos · +${auto} autoavaliação · +${gestor} gestor`,
    );
  }

  console.log(`\nTotal: ${totalAuto} autoavaliações e ${totalGestor} avaliações de gestor.`);
  if (semGestor.length > 0) {
    console.log(`\n${semGestor.length} pessoa(s) sem supervisor no cadastro — ficam só com a autoavaliação:`);
    for (const p of semGestor) console.log(`  · ${p}`);
  }
  if (!aplicar) console.log("\n(simulação — nada foi gravado; rode com --aplicar)");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
