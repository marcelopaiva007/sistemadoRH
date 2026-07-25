// Testes do BI inicial (lib/bi.ts). Não toca o banco.
//   npx tsx scripts/test-bi.ts
import {
  absenteismoPorSetor,
  calcularTurnover,
  custoPessoalPorSetor,
  headcountPorSetor,
  movimentoMensal,
} from "@/lib/bi";
import { dataUTC } from "@/lib/datas";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

const HOJE = dataUTC(2026, 7, 25);

console.log("1. Headcount por setor");
const hc = headcountPorSetor([
  { setorNome: "Comercial" }, { setorNome: "Comercial" }, { setorNome: "Comercial" },
  { setorNome: "Técnico" }, { setorNome: "Técnico" },
  { setorNome: "Administrativo" },
]);
ok(hc[0].setor === "Comercial" && hc[0].total === 3, "maior setor vem primeiro");
ok(hc.length === 3, "3 setores distintos");

console.log("2. Turnover");
const vinculos = [
  { dataAdmissao: dataUTC(2020, 1, 1), dataDesligamento: null },
  { dataAdmissao: dataUTC(2026, 1, 10), dataDesligamento: null }, // admitido no período
  { dataAdmissao: dataUTC(2019, 1, 1), dataDesligamento: dataUTC(2026, 3, 1) }, // desligado no período
  { dataAdmissao: dataUTC(2010, 1, 1), dataDesligamento: dataUTC(2024, 1, 1) }, // desligado FORA do período
];
const turnover = calcularTurnover(vinculos, 2, HOJE, 12); // headcountAtual=2 (os dois primeiros ainda ativos)
ok(turnover.desligados === 1, "só conta desligamento dentro dos últimos 12 meses");
ok(turnover.admissoes === 1, "só conta admissão dentro dos últimos 12 meses");
ok(turnover.headcountInicio === 2, "reconstrução: 2 (fim) - 1 (admitiu) + 1 (desligou) = 2");
ok(Math.abs(turnover.taxaPct - 50) < 0.01, "1 desligado / média 2 = 50%");

console.log("3. Movimento mensal");
const meses = movimentoMensal(vinculos, HOJE, 12);
ok(meses.length === 12, "12 meses no relatório");
ok(meses[meses.length - 1].mes === "07/2026", "o último mês é o mês corrente");
const mesDoDesligamento = meses.find((m) => m.mes === "03/2026");
ok(mesDoDesligamento?.desligamentos === 1, "o desligamento aparece no mês certo");

console.log("4. Absenteísmo");
const ausencias = [
  { setorNome: "Comercial", dias: 3, abonada: false, dataInicio: dataUTC(2026, 7, 10) },
  { setorNome: "Comercial", dias: 5, abonada: true, dataInicio: dataUTC(2026, 7, 12) }, // abonada, não conta
  { setorNome: "Comercial", dias: 2, abonada: false, dataInicio: dataUTC(2026, 1, 1) }, // fora da janela
];
const absent = absenteismoPorSetor(ausencias, hc, HOJE, 30, 22);
const comercial = absent.find((a) => a.setor === "Comercial")!;
ok(comercial.diasFalta === 3, "só a falta não abonada e dentro da janela entra");
ok(Math.abs(comercial.taxaPct - (3 / (3 * 22)) * 100) < 0.01, "taxa = dias de falta / (headcount × dias úteis)");
const tecnico = absent.find((a) => a.setor === "Técnico")!;
ok(tecnico.diasFalta === 0, "setor sem falta fica em zero, não some da lista");

console.log("5. Custo de pessoal");
const custo = custoPessoalPorSetor(
  [
    { setorNome: "Comercial", salarioBase: 2000 },
    { setorNome: "Comercial", salarioBase: 2500 },
    { setorNome: "Técnico", salarioBase: 3000 },
  ],
  [
    { setorNome: "Comercial", valorEmpresa: 350 },
    { setorNome: "Administrativo", valorEmpresa: 100 }, // setor sem colaborador na folha, mas com benefício
  ],
);
const custoComercial = custo.find((c) => c.setor === "Comercial")!;
ok(custoComercial.folha === 4500, "soma o salário base dos colaboradores do setor");
ok(custoComercial.beneficios === 350, "soma o custo de benefícios vigentes do setor");
ok(custoComercial.total === 4850, "total = folha + benefícios");
ok(custo.some((c) => c.setor === "Administrativo" && c.folha === 0), "setor só com benefício também aparece");
ok(custo[0].setor === "Comercial", "maior custo total vem primeiro");

console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
