// Regras da CLT de férias (lib/ferias-clt.ts e o uso delas em lib/ferias.ts):
// art. 130, 133, 134 §1º e §3º, 135 e 145. Nada aqui toca o banco.
//   npx tsx scripts/test-ferias-clt.ts
//
// Criado em 26/11/2026, junto com as regras. Até então o motor assumia 30 dias
// cheios por período e não conferia o dia de início nem os prazos.
import {
  calcularFerias,
  emRiscoDeDobra,
  periodosEmRiscoDeDobra,
  validarSolicitacaoFerias,
  type SolicitacaoParaRiscoDobra,
} from "@/lib/ferias";
import {
  alertaDeAvisoPrevio,
  antecedenciaDaProgramacao,
  dataLimitePagamento,
  diasDeDireitoPorFaltas,
  erroDeFracionamento,
  erroDeInicioAntesDoDsr,
  faltasInjustificadasNoPeriodo,
  perdaPorAfastamento,
  type AusenciaParaFerias,
} from "@/lib/ferias-clt";
import { dataUTC, somarDiasUTC } from "@/lib/datas";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

const HOJE = dataUTC(2026, 11, 25); // quarta-feira

/** Ausência de `dias` corridos a partir de `inicio`. */
const ausencia = (
  tipo: string,
  inicio: Date,
  dias: number,
  extra: Partial<AusenciaParaFerias> = {},
): AusenciaParaFerias => ({
  tipo,
  dataInicio: inicio,
  dataFim: somarDiasUTC(inicio, dias - 1),
  dias,
  abonada: tipo !== "FALTA_INJUSTIFICADA" && tipo !== "SUSPENSAO" && tipo !== "OUTRO",
  status: "APROVADA",
  ...extra,
});

const ferias = (
  periodoAquisitivoInicio: Date,
  inicio: Date,
  dias: number,
  status = "APROVADA",
): SolicitacaoParaRiscoDobra => ({
  periodoAquisitivoInicio,
  dataInicio: inicio,
  dataFim: somarDiasUTC(inicio, dias - 1),
  dias,
  diasAbono: 0,
  status,
});

console.log("1. Art. 130 — tabela de dias por faltas injustificadas");
ok(diasDeDireitoPorFaltas(0) === 30, "0 faltas: 30 dias");
ok(diasDeDireitoPorFaltas(5) === 30, "5 faltas: 30 dias (borda)");
ok(diasDeDireitoPorFaltas(6) === 24, "6 faltas: 24 dias (borda)");
ok(diasDeDireitoPorFaltas(14) === 24, "14 faltas: 24 dias");
ok(diasDeDireitoPorFaltas(15) === 18, "15 faltas: 18 dias");
ok(diasDeDireitoPorFaltas(23) === 18, "23 faltas: 18 dias");
ok(diasDeDireitoPorFaltas(24) === 12, "24 faltas: 12 dias");
ok(diasDeDireitoPorFaltas(32) === 12, "32 faltas: 12 dias (borda)");
ok(diasDeDireitoPorFaltas(33) === 0, "33 faltas: perde o direito (borda)");

console.log("2. Art. 130 — quais ausências contam como falta injustificada");
const P_INI = dataUTC(2025, 1, 20);
const P_FIM = dataUTC(2026, 1, 19);
ok(
  faltasInjustificadasNoPeriodo([ausencia("FALTA_INJUSTIFICADA", dataUTC(2025, 3, 2), 6)], P_INI, P_FIM) === 6,
  "falta injustificada aprovada conta",
);
ok(
  faltasInjustificadasNoPeriodo([ausencia("ATESTADO", dataUTC(2025, 3, 2), 6)], P_INI, P_FIM) === 0,
  "atestado (abonado) não conta",
);
ok(
  faltasInjustificadasNoPeriodo(
    [ausencia("FALTA_INJUSTIFICADA", dataUTC(2025, 3, 2), 6, { abonada: true })],
    P_INI,
    P_FIM,
  ) === 0,
  "falta que o RH abonou não conta (mesmo critério da Folha)",
);
ok(
  faltasInjustificadasNoPeriodo(
    [ausencia("FALTA_INJUSTIFICADA", dataUTC(2025, 3, 2), 6, { status: "PENDENTE" })],
    P_INI,
    P_FIM,
  ) === 0,
  "falta pendente de aprovação não conta",
);
ok(
  faltasInjustificadasNoPeriodo(
    [ausencia("AFASTAMENTO_INSS", dataUTC(2025, 3, 2), 6, { abonada: false })],
    P_INI,
    P_FIM,
  ) === 0,
  "afastamento do INSS nunca é falta (art. 131), mesmo desmarcado como abonado",
);
ok(
  faltasInjustificadasNoPeriodo([ausencia("FALTA_INJUSTIFICADA", dataUTC(2026, 1, 17), 6)], P_INI, P_FIM) === 3,
  "falta que atravessa o fim do período conta só os dias de dentro (17 a 19/01)",
);

