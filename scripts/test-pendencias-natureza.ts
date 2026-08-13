// Separação das pendências por natureza da ação + saudação da tela inicial.
// Regra pura, sem banco.
//
//   npx tsx scripts/test-pendencias-natureza.ts
import {
  PENDENCIAS_CADASTRO,
  PENDENCIAS_DECIDIR,
  PENDENCIAS_PRAZO,
  porNatureza,
  totalPendencias,
  zeradas,
  type Pendencias,
} from "../lib/pendencias";
import { primeiroNome, saudacao } from "../lib/saudacao";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

console.log("1. Cobertura dos grupos:");
{
  const chaves = Object.keys(zeradas()) as (keyof Pendencias)[];
  const agrupadas = [...PENDENCIAS_DECIDIR, ...PENDENCIAS_PRAZO, ...PENDENCIAS_CADASTRO];

  ok(
    agrupadas.length === chaves.length,
    `os grupos cobrem as ${chaves.length} pendências (têm ${agrupadas.length})`,
  );
  ok(new Set(agrupadas).size === agrupadas.length, "nenhuma pendência aparece em dois grupos");
  const faltando = chaves.filter((c) => !agrupadas.includes(c));
  ok(faltando.length === 0, `nenhuma pendência ficou de fora${faltando.length ? `: ${faltando.join(", ")}` : ""}`);
}

console.log("\n2. A soma dos três grupos é o total de sempre:");
{
  // Uma unidade em cada campo: se algum campo escapasse do agrupamento, a
  // soma dos grupos ficaria menor que o total e este teste pegaria.
  const uma = Object.fromEntries(
    Object.keys(zeradas()).map((c) => [c, 1]),
  ) as unknown as Pendencias;
  const n = porNatureza(uma);
  ok(
    n.decidir + n.prazo + n.cadastro === totalPendencias(uma),
    `${n.decidir} + ${n.prazo} + ${n.cadastro} = ${totalPendencias(uma)}`,
  );
}

console.log("\n3. O caso real de 12/08/2026 — o motivo desta separação:");
{
  // 163 cadastros incompletos afogavam 6 documentos a conferir num total de
  // 169. Separados, o que exige decisão hoje aparece sozinho.
  const p: Pendencias = { ...zeradas(), cadastrosIncompletos: 163, documentosAConferir: 6 };
  const n = porNatureza(p);
  ok(totalPendencias(p) === 169, "o total continua 169 (nada se perde)");
  ok(n.decidir === 6, "esperando decisão: 6 — o número que o RH resolve hoje");
  ok(n.cadastro === 163, "cadastro a completar: 163 — sem data fatal");
  ok(n.prazo === 0, "prazo correndo: 0");
}

console.log("\n4. CAT conta como decisão, não como acompanhamento:");
{
  // Prazo legal de 1 dia útil (Lei 8.213/91, art. 22): se caísse em "prazo
  // correndo", a emissão da CAT esperaria a fila errada.
  const n = porNatureza({ ...zeradas(), catPendente: 2 });
  ok(n.decidir === 2 && n.prazo === 0, "2 CAT pendentes entram em 'decidir'");
}

console.log("\n5. Saudação no horário de Brasília (e não no fuso do servidor):");
{
  // 11:00Z = 08:00 em Brasília. Sem fuso explícito, o servidor em UTC diria
  // "Bom dia" às 11h e "Boa tarde" às 8h da manhã de quem está aqui.
  ok(saudacao(new Date("2026-08-12T11:00:00Z")) === "Bom dia", "08:00 BRT → Bom dia");
  ok(saudacao(new Date("2026-08-12T18:00:00Z")) === "Boa tarde", "15:00 BRT → Boa tarde");
  ok(saudacao(new Date("2026-08-12T23:00:00Z")) === "Boa noite", "20:00 BRT → Boa noite");
  // 02:00Z do dia 13 = 23:00 do dia 12 em Brasília.
  ok(saudacao(new Date("2026-08-13T02:00:00Z")) === "Boa noite", "23:00 BRT → Boa noite");
}

console.log("\n6. Primeiro nome: cadastro em caixa alta não vira grito:");
{
  ok(primeiroNome("MARCELO PAIVA SANTOS") === "Marcelo", "MARCELO PAIVA SANTOS → Marcelo");
  ok(primeiroNome("luana gomes marinho") === "Luana", "luana gomes marinho → Luana");
  ok(primeiroNome("  Ana  Júlia  ") === "Ana", "espaços em volta não atrapalham");
  ok(primeiroNome("") === "" && primeiroNome(null) === "", "sem nome devolve vazio (não 'undefined')");
}

if (falhas > 0) {
  console.error(`\n${falhas} verificação(ões) falharam.`);
  process.exit(1);
}
console.log("\nTodos os testes passaram.");
