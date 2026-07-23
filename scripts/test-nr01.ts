// Testes do motor de cálculo NR-01 (lib/nr01.ts) + fumaça do gerador de PDF.
// Uso: npx tsx scripts/test-nr01.ts
import * as fs from "fs";
import {
  calcularNR01,
  classificarNR,
  riscoDoItem,
  probabilidadePorExposicao,
  severidadePorIntensidade,
  piorNivel,
  type PerguntaCalc,
  type RespostaCalc,
} from "@/lib/nr01";
import { PERGUNTAS_NR01 } from "@/lib/nr01-modelo";
import { gerarHtmlRelatorioNR01 } from "@/lib/nr01-relatorio";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

console.log("1. Modelo de perguntas");
ok(PERGUNTAS_NR01.length === 35, "35 perguntas");
ok(new Set(PERGUNTAS_NR01.map((p) => p.codigo)).size === 35, "códigos 01-35 únicos");
const porDim = new Map<string, number>();
PERGUNTAS_NR01.forEach((p) => porDim.set(p.dimensao, (porDim.get(p.dimensao) ?? 0) + 1));
ok(porDim.get("DEMANDA") === 8, "8 itens de Demanda");
ok(porDim.get("AUTONOMIA") === 6, "6 itens de Autonomia");
ok(porDim.get("SUPORTE_GESTOR") === 5, "5 itens de Suporte Gestor");
ok(porDim.get("SUPORTE_COLEGAS") === 4, "4 itens de Suporte Colegas");
ok(porDim.get("CLIMA_CONFLITOS") === 4, "4 itens de Clima/Conflitos");
ok(porDim.get("CLAREZA_MUDANCAS") === 8, "8 itens de Clareza/Mudanças");
ok(PERGUNTAS_NR01.find((p) => p.codigo === "33")!.invertida === false, "Q33 (emocionalmente exigente) é fator de risco direto");
ok(PERGUNTAS_NR01.find((p) => p.codigo === "23")!.invertida === true, "Q23 (confiar no chefe) é fator de proteção invertido");

console.log("2. Pontuação e classificação");
ok(riscoDoItem(4, false) === 4 && riscoDoItem(0, false) === 0, "fator de risco: risco = resposta");
ok(riscoDoItem(4, true) === 0 && riscoDoItem(0, true) === 4, "fator de proteção: risco = 4 - resposta");
ok(classificarNR(1) === "BAIXO" && classificarNR(4) === "BAIXO", "NR 1-4 = Baixo");
ok(classificarNR(5) === "MEDIO" && classificarNR(9) === "MEDIO", "NR 5-9 = Médio");
ok(classificarNR(10) === "ALTO" && classificarNR(16) === "ALTO", "NR 10-16 = Alto");
ok(classificarNR(17) === "CRITICO" && classificarNR(25) === "CRITICO", "NR 17-25 = Crítico");
ok(probabilidadePorExposicao(0) === 1 && probabilidadePorExposicao(30) === 3 && probabilidadePorExposicao(80) === 5, "mapa de probabilidade");
ok(severidadePorIntensidade(null) === 1 && severidadePorIntensidade(2.7) === 3 && severidadePorIntensidade(3.9) === 5, "mapa de severidade");
ok(piorNivel(["BAIXO", "ALTO", "MEDIO"]) === "ALTO", "pior nível");

console.log("3. Cálculo integrado");
const perguntas: PerguntaCalc[] = PERGUNTAS_NR01.map((p, i) => ({
  id: `q${i}`,
  codigo: p.codigo,
  enunciado: p.enunciado,
  dimensao: p.dimensao,
  invertida: p.invertida,
}));

// Cenário: setor "Campo" com 4 respondentes sempre no pior valor possível
// (risco máximo), setor "Escritório" com 4 sempre no melhor, e um setor
// pequeno "Mini" com 2 (amostra insuficiente).
const pior = (): RespostaCalc => ({
  setorNomeSnapshot: "Campo",
  posicaoNomeSnapshot: "Técnico",
  itens: perguntas.map((p) => ({ perguntaId: p.id, valorNumerico: p.invertida ? 0 : 4 })),
});
const melhor = (): RespostaCalc => ({
  setorNomeSnapshot: "Escritório",
  posicaoNomeSnapshot: "Analista",
  itens: perguntas.map((p) => ({ perguntaId: p.id, valorNumerico: p.invertida ? 4 : 0 })),
});
const mini = (): RespostaCalc => ({
  setorNomeSnapshot: "Mini",
  posicaoNomeSnapshot: "Aux",
  itens: perguntas.map((p) => ({ perguntaId: p.id, valorNumerico: 2 })),
});

const resultado = calcularNR01(perguntas, [
  pior(), pior(), pior(), pior(),
  melhor(), melhor(), melhor(), melhor(),
  mini(), mini(),
]);

ok(resultado.totalRespostas === 10, "10 respostas");
const campo = resultado.porSetor.find((s) => s.grupo === "Campo")!;
const escritorio = resultado.porSetor.find((s) => s.grupo === "Escritório")!;
const miniGrupo = resultado.porSetor.find((s) => s.grupo === "Mini")!;
ok(campo.dimensoes.every((d) => d.nr === 25 && d.nivel === "CRITICO"), "setor todo-pior: NR 25 Crítico em todas as dimensões");
ok(campo.indiceGeral100 === 100 && campo.nivelGeral === "CRITICO", "setor todo-pior: índice 100");
ok(escritorio.dimensoes.every((d) => d.nr === 1 && d.nivel === "BAIXO"), "setor todo-melhor: NR 1 Baixo em todas");
ok(escritorio.indiceGeral100 === 0, "setor todo-melhor: índice 0");
ok(miniGrupo.amostraInsuficiente === true, "setor com 2 respostas: amostra insuficiente");
ok(resultado.porSetor[0].grupo === "Campo", "ordenação: pior setor primeiro");
const geral = resultado.geral;
ok(Math.abs(geral.dimensoes[0].pctExpostos - 60) < 0.01, "geral: 60% expostos (4 pior + 2 mini de 10)");
ok(resultado.porCargo.some((c) => c.grupo === "Técnico"), "agregação por cargo presente");

console.log("4. Fumaça do relatório HTML/PDF");
const html = gerarHtmlRelatorioNR01({
  empresaNome: "Empresa Teste",
  pesquisaTitulo: "Avaliação NR-01 — teste",
  pesquisaStatus: "ACTIVE",
  iniciadaEm: new Date(),
  encerradaEm: null,
  convites: 12,
  resultado,
});
ok(html.includes("Resumo Executivo") && html.includes("Plano de Ação"), "seções obrigatórias presentes");
ok(html.includes("Campo") && html.includes("amostra insuficiente"), "setores e regra de amostra no HTML");
fs.mkdirSync("scripts/out", { recursive: true });
fs.writeFileSync("scripts/out/relatorio-teste.html", html);
console.log("  HTML salvo em scripts/out/relatorio-teste.html");

if (falhas > 0) {
  console.error(`\n${falhas} teste(s) falharam.`);
  process.exit(1);
}
console.log("\nTodos os testes passaram.");