console.log("3. Art. 130 — saldo e validação usam o direito reduzido");
// Admissão 20/01/2025: P1 = 20/01/2025–19/01/2026, concessivo até 19/01/2027.
const ADM = dataUTC(2025, 1, 20);
const seisFaltas = [ausencia("FALTA_INJUSTIFICADA", dataUTC(2025, 3, 2), 6)];
const cincoFaltas = [ausencia("FALTA_INJUSTIFICADA", dataUTC(2025, 3, 2), 5)];
const trintaETresFaltas = [
  ausencia("FALTA_INJUSTIFICADA", dataUTC(2025, 3, 2), 20),
  ausencia("FALTA_INJUSTIFICADA", dataUTC(2025, 6, 2), 13),
];
const trintaEDuasFaltas = [
  ausencia("FALTA_INJUSTIFICADA", dataUTC(2025, 3, 2), 20),
  ausencia("FALTA_INJUSTIFICADA", dataUTC(2025, 6, 2), 12),
];

const r5 = calcularFerias(ADM, [], HOJE, cincoFaltas);
ok(r5.periodos[0].direito === 30 && r5.periodos[0].saldo === 30, "5 faltas: direito e saldo 30");
const r6 = calcularFerias(ADM, [], HOJE, seisFaltas);
ok(r6.periodos[0].direito === 24, "6 faltas: direito 24");
ok(r6.periodos[0].saldo === 24 && r6.saldoDisponivel === 24, "6 faltas: saldo disponível 24");
ok(r6.periodos[0].faltasInjustificadas === 6, "o período guarda quantas faltas pesaram");
const r32 = calcularFerias(ADM, [], HOJE, trintaEDuasFaltas);
ok(r32.periodos[0].direito === 12 && r32.periodos[0].perdaDireito === null, "32 faltas: direito 12");
const r33 = calcularFerias(ADM, [], HOJE, trintaETresFaltas);
ok(r33.periodos[0].direito === 0 && r33.periodos[0].perdaDireito === "FALTAS_ART_130", "33 faltas: perde (art. 130)");
ok(r33.periodos[0].saldo === 0 && r33.saldoDisponivel === 0, "33 faltas: nenhum saldo disponível");
ok(calcularFerias(ADM, [], HOJE).periodos[0].direito === 30, "sem ausências informadas: 30 cheio, como antes");

const SEGUNDA = dataUTC(2026, 12, 7);
const pedido24 = validarSolicitacaoFerias({
  resumo: r6,
  periodoAquisitivoInicio: ADM,
  dataInicio: SEGUNDA,
  dataFim: somarDiasUTC(SEGUNDA, 23),
  diasAbono: 0,
  fracoesExistentes: [],
});
ok(pedido24.ok, "6 faltas: 24 dias de uma vez passam");
const pedido30 = validarSolicitacaoFerias({
  resumo: r6,
  periodoAquisitivoInicio: ADM,
  dataInicio: SEGUNDA,
  dataFim: somarDiasUTC(SEGUNDA, 29),
  diasAbono: 0,
  fracoesExistentes: [],
});
ok(!pedido30.ok && pedido30.error.includes("art. 130"), "6 faltas: 30 dias são recusados citando o art. 130");
const semDireito = validarSolicitacaoFerias({
  resumo: r33,
  periodoAquisitivoInicio: ADM,
  dataInicio: SEGUNDA,
  dataFim: somarDiasUTC(SEGUNDA, 9),
  diasAbono: 0,
  fracoesExistentes: [],
});
ok(!semDireito.ok && semDireito.error.includes("Sem direito"), "33 faltas: qualquer pedido é bloqueado como sem direito");

console.log("4. Art. 133 — afastamento do INSS por mais de 6 meses, descontínuos");
// Admissão 10/01/2022: P1 = 10/01/2022–09/01/2023.
const ADM133 = dataUTC(2022, 1, 10);
const afast100 = ausencia("AFASTAMENTO_INSS", dataUTC(2022, 3, 1), 100); // 01/03 a 08/06
const afast81 = ausencia("ACIDENTE_TRABALHO", dataUTC(2022, 9, 1), 81); // 01/09 a 20/11
const afast80 = ausencia("ACIDENTE_TRABALHO", dataUTC(2022, 9, 1), 80); // 01/09 a 19/11
const perda = perdaPorAfastamento([afast100, afast81], ADM133, dataUTC(2023, 1, 9));
ok(perda !== null && perda.diasAfastado === 181, "100 + 81 dias descontínuos (181) perdem o direito");
ok(
  perda !== null && perda.retorno.getTime() === dataUTC(2022, 11, 21).getTime(),
  "o novo período começa na volta ao trabalho (21/11/2022)",
);
ok(perdaPorAfastamento([afast100, afast80], ADM133, dataUTC(2023, 1, 9)) === null, "100 + 80 = 180 dias: ainda não perde");
ok(
  perdaPorAfastamento([afast100, { ...afast81, status: "PENDENTE" }], ADM133, dataUTC(2023, 1, 9)) === null,
  "afastamento pendente não conta",
);

