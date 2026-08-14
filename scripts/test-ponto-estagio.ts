// Teto de jornada do estagiário — 5h/dia e 30h/semana (política da empresa;
// a Lei 11.788/2008 art. 10 fixa 6h/30h para ensino superior e médio regular).
//
// DOIS DEFEITOS DA REGRA ANTIGA que estes testes fixam:
//
//   1. O cálculo era `agora - primeiraEntrada`, que conta o almoço como hora
//      trabalhada. Quem entrasse às 8h e saísse às 13h com uma hora de
//      intervalo aparecia com 5h em vez de 4h.
//   2. A semana era contada com fronteiras do processo, que na Vercel é UTC.
//
// E o desenho mudou: avisa, não bloqueia. Recusar a saída deixaria o
// estagiário sem registro da hora em que foi embora.

import {
  apurarLimiteEstagio,
  avisoDeLimiteEstagio,
  emHorasEMinutos,
  limitesDeEstagio,
  MINIMO_ESTAGIO_MIN_DIA,
  TETO_LEGAL_ESTAGIO_MIN_DIA,
  TETO_LEGAL_ESTAGIO_MIN_SEMANA,
  type BatidaPonto,
} from "../lib/ponto-regras";

// A política de 5h que a empresa usava antes de o limite virar configuração.
const CINCO_HORAS = { dia: 5 * 60, semana: 30 * 60 };

let falhas = 0;
function ok(condicao: boolean, descricao: string) {
  console.log(`${condicao ? "✅" : "❌"} ${descricao}`);
  if (!condicao) falhas++;
}

// Brasília é UTC-3: 08:00 BRT = 11:00 UTC.
const brt = (dia: string, hora: string): Date => new Date(`${dia}T${hora}:00Z`);
const b = (tipo: BatidaPonto["tipo"], dia: string, horaUtc: string): BatidaPonto => ({
  tipo,
  dataHora: brt(dia, horaUtc),
});

// Quarta-feira, 12/08/2026.
const QUA = "2026-08-12";

console.log("\nO almoço NÃO é hora trabalhada — o defeito da regra antiga\n");

// Entra 08:00, almoça 12:00–13:00, sai 13:00. Trabalhou 4h.
const comAlmoco: BatidaPonto[] = [
  b("ENTRADA_1", QUA, "11:00"), // 08:00 BRT
  b("SAIDA_1", QUA, "15:00"), // 12:00 BRT
  b("ENTRADA_2", QUA, "16:00"), // 13:00 BRT
];
const r1 = apurarLimiteEstagio(comAlmoco, brt(QUA, "17:00"), CINCO_HORAS); // 14:00 BRT, 1h depois da volta
ok(r1.minutosHoje === 300, `08:00–12:00 + 13:00–14:00 = 5h (deu ${emHorasEMinutos(r1.minutosHoje)})`);
ok(!r1.excedeuDia, "5h cravados NÃO excedem o teto de 5h");

// A conta antiga: agora(14:00) - primeiraEntrada(08:00) = 6h. Barraria aqui.
const contaAntiga = (brt(QUA, "17:00").getTime() - comAlmoco[0].dataHora.getTime()) / 60000;
ok(contaAntiga === 360, "a conta antiga daria 6h no mesmo caso — 1h a mais, só de almoço");

console.log("\nPeríodo aberto conta até agora — mas só hoje\n");

const soEntrou = [b("ENTRADA_1", QUA, "11:00")];
ok(
  apurarLimiteEstagio(soEntrou, brt(QUA, "14:00"), CINCO_HORAS).minutosHoje === 180,
  "entrou às 08:00 e são 11:00 → 3h, mesmo sem ter batido a saída",
);
ok(
  apurarLimiteEstagio(soEntrou, brt("2026-08-13", "14:00"), CINCO_HORAS).minutosHoje === 0,
  "entrada de ONTEM sem saída vale zero — senão daria centenas de horas",
);

console.log("\nO teto diário\n");

const seisHoras = [b("ENTRADA_1", QUA, "11:00"), b("SAIDA_1", QUA, "17:00")]; // 08:00–14:00
const r2 = apurarLimiteEstagio(seisHoras, brt(QUA, "17:05"), CINCO_HORAS);
ok(r2.minutosHoje === 360 && r2.excedeuDia, "6h corridos excedem o teto diário");
ok(
  (avisoDeLimiteEstagio(r2, CINCO_HORAS) ?? "").includes("6h"),
  "o aviso diz quantas horas a pessoa tem, não um código",
);
ok(
  (avisoDeLimiteEstagio(r2, CINCO_HORAS) ?? "").includes("registrada"),
  "e diz que a marcação FOI registrada — avisa, não bloqueia",
);
ok(avisoDeLimiteEstagio(apurarLimiteEstagio(comAlmoco, brt(QUA, "17:00"), CINCO_HORAS), CINCO_HORAS) === null, "dentro do teto, nenhum aviso");

