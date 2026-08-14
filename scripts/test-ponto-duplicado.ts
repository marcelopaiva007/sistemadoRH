// Trava de marcação repetida no MESMO dia — e o fuso, que é onde ela quebra.
//
// Cada uma das quatro marcações do dia (entrada, saída para o intervalo, volta
// e saída) acontece uma vez só. Repetir não é jornada possível: é toque duplo,
// rede lenta reenviando, ou chamada direta à action — que é endpoint público.
//
// O caso que dá nome a este arquivo é o das 21h. Na Vercel o processo roda em
// UTC, e 21h de Brasília já é o dia seguinte lá. Uma trava que comparasse o dia
// do processo deixaria passar a segunda batida de quem marca à noite —
// justamente o segundo turno.

import { jaBateuHoje } from "../lib/ponto-regras";
import { diaBrasilia } from "../lib/datas";
import type { BatidaPonto } from "../lib/ponto-regras";

let falhas = 0;
function ok(condicao: boolean, descricao: string) {
  console.log(`${condicao ? "✅" : "❌"} ${descricao}`);
  if (!condicao) falhas++;
}

const batida = (tipo: BatidaPonto["tipo"], iso: string): BatidaPonto => ({
  tipo,
  dataHora: new Date(iso),
});

console.log("\nO dia é o de Brasília, não o do processo\n");

// 14/08 às 00:30 UTC é 13/08 às 21:30 em Brasília.
ok(diaBrasilia(new Date("2026-08-14T00:30:00Z")) === "2026-08-13", "00:30 UTC ainda é dia 13 em Brasília");
ok(diaBrasilia(new Date("2026-08-13T11:00:00Z")) === "2026-08-13", "11:00 UTC é dia 13 (meio do expediente)");
ok(diaBrasilia(new Date("2026-08-13T02:59:00Z")) === "2026-08-12", "02:59 UTC ainda é o dia anterior");
ok(diaBrasilia(new Date("2026-08-13T03:00:00Z")) === "2026-08-13", "03:00 UTC vira o dia novo em Brasília");

console.log("\nA trava\n");

const agoraManha = new Date("2026-08-13T11:00:00Z"); // 08:00 BRT
const entradaDeHoje = [batida("ENTRADA_1", "2026-08-13T10:58:00Z")];

ok(jaBateuHoje(entradaDeHoje, "ENTRADA_1", agoraManha), "a mesma marcação no mesmo dia é recusada");
ok(!jaBateuHoje(entradaDeHoje, "SAIDA_1", agoraManha), "marcação DIFERENTE no mesmo dia passa");
ok(!jaBateuHoje([], "ENTRADA_1", agoraManha), "sem histórico, passa");

// Ontem não conta: a jornada de hoje começa do zero.
ok(
  !jaBateuHoje([batida("ENTRADA_1", "2026-08-12T11:00:00Z")], "ENTRADA_1", agoraManha),
  "a mesma marcação ONTEM não bloqueia hoje",
);

console.log("\nA virada das 21h — o caso que motivou o teste\n");

// Segundo turno: bate a entrada às 21h30 de Brasília (00:30 UTC do dia
// seguinte) e tenta bater de novo dez minutos depois.
const entradaDaNoite = [batida("ENTRADA_1", "2026-08-14T00:30:00Z")];
const dezMinutosDepois = new Date("2026-08-14T00:40:00Z");

ok(
  jaBateuHoje(entradaDaNoite, "ENTRADA_1", dezMinutosDepois),
  "quem bateu às 21h30 não bate de novo às 21h40",
);

// A prova de que a comparação por UTC não serviria: as duas datas acima estão
// no MESMO dia UTC (14/08) e no mesmo dia de Brasília (13/08) — este caso
// passaria dos dois jeitos. O que separa os dois critérios é o par abaixo.
const antesDaMeiaNoiteUtc = batida("ENTRADA_1", "2026-08-13T23:00:00Z"); // 20:00 BRT dia 13
const depoisDaMeiaNoiteUtc = new Date("2026-08-14T00:30:00Z"); // 21:30 BRT do MESMO dia 13
ok(
  diaBrasilia(antesDaMeiaNoiteUtc.dataHora) === diaBrasilia(depoisDaMeiaNoiteUtc),
  "20:00 e 21:30 de Brasília são o mesmo dia, embora caiam em dias UTC diferentes",
);
ok(
  jaBateuHoje([antesDaMeiaNoiteUtc], "ENTRADA_1", depoisDaMeiaNoiteUtc),
  "e por isso a segunda tentativa é recusada — comparar por UTC deixaria passar",
);

// O espelho: madrugada de Brasília é dia novo, e a jornada recomeça.
ok(
  !jaBateuHoje([batida("SAIDA_2", "2026-08-13T23:00:00Z")], "SAIDA_2", new Date("2026-08-14T04:00:00Z")),
  "01:00 de Brasília é dia novo — a marcação de ontem à noite não bloqueia",
);

console.log("\nAs quatro marcações são independentes\n");
const diaCheio: BatidaPonto[] = [
  batida("ENTRADA_1", "2026-08-13T11:00:00Z"),
  batida("SAIDA_1", "2026-08-13T15:00:00Z"),
  batida("ENTRADA_2", "2026-08-13T16:00:00Z"),
];
ok(!jaBateuHoje(diaCheio, "SAIDA_2", agoraManha), "com três marcações feitas, a quarta ainda passa");
ok(jaBateuHoje(diaCheio, "ENTRADA_2", agoraManha), "e nenhuma das três repete");

console.log(falhas === 0 ? "\n✅ Ponto duplicado: tudo certo\n" : `\n❌ ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
