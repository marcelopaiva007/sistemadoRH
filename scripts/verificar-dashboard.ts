// Confere o resumo do dashboard contra contagens feitas de forma independente.
// READ-ONLY.
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { resumoDaEmpresa } from "../lib/dashboard";
import { hojeUTC, somarMesesUTC } from "../lib/datas";

let falhas = 0;
const ok = (c: boolean, m: string) => {
  console.log(c ? `  ✓ ${m}` : `  ✗ FALHOU: ${m}`);
  if (!c) falhas++;
};

async function main() {
  const empresas = await prisma.empresa.findMany({ where: { ativo: true }, select: { id: true, nome: true } });
  for (const e of empresas) {
    console.log(`\n${e.nome}`);
    // A assinatura passou a receber a lista de CNPJs da marca; aqui o teste
    // confere empresa a empresa, entao a lista tem um elemento so.
    const r = await resumoDaEmpresa([e.id]);

    const ativosReal = await prisma.colaborador.count({ where: { empresaId: e.id, ativo: true } });
    ok(r.ativos === ativosReal, `ativos: ${r.ativos} (independente: ${ativosReal})`);

    const semSalarioReal = await prisma.colaborador.count({
      where: { empresaId: e.id, ativo: true, salarioBase: null },
    });
    ok(r.semSalario === semSalarioReal, `sem salário: ${r.semSalario} (independente: ${semSalarioReal})`);

    const hoje = hojeUTC();
    const adm = await prisma.colaborador.count({
      where: { empresaId: e.id, dataAdmissao: { gte: somarMesesUTC(hoje, -12), lte: hoje } },
    });
    ok(r.admissoes12m === adm, `admissões 12m: ${r.admissoes12m} (independente: ${adm})`);

    ok(r.turnoverPct >= 0 && r.turnoverPct <= 1000, `turnover num intervalo sane: ${r.turnoverPct.toFixed(1)}%`);
    ok(r.absenteismoPct >= 0 && r.absenteismoPct <= 100, `absenteísmo entre 0 e 100: ${r.absenteismoPct.toFixed(2)}%`);
    ok(r.custoFolha >= 0, `custo folha não negativo: ${r.custoFolha}`);
    console.log(`    (custo total: ${r.custoFolha + r.custoBeneficios}, dias falta 30d: ${r.diasFalta30d})`);
  }

  console.log(falhas === 0 ? "\nTodas as verificações passaram." : `\n${falhas} falharam.`);
  process.exit(falhas === 0 ? 0 : 1);
}
main().finally(() => prisma.$disconnect());