console.log("\nA semana começa na segunda, em Brasília\n");

// Semana de 10/08 (seg) a 16/08 (dom). 5h em cada um de seis dias = 30h.
const seisDias: BatidaPonto[] = [];
for (const dia of ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14", "2026-08-15"]) {
  seisDias.push(b("ENTRADA_1", dia, "11:00"), b("SAIDA_1", dia, "16:00")); // 5h
}
const noSabado = apurarLimiteEstagio(seisDias, brt("2026-08-15", "16:05"), CINCO_HORAS);
ok(noSabado.minutosSemana === 1800, `seis dias de 5h = 30h na semana (deu ${emHorasEMinutos(noSabado.minutosSemana)})`);
ok(!noSabado.excedeuSemana, "30h cravadas não excedem o teto de 30h");

// Mais meia hora no sábado estoura.
const comMeiaHoraAMais = [...seisDias, b("ENTRADA_2", "2026-08-15", "17:00")];
const estourou = apurarLimiteEstagio(comMeiaHoraAMais, brt("2026-08-15", "17:30"), CINCO_HORAS);
ok(estourou.excedeuSemana, "30h30 excede o teto semanal");
ok((avisoDeLimiteEstagio(estourou, CINCO_HORAS) ?? "").includes("semana"), "e o aviso fala da semana");

// Domingo fecha a semana da segunda anterior; a segunda seguinte zera.
const domingo = apurarLimiteEstagio(seisDias, brt("2026-08-16", "14:00"), CINCO_HORAS);
ok(domingo.minutosSemana === 1800, "domingo 16/08 ainda soma a semana que começou em 10/08");
const segundaSeguinte = apurarLimiteEstagio(seisDias, brt("2026-08-17", "14:00"), CINCO_HORAS);
ok(segundaSeguinte.minutosSemana === 0, "segunda 17/08 começa semana nova, do zero");

console.log("\nA virada do dia em Brasília\n");

// 21:30 BRT do dia 12 = 00:30 UTC do dia 13. Tem que contar no dia 12.
const noturno = [b("ENTRADA_1", QUA, "23:00")]; // 20:00 BRT do dia 12
const r3 = apurarLimiteEstagio(noturno, brt("2026-08-13", "00:30"), CINCO_HORAS); // 21:30 BRT, ainda dia 12
ok(r3.minutosHoje === 90, "20:00 → 21:30 de Brasília são 1h30 no MESMO dia, apesar de dias UTC diferentes");

console.log("\nFormatação para gente\n");
ok(emHorasEMinutos(300) === "5h", "300 min → 5h");
ok(emHorasEMinutos(270) === "4h30", "270 min → 4h30");
ok(emHorasEMinutos(TETO_LEGAL_ESTAGIO_MIN_DIA) === "6h", "o teto legal se apresenta como 6h");

console.log("\nO teto legal não pode ser afrouxado por configuração\n");

ok(
  limitesDeEstagio(null).dia === TETO_LEGAL_ESTAGIO_MIN_DIA,
  "empresa sem configuração usa o teto legal (6h), não uma política inventada",
);
ok(
  limitesDeEstagio({ estagioMinDia: 300, estagioMinSemana: 1500 }).dia === 300,
  "o RH pode APERTAR: 5h configurados valem 5h",
);
// O caso que importa: linha adulterada por fora da tela não afrouxa a regra.
ok(
  limitesDeEstagio({ estagioMinDia: 480, estagioMinSemana: 2400 }).dia === TETO_LEGAL_ESTAGIO_MIN_DIA,
  "8h gravados direto no banco são truncados para o teto legal de 6h",
);
ok(
  limitesDeEstagio({ estagioMinDia: 480, estagioMinSemana: 2400 }).semana === TETO_LEGAL_ESTAGIO_MIN_SEMANA,
  "40h semanais gravadas direto no banco são truncadas para 30h",
);
ok(
  limitesDeEstagio({ estagioMinDia: 0, estagioMinSemana: 0 }).dia === MINIMO_ESTAGIO_MIN_DIA,
  "zero vira o mínimo de 1h — limite zerado alertaria em toda marcação",
);

// Com o teto legal valendo, a jornada de 6h deixa de ser excesso.
const seisComTetoLegal = apurarLimiteEstagio(seisHoras, brt(QUA, "17:05"), limitesDeEstagio(null));
ok(!seisComTetoLegal.excedeuDia, "6h não excedem quando a régua é o teto legal de 6h");
ok(
  avisoDeLimiteEstagio(seisComTetoLegal, limitesDeEstagio(null)) === null,
  "e nesse caso não sai aviso nenhum",
);

console.log(falhas === 0 ? "\n✅ Estágio: tudo certo\n" : `\n❌ ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
