// A guarda das fusões de setor/cargo — a regra que impede um clique de migrar
// colaboradores entre CNPJs.
//
//   npx tsx scripts/test-guarda-unificacao.ts

import { validarFusao, type AlvoDaFusao } from "../lib/actions/guarda-unificacao";
import { agruparSetoresSemelhantes } from "../lib/setores-semelhantes";

let falhas = 0;
function ok(condicao: boolean, descricao: string) {
  console.log(`${condicao ? "✅" : "❌"} ${descricao}`);
  if (!condicao) falhas++;
}

// Os CNPJs que a pessoa alcança — na action isto vem de `empresasVisiveis`.
// Aqui entra direto: a regra sob teste é a VALIDAÇÃO, não a resolução do escopo.
const VISIVEIS = ["A", "B", "D"];

// A e B são CNPJs da MESMA marca (M1) — o caso real: "Marketing" existe nos 5
// CNPJs da LM Telecom. D é de outra marca (M2). C está fora do acesso.
const BANCO: Record<string, AlvoDaFusao> = {
  a1: { id: "a1", nome: "Área Técnica", empresaId: "A", marcaId: "M1" },
  a2: { id: "a2", nome: "Area Tecnica", empresaId: "A", marcaId: "M1" },
  b1: { id: "b1", nome: "Área Técnica", empresaId: "B", marcaId: "M1" },
  d1: { id: "d1", nome: "Área Técnica", empresaId: "D", marcaId: "M2" },
  c1: { id: "c1", nome: "Área Técnica", empresaId: "C", marcaId: "M9" },
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

  console.log("\nCNPJs IRMÃOS da mesma marca — legítimo, e o caso mais comum\n");
  {
    // O resto do sistema já trata setor/cargo por MARCA
    // (`validarSetorEPosicaoDaMarca` aceita setor de CNPJ irmão). Travar no
    // CNPJ transformaria o painel "Semelhantes" em botão morto.
    const r = await validarFusao(VISIVEIS, ["b1"], "a1", carregar, "setor");
    ok(r.ok, "unificar entre CNPJs da MESMA marca é permitido");
  }
  {
    const r = await validarFusao(VISIVEIS, ["a2", "b1"], "a1", carregar, "setor");
    ok(r.ok, "grupo inteiro dentro da mesma marca passa");
  }

  console.log("\nFusão ATRAVESSANDO MARCA — o defeito de um clique\n");
  {
    const r = await validarFusao(VISIVEIS, ["d1"], "a1", carregar, "setor");
    ok(!r.ok, "setores de MARCAS diferentes NÃO podem ser unificados");
    if (!r.ok) ok(/MESMA marca/.test(r.error), "o erro diz por que, e o que fazer");
  }
  {
    const r = await validarFusao(VISIVEIS, ["a2", "b1", "d1"], "a1", carregar, "setor");
    ok(!r.ok, "basta UM de outra marca para barrar a fusão inteira");
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
    const r = await validarFusao(VISIVEIS, ["d1"], "a1", carregar, "cargo");
    ok(!r.ok && /cargo/.test(r.error), "a mensagem fala de cargo quando é cargo");
  }

  console.log("\nO agrupador nasce POR MARCA — senão o botão Unificar só dá erro\n");
  {
    // O painel "Semelhantes" agrupava só por nome, numa tela consolidada:
    // "Recursos Humanos" de duas MARCAS caía no mesmo grupo, e unificar esse
    // grupo é justamente o que a guarda recusa — botão morto para sempre.
    const base = { colaboradoresCount: 1, vagasCount: 0, metasCount: 0, ativo: true };
    const grupos = agruparSetoresSemelhantes([
      { id: "s1", nome: "Recursos Humanos", marcaId: "M1", ...base },
      { id: "s2", nome: "RH", marcaId: "M1", ...base },
      { id: "s3", nome: "Recursos Humanos", marcaId: "M2", ...base },
      { id: "s4", nome: "RH", marcaId: "M2", ...base },
    ]);
    ok(grupos.length === 2, `mesmo nome em 2 marcas vira 2 grupos, não 1 (veio ${grupos.length})`);
    ok(
      grupos.every((g) => new Set(g.setores.map((x) => (x as { marcaId: string }).marcaId)).size === 1),
      "nenhum grupo mistura marcas",
    );
    // E cada grupo, levado à guarda, PASSA — que é o ponto.
    for (const g of grupos) {
      const ids = g.setores.map((x) => x.id);
      const alvos: Record<string, AlvoDaFusao> = Object.fromEntries(
        g.setores.map((x) => {
          const m = (x as { marcaId: string }).marcaId;
          return [x.id, { id: x.id, nome: x.nome, empresaId: m === "M1" ? "A" : "D", marcaId: m }];
        }),
      );
      const r = await validarFusao(VISIVEIS, ids.slice(1), ids[0], async (q) => q.map((i) => alvos[i]), "setor");
      ok(r.ok, `o grupo "${g.sugestaoNome}" é unificável de verdade`);
    }
  }

  console.log(`\n${falhas === 0 ? "✅ tudo certo" : `❌ ${falhas} falha(s)`}\n`);
  process.exit(falhas === 0 ? 0 : 1);
}

main();
