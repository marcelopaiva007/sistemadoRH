// Transferência no grupo fora das contas de turnover (v1.214.0). Não toca o banco.
//
// Regra do CEO (25/11/2026): transferência entre empresas do grupo NÃO conta
// como desligamento nem como admissão. O que este teste prova:
//   1. `marcarTransferencias` reconhece a saída (pelo motivo) e a chegada (pela
//      ficha de origem: mesmo CPF, destino = este CNPJ, dentro da tolerância);
//   2. a taxa ignora as transferências, mas o QUADRO reconstruído continua certo
//      — no grupo, no CNPJ de origem e no de destino;
//   3. a ficha nova que herdou a admissão original não conta a pessoa duas vezes;
//   4. a série mensal, o radar, a foto mensal e a narrativa falam a mesma língua;
//   5. o setor em que o desligado conta (retrato da época x setor atual).
//
//   npx tsx scripts/test-transferencias-turnover.ts
import { calcularTurnover, headcountMensal, movimentoMensal } from "@/lib/bi";
import { dataUTC } from "@/lib/datas";
import { marcarTransferencias, type SaidaPorTransferencia } from "@/lib/transferencia";
import { montarUnidadesDeDesligamento } from "@/lib/anomalias";
import { mesclarSerieComFotos } from "@/lib/painel-setor";
import { setorParaContas } from "@/lib/retrato-desligamento";
import { montarNarrativa } from "@/lib/narrativa";
import { medirMalhaLideranca } from "@/lib/lideranca";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

const HOJE = dataUTC(2026, 11, 25);
const A = "cnpj-a";
const B = "cnpj-b";

// X: 3 anos no CNPJ A, transferida para o B em 01/05/2026 (ficha nova admitida em 02/05).
// Y: dispensada do A em 01/03/2026. Z: contratada no A em 01/02/2026.
const fichas = [
  { id: "x-a", empresaId: A, cpf: "111.222.333-44", ativo: false, dataAdmissao: dataUTC(2023, 1, 10), dataDesligamento: dataUTC(2026, 5, 1), motivoDesligamento: "TRANSFERENCIA_GRUPO" },
  { id: "x-b", empresaId: B, cpf: "11122233344", ativo: true, dataAdmissao: dataUTC(2026, 5, 2), dataDesligamento: null, motivoDesligamento: null },
  { id: "y-a", empresaId: A, cpf: "55566677788", ativo: false, dataAdmissao: dataUTC(2025, 1, 1), dataDesligamento: dataUTC(2026, 3, 1), motivoDesligamento: "SEM_JUSTA_CAUSA" },
  { id: "z-a", empresaId: A, cpf: "99988877766", ativo: true, dataAdmissao: dataUTC(2026, 2, 1), dataDesligamento: null, motivoDesligamento: null },
];
const saidas: SaidaPorTransferencia[] = [
  { id: "x-a", empresaId: A, cpf: "111.222.333-44", dataAdmissao: dataUTC(2023, 1, 10), dataDesligamento: dataUTC(2026, 5, 1), transferidoParaEmpresaId: B },
];

console.log("1. Marcação das fichas");
const marcadas = marcarTransferencias(fichas, saidas);
const porId = new Map(marcadas.map((m) => [m.id, m]));
ok(porId.get("x-a")!.saidaPorTransferencia, "a ficha encerrada como transferência é saída por transferência");
ok(porId.get("x-b")!.entradaPorTransferencia, "a ficha nova no destino é chegada por transferência (CPF com e sem pontuação casa)");
ok(!porId.get("y-a")!.saidaPorTransferencia && !porId.get("z-a")!.entradaPorTransferencia, "dispensa e contratação comuns não são marcadas");
ok(porId.get("x-b")!.inicioNoGrupo?.getTime() === dataUTC(2023, 1, 10).getTime(), "tempo de casa no grupo começa na admissão do CNPJ de origem");
ok(porId.get("x-b")!.dataAdmissao?.getTime() === dataUTC(2026, 5, 2).getTime(), "dataAdmissao continua a do cadastro");

