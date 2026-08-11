// Confere as consultas do BI inicial contra o banco real. Read-only — não
// escreve nada, então não precisa de transação/rollback como os smoke tests
// dos outros módulos.
//   npx tsx scripts/verificar-bi.ts
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { hojeUTC } from "@/lib/datas";
import { absenteismoPorSetor, calcularTurnover, custoPessoalPorSetor, headcountPorSetor, movimentoMensal } from "@/lib/bi";
import { empresaDeTeste } from "./_empresa-de-teste";

async function main() {
  const empresa = await empresaDeTeste(prisma, { comSetor: true });
  if (!empresa) throw new Error("Nenhuma empresa cadastrada.");
  console.log(`Empresa: ${empresa.nome}\n`);

  const hoje = hojeUTC();
  const [ativos, todosOsVinculos, ausenciasRecentes, beneficiosVigentes] = await Promise.all([
    prisma.colaborador.findMany({
      where: { empresaId: empresa.id, ativo: true },
      select: { setor: { select: { nome: true } }, salarioBase: true },
    }),
    prisma.colaborador.findMany({
      where: { empresaId: empresa.id },
      select: { dataAdmissao: true, dataDesligamento: true },
    }),
    prisma.ausencia.findMany({
      where: { empresaId: empresa.id, dataInicio: { gte: new Date(hoje.getTime() - 40 * 86_400_000) } },
      select: { dias: true, abonada: true, dataInicio: true, colaborador: { select: { setor: { select: { nome: true } } } } },
    }),
    prisma.beneficioColaborador.findMany({
      where: { empresaId: empresa.id, OR: [{ dataFim: null }, { dataFim: { gte: hoje } }], colaborador: { ativo: true } },
      select: { valorEmpresa: true, colaborador: { select: { setor: { select: { nome: true } } } } },
    }),
  ]);

  const headcount = headcountPorSetor(ativos.map((c) => ({ setorNome: c.setor.nome })));
  console.log("Headcount por setor:", headcount);

  const turnover = calcularTurnover(todosOsVinculos, ativos.length, hoje);
  console.log("\nTurnover 12 meses:", turnover);

  const movimento = movimentoMensal(todosOsVinculos, hoje);
  console.log("\nMovimento mensal (últimos 3 meses):", movimento.slice(-3));

  const absenteismo = absenteismoPorSetor(
    ausenciasRecentes.map((a) => ({ setorNome: a.colaborador.setor.nome, dias: a.dias, abonada: a.abonada, dataInicio: a.dataInicio })),
    headcount,
    hoje,
  );
  console.log("\nAbsenteísmo por setor:", absenteismo);

  const custo = custoPessoalPorSetor(
    ativos.map((c) => ({ setorNome: c.setor.nome, salarioBase: c.salarioBase })),
    beneficiosVigentes.map((b) => ({ setorNome: b.colaborador.setor.nome, valorEmpresa: b.valorEmpresa })),
  );
  console.log("\nCusto de pessoal por setor:", custo);

  console.log(`\n✔ Consultas rodaram sem erro contra ${ativos.length} colaborador(es) ativo(s).`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
