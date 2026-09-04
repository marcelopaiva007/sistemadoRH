// Marcação incluída por tratamento de ponto (rh.MarcacaoTratada): a receita de
// data/hora, o hash próprio e o lugar dela nos arquivos fiscais.
//
// POR QUE EXISTE. Até a 1.165.0 aprovar um pedido de INCLUSAO_MANUAL só mudava
// o status do TratamentoPonto: nada virava marcação, e 28 aprovações em
// produção não existiam para o Monitor de Presença nem para o AEJ. A partir da
// 1.166.0 a aprovação grava uma linha em rh.MarcacaoTratada — nunca em
// RegistroPonto, que é o que o REP-P coletou e a única fonte do AFD (Portaria
// MTP 671/2021).
//
// Três coisas que quebram em silêncio e este arquivo prega:
// 1. O DIA. TratamentoPonto.dataFato é data de calendário gravada como
//    meia-noite UTC. diaBrasilia() dessa meia-noite devolve o dia ANTERIOR
//    (00:00Z é 21:00 de Brasília da véspera). O dia tem de vir de
//    paraInputDate (lê em UTC) e a juntura com a hora pedida é
//    dataHoraDoFormularioBrasilia, que fixa o -03:00.
// 2. O HASH. Marcação tratada não tem NSR nem IP; a cadeia é outra
//    ("TRATADA|...") e não pode colidir com a de batida.
// 3. OS ARQUIVOS. O AFD ignora tratadas; o AEJ inclui, e distinguível
//    (NSR vazio, origem e justificativa no fim da linha).
//
// Roda sem banco — regra pura — no job `verificar` do CI.

import { paraInputDate, dataHoraDoFormularioBrasilia, diaBrasilia } from "../lib/datas";
import { gerarHashMarcacaoTratadaSHA256, gerarHashPontoSHA256 } from "../lib/ponto-seguranca";
import { gerarConteudoAFD, gerarConteudoAEJ } from "../lib/ponto-afdaej";
import type { RegistroPontoAFD } from "../lib/ponto-afdaej";

let falhas = 0;
function ok(condicao: boolean, descricao: string) {
  console.log(`${condicao ? "✅" : "❌"} ${descricao}`);
  if (!condicao) falhas++;
}

// A receita do contrato, tal como decidirTratamentoPonto e o backfill montam o
// instante: dia lido em UTC da data de calendário + "HH:mm" pedido, colados e
// interpretados em Brasília (-03:00).
function dataHoraDaMarcacaoTratada(dataFato: Date, horaSolicitada: string): Date | null {
  return dataHoraDoFormularioBrasilia(`${paraInputDate(dataFato)}T${horaSolicitada}`);
}

const iso = (d: Date | null) => (d ? d.toISOString() : "null");

console.log("\n1. A receita de data/hora — o dia vem de paraInputDate, nunca de diaBrasilia\n");

// dataFato como o banco grava: meia-noite UTC do dia de calendário.
const dataFato = new Date("2026-09-03T00:00:00Z");

ok(
  diaBrasilia(dataFato) === "2026-09-02",
  "diaBrasilia(dataFato) devolve o dia ANTERIOR (2026-09-02) — por isso não pode ser usado",
);
ok(paraInputDate(dataFato) === "2026-09-03", "paraInputDate(dataFato) devolve o dia certo (2026-09-03)");

const saida18h = dataHoraDaMarcacaoTratada(dataFato, "18:00");
ok(
  iso(saida18h) === "2026-09-03T21:00:00.000Z",
  `03/09 + "18:00" vira 2026-09-03T21:00:00Z (veio ${iso(saida18h)})`,
);

const saida2330 = dataHoraDaMarcacaoTratada(dataFato, "23:30");
ok(
  iso(saida2330) === "2026-09-04T02:30:00.000Z",
  `03/09 + "23:30" vira 2026-09-04T02:30:00Z — dia seguinte em UTC, mesmo dia em Brasília (veio ${iso(saida2330)})`,
);

const entrada0030 = dataHoraDaMarcacaoTratada(dataFato, "00:30");
ok(
  iso(entrada0030) === "2026-09-03T03:30:00.000Z",
  `03/09 + "00:30" vira 2026-09-03T03:30:00Z (veio ${iso(entrada0030)})`,
);

// O instante montado volta ao mesmo dia de Brasília do pedido — inclusive o das 23:30.
ok(saida18h !== null && diaBrasilia(saida18h) === "2026-09-03", "o instante das 18:00 cai no dia 03/09 em Brasília");
ok(saida2330 !== null && diaBrasilia(saida2330) === "2026-09-03", "o instante das 23:30 também cai no dia 03/09 em Brasília");

// Hora fora do formato "HH:mm" não vira instante (a validação da action usa a
// mesma regra; aqui só se garante que a juntura não inventa uma data).
ok(dataHoraDaMarcacaoTratada(dataFato, "18h00") === null, "hora fora de HH:mm não monta instante");
ok(dataHoraDaMarcacaoTratada(dataFato, "") === null, "hora vazia não monta instante");

console.log("\n2. O hash da marcação tratada é próprio\n");

const base = {
  tratamentoId: "trat_abc123",
  colaboradorId: "colab_1",
  empresaId: "emp_1",
  dataHoraISO: "2026-09-03T21:00:00.000Z",
  tipo: "SAIDA_2",
  aprovadoPorId: "usr_rh",
};