const emOutroCnpj = marcarTransferencias([{ ...fichas[1], empresaId: "cnpj-c" }], saidas)[0];
ok(!emOutroCnpj.entradaPorTransferencia, "chegada só conta no CNPJ de destino registrado");

const recontratada = marcarTransferencias([{ ...fichas[1], dataAdmissao: dataUTC(2026, 11, 20) }], saidas)[0];
ok(!recontratada.entradaPorTransferencia, "admissão 200 dias depois da transferência é recontratação, não chegada");

const semCpf = marcarTransferencias([{ ...fichas[1], cpf: null }], saidas)[0];
ok(!semCpf.entradaPorTransferencia, "ficha sem CPF não é reconhecida como chegada");

console.log("2. Turnover do grupo (os dois CNPJs juntos)");
const grupo = calcularTurnover(marcadas, 2, HOJE, 12);
ok(grupo.desligados === 1, "desligados = 1 (só a dispensa; a transferência fica fora)");
ok(grupo.admissoes === 1, "admissões = 1 (só a contratação; a chegada fica fora)");
ok(grupo.saidasPorTransferencia === 1 && grupo.entradasPorTransferencia === 1, "transferências contadas à parte");
ok(grupo.headcountInicio === 2, "quadro do início = 2 (X e Y), a pessoa transferida conta uma vez");
ok(Math.abs(grupo.taxaPct - 50) < 0.001, "taxa = 1 ÷ 2 = 50% (era 100% contando a transferência)");

console.log("3. Turnover por CNPJ");
const deA = calcularTurnover(marcadas.filter((v) => v.empresaId === A), 1, HOJE, 12);
ok(deA.desligados === 1 && deA.headcountInicio === 2, "A: 1 desligamento, começou com 2 (X saiu por transferência, mas estava lá)");
const deB = calcularTurnover(marcadas.filter((v) => v.empresaId === B), 1, HOJE, 12);
ok(deB.admissoes === 0 && deB.headcountInicio === 0 && deB.taxaPct === 0, "B: chegada não é contratação, começou com 0");

console.log("4. Ficha nova que herdou a admissão original");
const herdou = marcarTransferencias(
  fichas.map((f) => (f.id === "x-b" ? { ...f, dataAdmissao: dataUTC(2023, 1, 10) } : f)),
  saidas,
);
const xbHerdou = herdou.find((f) => f.id === "x-b")!;
ok(xbHerdou.entradaPorTransferencia, "continua reconhecida como chegada");
ok(xbHerdou.dataAdmissaoNoQuadro?.getTime() === dataUTC(2026, 5, 1).getTime(), "no quadro, entra na data da transferência");
const grupoHerdou = calcularTurnover(herdou, 2, HOJE, 12);
ok(grupoHerdou.headcountInicio === 2, "quadro do início continua 2 — sem o ajuste a pessoa contaria em dobro (daria 3)");

console.log("5. Série mensal e quadro mês a mês");
const serie = movimentoMensal(marcadas, HOJE, 12);
const maio = serie.find((m) => m.mes === "05/2026")!;
ok(maio.desligamentos === 0 && maio.admissoes === 0, "maio/2026: nenhuma admissão ou desligamento de verdade");
ok(maio.saidasPorTransferencia === 1 && maio.entradasPorTransferencia === 1, "maio/2026: uma saída e uma chegada por transferência");
const quadro = headcountMensal(marcadas, 2, HOJE, 12);
const abr = quadro.find((m) => m.mes === "04/2026")!.total;
const mai = quadro.find((m) => m.mes === "05/2026")!.total;
ok(abr === 2 && mai === 2, "quadro do grupo não oscila no mês da transferência (2 → 2)");
const quadroA = headcountMensal(marcadas.filter((v) => v.empresaId === A), 1, HOJE, 12);
ok(
  quadroA.find((m) => m.mes === "04/2026")!.total === 2 && quadroA.find((m) => m.mes === "05/2026")!.total === 1,
  "quadro do CNPJ A cai de 2 para 1 em maio — a pessoa saiu de lá",
);

