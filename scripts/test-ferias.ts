// Testes do motor de férias CLT (lib/ferias.ts) e das datas de calendário
// (lib/datas.ts). Nada aqui toca o banco.
//   npx tsx scripts/test-ferias.ts
import {
  calcularFerias,
  contarDiasCorridos,
  validarSolicitacaoFerias,
  type SolicitacaoParaCalculo,
} from "@/lib/ferias";
import { dataUTC, diferencaEmDiasUTC, formatarData, somarAnosUTC, tempoDeCasa } from "@/lib/datas";
import { contaComoProgramada, resumirProgramacaoFerias } from "@/lib/ferias-passivo";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

const HOJE = dataUTC(2026, 7, 24);

console.log("1. Datas de calendário");
ok(formatarData(dataUTC(2026, 7, 24)) === "24/07/2026", "formata em dd/mm/aaaa sem escorregar de dia");
ok(diferencaEmDiasUTC(dataUTC(2026, 7, 24), dataUTC(2026, 7, 20)) === 4, "diferença em dias");
ok(
  somarAnosUTC(dataUTC(2024, 2, 29), 1).getTime() === dataUTC(2025, 2, 28).getTime(),
  "29/02 + 1 ano vira 28/02 em ano não bissexto",
);
ok(contarDiasCorridos(dataUTC(2026, 8, 1), dataUTC(2026, 8, 30)) === 30, "30 dias corridos contam as duas pontas");
ok(tempoDeCasa(dataUTC(2023, 5, 24), HOJE) === "3 anos e 2 meses", "tempo de casa");

console.log("2. Períodos aquisitivos");
const semFerias: SolicitacaoParaCalculo[] = [];
const tresAnos = calcularFerias(dataUTC(2023, 3, 10), semFerias, HOJE);
ok(tresAnos.periodos.length === 4, "admissão em 10/03/2023 gera 4 períodos até 24/07/2026 (3 fechados + 1 em curso)");
ok(tresAnos.periodos[3].status === "EM_CURSO", "o último período ainda está em curso");
ok(tresAnos.saldoDisponivel === 90, "3 períodos adquiridos sem gozo = 90 dias de saldo");
ok(
  tresAnos.periodos[0].fim.getTime() === dataUTC(2024, 3, 9).getTime(),
  "o período aquisitivo termina na véspera do aniversário de admissão",
);
ok(
  tresAnos.periodos[0].limiteConcessivo.getTime() === dataUTC(2025, 3, 9).getTime(),
  "o limite de gozo é 12 meses após o fim do aquisitivo",
);
ok(tresAnos.temVencido, "o período de 2023 já passou do limite concessivo — vencido");

const recemAdmitido = calcularFerias(dataUTC(2026, 2, 1), semFerias, HOJE);
ok(recemAdmitido.periodos.length === 1 && recemAdmitido.periodos[0].status === "EM_CURSO", "quem tem 6 meses de casa só tem período em curso");
ok(recemAdmitido.saldoDisponivel === 0, "sem 12 meses não há saldo");

console.log("3. Saldo com férias gozadas e pendentes");
const inicioPeriodo = dataUTC(2024, 3, 10);
const comGozo = calcularFerias(
  dataUTC(2023, 3, 10),
  [
    { periodoAquisitivoInicio: inicioPeriodo, dias: 20, diasAbono: 10, status: "APROVADA" },
    { periodoAquisitivoInicio: dataUTC(2025, 3, 10), dias: 15, diasAbono: 0, status: "PENDENTE" },
  ],
  HOJE,
);
const p2024 = comGozo.periodos.find((p) => p.inicio.getTime() === inicioPeriodo.getTime())!;
ok(p2024.diasUsados === 30 && p2024.saldo === 0, "20 dias de gozo + 10 de abono zeram o período");
ok(p2024.status === "CONCLUIDO", "período sem saldo fica concluído mesmo depois do limite");
const p2025 = comGozo.periodos.find((p) => p.inicio.getTime() === dataUTC(2025, 3, 10).getTime())!;
ok(p2025.diasReservados === 15 && p2025.saldo === 15, "pedido pendente reserva o saldo sem consumir");

console.log("4. Validação da solicitação");
const resumo = calcularFerias(dataUTC(2023, 3, 10), semFerias, HOJE);
const periodo = dataUTC(2024, 3, 10);

const okPedido = validarSolicitacaoFerias({
  resumo,
  periodoAquisitivoInicio: periodo,
  dataInicio: dataUTC(2026, 9, 1),
  dataFim: dataUTC(2026, 9, 30),
  diasAbono: 0,
  fracoesExistentes: [],
});
ok(okPedido.ok && okPedido.dias === 30, "30 dias corridos num período cheio passa");

const abonoDemais = validarSolicitacaoFerias({
  resumo,
  periodoAquisitivoInicio: periodo,
  dataInicio: dataUTC(2026, 9, 1),
  dataFim: dataUTC(2026, 9, 10),
  diasAbono: 11,
  fracoesExistentes: [],
});
ok(!abonoDemais.ok, "abono acima de 10 dias é recusado");

