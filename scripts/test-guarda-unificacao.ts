// A guarda das fusões de setor/cargo — a regra que impede um clique de migrar
// colaboradores entre CNPJs.
//
//   npx tsx scripts/test-guarda-unificacao.ts

import { validarFusao, type AlvoDaFusao } from "../lib/actions/guarda-unificacao";

let falhas = 0;
function ok(condicao: boolean, descricao: string) {
  console.log(`${condicao ? "✅" : "❌"} ${descricao}`);
  if (!condicao) falhas++;
}

// Os CNPJs que a pessoa alcança — na action isto vem de `empresasVisiveis`.
// Aqui entra direto: a regra sob teste é a VALIDAÇÃO, não a resolução do escopo.
const VISIVEIS = ["A", "B"];

const BANCO: Record<string, AlvoDaFusao> = {
  a1: { id: "a1", nome: "Área Técnica", empresaId: "A" },
  a2: { id: "a2", nome: "Area Tecnica", empresaId: "A" },
  b1: { id: "b1", nome: "Área Técnica", empresaId: "B" },
  c1: { id: "c1", nome: "Área Técnica", empresaId: "C" },
};
const carregar = async (ids: string[]) => ids.map((i) => BANCO[i]).filter(Boolean);

async function main() {
  console.log("\nFusão dentro do mesmo CNPJ — o caso legítimo\n");
  {
    const r = await validarFusao(VISIVEIS, ["a2"], "a1", carregar, "setor");
    ok(r.ok, "dois setores do mesmo CNPJ podem ser unificados");
    if (r.ok) {
      ok(r.destino.id === "a1", "o destino volta identificado");
      ok(r.origens.length === 1 && r.origens[0].id === "a2", "a origem volta sem o destino junto");
    }
  }

  console.log("\nFusão ATRAVESSANDO CNPJ — o defeito de um clique\n");
  {
    // É o cenário real: "Área Técnica" existe em vários CNPJs e o painel
    // "Semelhantes" agrupa por nome, sem olhar empresa.
    const r = await validarFusao(VISIVEIS, ["b1"], "a1", carregar, "setor");
    ok(!r.ok, "setores de CNPJs diferentes NÃO podem ser unificados");
    if (!r.ok) ok(/MESMO CNPJ/.test(r.error), "o erro diz por que, e o que fazer");
  }
  {
    const r = await validarFusao(VISIVEIS, ["a2", "b1"], "a1", carregar, "setor");
    ok(!r.ok, "basta UM forasteiro no grupo para barrar a fusão inteira");
  }

  console.log("\nAlcance — POST à mão com id de CNPJ que a pessoa não enxerga\n");
  {
    const r = await validarFusao(VISIVEIS, ["c1"], "a1", carregar, "setor");
    ok(!r.ok, "alvo fora do acesso é recusado");
    if (!r.ok) ok(/acesso/.test(r.error), "o erro fala de acesso, não de CNPJ diferente");
  }
  {
    const r = await validarFusao(VISIVEIS, ["a2"], "c1", carregar, "setor");
    ok(!r.ok, "DESTINO fora do acesso também é recusado");
  }

  console.log("\nIds que não existem\n");
  {
    const r = await validarFusao(VISIVEIS, ["fantasma"], "a1", carregar, "setor");
    ok(!r.ok, "origem inexistente é recusada em vez de ser ignorada em silêncio");
  }
  {
    const r = await validarFusao(VISIVEIS, ["a2"], "fantasma", carregar, "setor");
    ok(!r.ok, "destino inexistente é recusado");
  }

  console.log("\nO rótulo entra na mensagem — setor e cargo usam a mesma regra\n");
  {
    const r = await validarFusao(VISIVEIS, ["b1"], "a1", carregar, "cargo");
    ok(!r.ok && /cargo/.test(r.error), "a mensagem fala de cargo quando é cargo");
  }

  console.log(`\n${falhas === 0 ? "✅ tudo certo" : `❌ ${falhas} falha(s)`}\n`);
  process.exit(falhas === 0 ? 0 : 1);
}

main();