console.log("6. Radar de desvio");
const radar = montarUnidadesDeDesligamento(
  marcadas.map((v) => ({
    empresaId: v.empresaId,
    empresaNome: v.empresaId,
    marcaId: "m",
    marcaNome: "Marca",
    ativo: v.ativo,
    dataDesligamento: v.dataDesligamento,
    saidaPorTransferencia: v.saidaPorTransferencia,
  })),
  HOJE,
  24,
);
const doGrupo = radar.unidades.find((u) => u.nivel === "grupo")!;
ok(doGrupo.serie.reduce((t, p) => t + p.desligamentos, 0) === 1, "a série do radar conta só a dispensa, não a transferência");

console.log("7. Foto mensal (Painel do setor)");
const mescla = mesclarSerieComFotos(
  [
    { mes: "05/2026", total: 10, admissoes: 0, desligamentos: 0, entradasPorTransferencia: 1, saidasPorTransferencia: 2 },
    { mes: "06/2026", total: 9, admissoes: 1, desligamentos: 1, entradasPorTransferencia: 0, saidasPorTransferencia: 0 },
  ],
  new Map([["2026-05", { headcount: 11, admissoes: 3, desligamentos: 1 }]]),
);
ok(mescla[0].fotografado && mescla[0].total === 11, "mês fotografado: o quadro vem da foto");
ok(mescla[0].admissoes === 2, "admissões da foto descontam a chegada por transferência (3 − 1)");
ok(mescla[0].desligamentos === 0, "desligamentos da foto descontam as saídas por transferência, sem ficar negativo (1 − 2 → 0)");
ok(!mescla[1].fotografado && mescla[1].desligamentos === 1, "mês sem foto passa como veio");

console.log("8. Setor em que o desligado conta");
ok(setorParaContas({ ativo: false, setor: { nome: "Financeiro" }, retratoDesligamento: { setorNome: "Comercial" } }) === "Comercial", "desligado com retrato conta no setor da época");
ok(setorParaContas({ ativo: false, setor: { nome: "Financeiro" }, retratoDesligamento: { setorNome: "Não definido" } }) === "Financeiro", "retrato em \"Não definido\" cede ao setor corrigido na ficha");
ok(setorParaContas({ ativo: false, setor: { nome: "Financeiro" }, retratoDesligamento: null }) === "Financeiro", "desligado sem retrato (histórico) conta no setor atual");
ok(setorParaContas({ ativo: true, setor: { nome: "Estoque" }, retratoDesligamento: { setorNome: "Comercial" } }) === "Estoque", "reativado conta no setor atual, não no retrato antigo");

console.log("9. Narrativa do saldo por CNPJ");
const narrativa = montarNarrativa({
  janelaMeses: 12,
  anomalias: [],
  desligamentos: [],
  saldos: [
    {
      empresaId: A,
      nome: "Empresa A",
      ativos: 7,
      admissoes: 0,
      desligamentos: 3,
      saidasPorTransferencia: 5,
      entradasPorTransferencia: 0,
      desligadosSemData: 0,
    },
  ],
  malha: medirMalhaLideranca([]),
  hoje: HOJE,
});
const fatoSaldo = JSON.stringify(narrativa);
ok(fatoSaldo.includes("~15 para 7"), "o quadro do início desfaz as transferências (7 + 3 + 5 = 15)");
ok(fatoSaldo.includes("5 saída(s)"), "o texto diz que houve transferências fora da conta");

if (falhas > 0) {
  console.error(`\n${falhas} verificação(ões) falharam.`);
  process.exit(1);
}
console.log("\nTudo certo.");