const semSaldo = validarSolicitacaoFerias({
  resumo,
  periodoAquisitivoInicio: periodo,
  dataInicio: dataUTC(2026, 9, 1),
  dataFim: dataUTC(2026, 10, 15),
  diasAbono: 0,
  fracoesExistentes: [],
});
ok(!semSaldo.ok, "pedido maior que o saldo é recusado");

const fracaoCurta = validarSolicitacaoFerias({
  resumo,
  periodoAquisitivoInicio: periodo,
  dataInicio: dataUTC(2026, 9, 1),
  dataFim: dataUTC(2026, 9, 3),
  diasAbono: 0,
  fracoesExistentes: [{ dias: 20 }],
});
ok(!fracaoCurta.ok, "fração de 3 dias é recusada (mínimo 5)");

// As frações já existentes também entram no resumo — é assim que a action monta
// os dois, a partir da mesma lista de solicitações.
const duasDeDez: SolicitacaoParaCalculo[] = [
  { periodoAquisitivoInicio: periodo, dias: 10, diasAbono: 0, status: "APROVADA" },
  { periodoAquisitivoInicio: periodo, dias: 10, diasAbono: 0, status: "APROVADA" },
];
const semFracaoDe14 = validarSolicitacaoFerias({
  resumo: calcularFerias(dataUTC(2023, 3, 10), duasDeDez, HOJE),
  periodoAquisitivoInicio: periodo,
  dataInicio: dataUTC(2026, 9, 1),
  dataFim: dataUTC(2026, 9, 10),
  diasAbono: 0,
  fracoesExistentes: duasDeDez,
});
ok(!semFracaoDe14.ok, "fracionar em 10+10+10 sem nenhum período de 14 dias é recusado");

const umaDeVinte: SolicitacaoParaCalculo[] = [
  { periodoAquisitivoInicio: periodo, dias: 20, diasAbono: 0, status: "APROVADA" },
];
const comFracaoDe14 = validarSolicitacaoFerias({
  resumo: calcularFerias(dataUTC(2023, 3, 10), umaDeVinte, HOJE),
  periodoAquisitivoInicio: periodo,
  dataInicio: dataUTC(2026, 9, 1),
  dataFim: dataUTC(2026, 9, 10),
  diasAbono: 0,
  fracoesExistentes: umaDeVinte,
});
ok(comFracaoDe14.ok, "20 + 10 dias é aceito (a fração de 20 cumpre o mínimo de 14)");

const periodoEmCurso = validarSolicitacaoFerias({
  resumo,
  periodoAquisitivoInicio: dataUTC(2026, 3, 10),
  dataInicio: dataUTC(2026, 9, 1),
  dataFim: dataUTC(2026, 9, 10),
  diasAbono: 0,
  fracoesExistentes: [],
});
ok(!periodoEmCurso.ok, "não dá para gozar período aquisitivo ainda em curso");

console.log("\n5. Programação (regra única do cartão e da tela /ferias/programadas)");
{
  const agenda = [
    // Começa hoje: conta.
    { dataInicio: HOJE, status: "APROVADA" },
    // Dentro da janela de 6 meses: conta, mesmo pendente (pedido vivo).
    { dataInicio: dataUTC(2026, 10, 1), status: "PENDENTE" },
    // Exatamente no fim da janela (24/01/2027): conta — a borda é inclusiva.
    { dataInicio: dataUTC(2027, 1, 24), status: "APROVADA" },
    // Um dia depois da janela: não conta no cartão.
    { dataInicio: dataUTC(2027, 1, 25), status: "APROVADA" },
    // Futuras mas mortas: reprovada/cancelada não são agenda.
    { dataInicio: dataUTC(2026, 10, 1), status: "REPROVADA" },
    { dataInicio: dataUTC(2026, 10, 1), status: "CANCELADA" },
    // Passado: é histórico, não programação.
    { dataInicio: dataUTC(2026, 5, 1), status: "APROVADA" },
  ];
  ok(
    agenda.filter((s) => contaComoProgramada(s, HOJE)).length === 3,
    "contaComoProgramada: hoje + janela inclusiva contam; morta, fora da janela e passado não",
  );
  const prog = resumirProgramacaoFerias(agenda, HOJE);
  ok(
    prog.agendadas === agenda.filter((s) => contaComoProgramada(s, HOJE)).length,
    "cartão (resumirProgramacaoFerias) e lista (contaComoProgramada) dão o mesmo número",
  );
  ok(prog.totalRegistros === 7 && !prog.vazia, "totalRegistros conta tudo; vazia=false com agenda");
  const semNada = resumirProgramacaoFerias(
    [{ dataInicio: dataUTC(2026, 5, 1), status: "APROVADA" }],
    HOJE,
  );
  ok(semNada.vazia && semNada.aviso !== null, "só histórico ⇒ vazia, com aviso explicando");
}

console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