const hashTratada = gerarHashMarcacaoTratadaSHA256(base);
ok(/^[0-9a-f]{64}$/.test(hashTratada), "é um SHA-256 em hexadecimal (64 caracteres)");
ok(gerarHashMarcacaoTratadaSHA256({ ...base }) === hashTratada, "é determinístico: a mesma entrada dá o mesmo hash");
ok(
  gerarHashMarcacaoTratadaSHA256({ ...base, tratamentoId: "trat_outro" }) !== hashTratada,
  "muda com o tratamentoId",
);
ok(gerarHashMarcacaoTratadaSHA256({ ...base, tipo: "ENTRADA_1" }) !== hashTratada, "muda com o tipo da marcação");
ok(
  gerarHashMarcacaoTratadaSHA256({ ...base, dataHoraISO: "2026-09-03T21:01:00.000Z" }) !== hashTratada,
  "muda com o instante",
);
ok(
  gerarHashMarcacaoTratadaSHA256({ ...base, aprovadoPorId: null }) !== hashTratada,
  "muda quando não há aprovador identificado (SEM_APROVADOR)",
);

// A batida equivalente (mesma pessoa, empresa, instante e tipo) tem outra
// cadeia — NSR/IP/GPS em vez de tratamentoId/aprovador — e não pode colidir.
const hashBatidaEquivalente = gerarHashPontoSHA256({
  nsr: 0,
  colaboradorId: base.colaboradorId,
  empresaId: base.empresaId,
  dataHoraISO: base.dataHoraISO,
  tipo: base.tipo,
});
ok(hashBatidaEquivalente !== hashTratada, "é diferente do hash de batida com os mesmos campos");

console.log("\n3. Arquivos fiscais: AFD ignora a tratada, AEJ inclui distinguível\n");

const empresa = { razaoSocial: "L&M TELECOM LTDA", cnpj: "12.345.678/0001-90" };
const cpf = "12345678901";

const batida: RegistroPontoAFD = {
  nsr: 17,
  tipo: "ENTRADA_1",
  dataHora: new Date("2026-09-03T11:00:00Z"), // 08:00 em Brasília
  cpfColaborador: cpf,
  hashSHA256: gerarHashPontoSHA256({
    nsr: 17,
    colaboradorId: base.colaboradorId,
    empresaId: base.empresaId,
    dataHoraISO: "2026-09-03T11:00:00.000Z",
    tipo: "ENTRADA_1",
  }),
  origem: "BATIDA",
  justificativa: null,
};

const tratada: RegistroPontoAFD = {
  nsr: null,
  tipo: "SAIDA_2",
  dataHora: saida18h ?? new Date("2026-09-03T21:00:00Z"), // 18:00 em Brasília
  cpfColaborador: cpf,
  hashSHA256: hashTratada,
  origem: "TRATAMENTO",
  justificativa: "Esqueci de registrar a saída",
};

// --- AFD ---
const afd = gerarConteudoAFD(empresa, [batida, tratada]).split("\r\n");
const linhasTipo3 = afd.filter((l) => l.charAt(9) === "3");

ok(linhasTipo3.length === 1, `o AFD tem UMA linha de marcação (tipo 3), só a batida (veio ${linhasTipo3.length})`);
ok(linhasTipo3[0]?.includes("030920260800"), "a linha do AFD é a batida das 08:00 de 03/09");
ok(!afd.some((l) => l.includes("030920261800")), "não existe linha das 18:00 no AFD — a tratada não entra");
ok(afd[afd.length - 1] === "0000000039", `o trailer do AFD conta cabeçalho + 1 marcação + trailer = 3 (veio ${afd[afd.length - 1]})`);

// --- AEJ ---
const aej = gerarConteudoAEJ(empresa, [batida, tratada]).split("\r\n");
const linhasJornada = aej.filter((l) => l.startsWith("2|"));

ok(linhasJornada.length === 2, `o AEJ tem DUAS linhas de jornada — batida e tratada (veio ${linhasJornada.length})`);

const linhaBatida = linhasJornada.find((l) => l.includes("|ENTRADA_1|")) ?? "";
const linhaTratada = linhasJornada.find((l) => l.includes("|SAIDA_2|")) ?? "";

ok(linhaBatida.startsWith("2|17|"), "a batida sai com o NSR dela");
ok(linhaBatida.endsWith("|BATIDA|"), "a batida termina com |BATIDA| e justificativa vazia");

ok(linhaTratada.startsWith("2||"), "a tratada sai com NSR VAZIO — não consumiu NSR");
ok(linhaTratada.includes(`|${cpf}|2026-09-03|18:00|SAIDA_2|${hashTratada}|`), "a tratada sai no dia e hora de Brasília do pedido, com o hash próprio");
ok(
  linhaTratada.endsWith("|TRATAMENTO|Esqueci de registrar a saída"),
  "a tratada termina com |TRATAMENTO|justificativa — distinguível de qualquer batida",
);
ok(aej[aej.length - 1] === "9|4", `o trailer do AEJ conta cabeçalho + 2 linhas + trailer = 4 (veio ${aej[aej.length - 1]})`);

if (falhas > 0) {
  console.error(`\n${falhas} caso(s) falharam.`);
  process.exit(1);
}
console.log("\nTodos os testes passaram.");