const r133 = calcularFerias(ADM133, [], HOJE, [afast100, afast81]);
const [p1, p2, p3] = r133.periodos;
ok(p1.direito === 0 && p1.perdaDireito === "AFASTAMENTO_ART_133", "período perdido: direito 0 (art. 133)");
ok(p1.fim.getTime() === dataUTC(2022, 11, 20).getTime(), "o período perdido termina na véspera da volta (20/11/2022)");
ok(p2.inicio.getTime() === dataUTC(2022, 11, 21).getTime(), "o período seguinte começa em 21/11/2022");
ok(p2.fim.getTime() === dataUTC(2023, 11, 20).getTime() && p2.direito === 30, "e fecha 12 meses depois, com 30 dias");
ok(p3.inicio.getTime() === dataUTC(2023, 11, 21).getTime(), "os seguintes seguem o novo aniversário (21/11)");
ok(p1.faltasInjustificadas === 0, "afastamento não vira falta do art. 130");
const r180 = calcularFerias(ADM133, [], HOJE, [afast100, afast80]);
ok(
  r180.periodos[0].direito === 30 && r180.periodos[1].inicio.getTime() === dataUTC(2023, 1, 10).getTime(),
  "com 180 dias o período fica com 30 e o aniversário não muda",
);
const pedido133 = validarSolicitacaoFerias({
  resumo: r133,
  periodoAquisitivoInicio: ADM133,
  dataInicio: SEGUNDA,
  dataFim: somarDiasUTC(SEGUNDA, 9),
  diasAbono: 0,
  fracoesExistentes: [],
});
ok(!pedido133.ok && pedido133.error.includes("art. 133"), "pedido no período perdido é bloqueado citando o art. 133");

console.log("5. Art. 134 §3º — início nos 2 dias antes do DSR (domingo)");
ok(erroDeInicioAntesDoDsr(dataUTC(2026, 11, 27)) !== null, "sexta-feira (27/11) gera aviso");
ok(erroDeInicioAntesDoDsr(dataUTC(2026, 11, 28)) !== null, "sábado (28/11) gera aviso");
ok(erroDeInicioAntesDoDsr(dataUTC(2026, 11, 26)) === null, "quinta-feira (26/11) pode");
ok(erroDeInicioAntesDoDsr(dataUTC(2026, 11, 30)) === null, "segunda-feira (30/11) pode");
const r30 = calcularFerias(ADM, [], HOJE);
const naSexta = validarSolicitacaoFerias({
  resumo: r30,
  periodoAquisitivoInicio: ADM,
  dataInicio: dataUTC(2026, 12, 4),
  dataFim: dataUTC(2027, 1, 2),
  diasAbono: 0,
  fracoesExistentes: [],
});
ok(naSexta.ok, "programação começando na sexta NÃO é bloqueada — só avisa (repouso de cada pessoa não está no cadastro)");
const retroativaNaSexta = validarSolicitacaoFerias({
  resumo: r30,
  periodoAquisitivoInicio: ADM,
  dataInicio: dataUTC(2026, 12, 4),
  dataFim: dataUTC(2027, 1, 2),
  diasAbono: 0,
  fracoesExistentes: [],
  retroativo: true,
});
ok(retroativaNaSexta.ok, "lançamento de férias JÁ gozadas não confere o dia de início");

console.log("6. Art. 134 §1º — fracionamento");
ok(erroDeFracionamento([14, 5, 5], 6) !== null, "14+5+5 com 6 dias sobrando: não cabe 4º período");
ok(erroDeFracionamento([14, 5, 5], 0) === null, "14+5+5 (plano completo de 24) é válido");
ok(erroDeFracionamento([13, 9, 8], 0) !== null, "13+9+8 é inválido (nenhum período de 14)");
ok(erroDeFracionamento([20, 5, 5], 0) === null, "20+5+5 é válido");
ok(erroDeFracionamento([14, 4, 12], 0) !== null, "fração de 4 dias é inválida");
ok(erroDeFracionamento([10, 10, 5, 5], 0) !== null, "4 períodos é inválido");
ok(erroDeFracionamento([30], 0) === null, "30 de uma vez é válido");
ok(erroDeFracionamento([4], 26) !== null, "4 dias deixando 26 para depois: fração menor que 5");
ok(erroDeFracionamento([13], 17) === null, "13 agora, sobrando 17: ainda cabe um de 14");
ok(erroDeFracionamento([13, 9], 8) !== null, "13 + 9, sobrando 8: já não cabe um de 14 — recusado no 2º pedido");
ok(erroDeFracionamento([14, 14], 2) !== null, "sobra de 2 dias que não forma período");
ok(erroDeFracionamento([10], 20) === null, "10 agora, sobrando 20: ok");

