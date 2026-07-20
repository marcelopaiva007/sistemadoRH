// DRY-RUN (somente leitura) da importação automática do elleven.
// Usa os MÓDULOS REAIS (lib/elleven-core) para calcular o que
// importarLancamentosEllevenAuto geraria, SEM escrever no banco.
// Uso: npx tsx scripts/dry-run-import-elleven.ts 2026-07
import fs from "fs";
import { Client } from "pg";
import {
  acharFuncionario,
  agregarContratos,
  limparCidadeElleven,
  parseDataBr,
} from "@/lib/elleven-core";
import { normalizarTexto } from "@/lib/text";

const periodo = process.argv[2] ?? "2026-07";
const [ano, mes] = periodo.split("-").map(Number);

async function main() {
const env = fs.readFileSync(".env", "utf8");
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)![1];
const c = new Client({ connectionString: url, connectionTimeoutMillis: 20000 });
await c.connect();
const contratos = (
  await c.query(
    `select vendedor1, cidade, "ativacaoContrato","dataContrato","statusContrato","valServAtivado","servicoAtivado" from contrato_ativacao_elleven`,
  )
).rows as any[];
const funcionarios = (
  await c.query(`select id, nome from "Funcionario" where ativo=true`)
).rows as { id: string; nome: string }[];
await c.end();

const doPeriodo = contratos.filter((ct) => {
  const d = parseDataBr(ct.ativacaoContrato) ?? parseDataBr(ct.dataContrato);
  return d && d.getUTCFullYear() === ano && d.getUTCMonth() + 1 === mes;
});

const porVendedor = new Map<string, any[]>();
let semVendedor = 0;
for (const ct of doPeriodo) {
  const nome = (ct.vendedor1 || "").trim();
  if (!nome) {
    semVendedor++;
    continue;
  }
  (porVendedor.get(nome) ?? porVendedor.set(nome, []).get(nome)!).push(ct);
}

const porNomeExato = new Map(funcionarios.map((f) => [normalizarTexto(f.nome), f]));
let exato = 0,
  fuzzy = 0,
  criar = 0,
  totAprov = 0,
  totCanc = 0,
  totValor = 0,
  totLanc = 0;
const criarNomes: string[] = [];
for (const [nome, lista] of porVendedor) {
  const { modo } = acharFuncionario(nome, funcionarios, porNomeExato);
  if (modo === "EXATO") exato++;
  else if (modo === "FUZZY") fuzzy++;
  else {
    criar++;
    criarNomes.push(`${nome} [${limparCidadeElleven(lista[0].cidade) ?? "sem cidade"}] (${lista.length})`);
  }
  const ag = agregarContratos(lista);
  totLanc++;
  totAprov += ag.aprovado;
  totCanc += ag.cancelado;
  totValor += ag.valorInstalado;
}

console.log(`\n=== DRY-RUN importação ${periodo} (NADA foi gravado) ===`);
console.log(`Contratos no período : ${doPeriodo.length} (sem vendedor: ${semVendedor})`);
console.log(`Vendedores / lançamentos: ${porVendedor.size} / ${totLanc}`);
console.log(`  match exato : ${exato}`);
console.log(`  match fuzzy : ${fuzzy}`);
console.log(`  a criar     : ${criar}`);
console.log(`Aprovados: ${totAprov} | Cancelados: ${totCanc} | Valor instalado: R$ ${totValor.toFixed(2)}`);
console.log(`\nFuncionários que seriam criados (${criar}):`);
for (const n of criarNomes.slice(0, 40)) console.log("  - " + n);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