// Pelo validador, com pedidos reais: 13 pendente e um novo de 9.
const PERIODO = ADM;
const com13 = calcularFerias(PERIODO, [ferias(PERIODO, dataUTC(2026, 2, 2), 13, "PENDENTE")], HOJE);
const novo9 = validarSolicitacaoFerias({
  resumo: com13,
  periodoAquisitivoInicio: PERIODO,
  dataInicio: SEGUNDA,
  dataFim: somarDiasUTC(SEGUNDA, 8),
  diasAbono: 0,
  fracoesExistentes: [{ dias: 13 }],
});
ok(!novo9.ok && novo9.error.includes("14"), "validador: 13 já marcado + 9 é recusado pedindo o período de 14");
const com14e5 = calcularFerias(
  PERIODO,
  [ferias(PERIODO, dataUTC(2026, 2, 2), 14), ferias(PERIODO, dataUTC(2026, 4, 6), 5)],
  HOJE,
);
const ultimo5 = validarSolicitacaoFerias({
  resumo: com14e5,
  periodoAquisitivoInicio: PERIODO,
  dataInicio: SEGUNDA,
  dataFim: somarDiasUTC(SEGUNDA, 10),
  diasAbono: 0,
  fracoesExistentes: [{ dias: 14 }, { dias: 5 }],
});
ok(ultimo5.ok, "validador: 14 + 5 + 11 (fecha os 30) é aceito");

console.log("7. Art. 135 — aviso com 30 dias (alerta, não bloqueio)");
ok(alertaDeAvisoPrevio(somarDiasUTC(HOJE, 29), HOJE) !== null, "começa em 29 dias: alerta");
ok(alertaDeAvisoPrevio(somarDiasUTC(HOJE, 30), HOJE) === null, "começa em 30 dias: sem alerta");
const em10dias = validarSolicitacaoFerias({
  resumo: r30,
  periodoAquisitivoInicio: ADM,
  dataInicio: dataUTC(2026, 12, 7),
  dataFim: dataUTC(2027, 1, 5),
  diasAbono: 0,
  fracoesExistentes: [],
});
ok(em10dias.ok, "programação a 12 dias do início NÃO é bloqueada (prazo só alerta)");
// 25/11 às 23h em Brasília = 26/11 02:00Z: o dia do pedido é 25/11.
ok(
  antecedenciaDaProgramacao(dataUTC(2026, 12, 25), new Date("2026-11-26T02:00:00Z")) === 30,
  "antecedência conta do dia do pedido em Brasília (25/11 → 25/12 = 30 dias)",
);

console.log("8. Art. 145 — pagamento até 2 dias antes");
ok(
  dataLimitePagamento(dataUTC(2026, 12, 7)).getTime() === dataUTC(2026, 12, 5).getTime(),
  "férias em 07/12 pagam até 05/12",
);
ok(
  dataLimitePagamento(dataUTC(2027, 1, 1)).getTime() === dataUTC(2026, 12, 30).getTime(),
  "virada de ano: 01/01 paga até 30/12",
);

console.log("9. Risco de dobra usa o direito novo");
// P1 de ADM fecha 19/01/2026, concessivo até 19/01/2027 — 55 dias de HOJE.
ok(emRiscoDeDobra(ADM, [], HOJE), "sem programação e direito 30: em risco");
ok(
  !emRiscoDeDobra(ADM, [ferias(ADM, SEGUNDA, 24)], HOJE, undefined, seisFaltas),
  "6 faltas e 24 dias programados no prazo: cobre o direito, sem risco",
);
ok(
  emRiscoDeDobra(ADM, [ferias(ADM, SEGUNDA, 24)], HOJE),
  "os mesmos 24 dias sem as faltas informadas ainda deixam 6 descobertos",
);
const risco6 = periodosEmRiscoDeDobra(ADM, [], HOJE, undefined, seisFaltas);
ok(risco6.length === 1 && risco6[0].diasDescobertos === 24, "6 faltas sem programação: 24 dias descobertos, não 30");
ok(!emRiscoDeDobra(ADM, [], HOJE, undefined, trintaETresFaltas), "sem direito (33 faltas): nada a pagar em dobro");

if (falhas > 0) {
  console.error(`\n${falhas} teste(s) falharam.`);
  process.exit(1);
}
console.log("\nTodos os testes passaram.");
