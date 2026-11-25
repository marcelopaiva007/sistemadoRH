// Prazos legais dos eventos do eSocial e aviso prévio proporcional
// (lib/prazos-legais.ts, 26/11/2026). Regra pura, sem banco.
//
//   npx tsx scripts/test-prazos-legais.ts
//
// Calendário de referência (2026): 20/11 sex · 25/11 qua · 27/11 sex ·
// 28/11 sáb · 29/11 dom · 30/11 seg · 01/12 ter.
import {
  avisoPrevioDevido,
  avisoPrevioProporcional,
  contratoGeraEventoDeEmpregado,
  diaUtilAteh,
  ehDiaUtil,
  lerReferencia,
  prazoAdmissao,
  prazoAfastamento,
  prazoCat,
  prazoRescisao,
  prazoTransferenciaGrupo,
  proximoDiaUtil,
  referenciaDoEvento,
  situacaoDoPrazo,
  type AfastamentoParaEsocial,
} from "../lib/prazos-legais";
import { anosCompletos, dataBrasilia, dataUTC, formatarData } from "../lib/datas";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}
const d = (iso: string) => {
  const [a, m, di] = iso.split("-").map(Number);
  return dataUTC(a, m, di);
};
const igual = (x: Date | null | undefined, iso: string) => !!x && formatarData(x) === formatarData(d(iso));

console.log("1. Dia útil (segunda a sexta, sem feriados):");
{
  ok(ehDiaUtil(d("2026-11-27")), "sexta é dia útil");
  ok(!ehDiaUtil(d("2026-11-28")) && !ehDiaUtil(d("2026-11-29")), "sábado e domingo não são");
  ok(igual(proximoDiaUtil(d("2026-11-27")), "2026-11-30"), "o próximo dia útil depois da sexta é a segunda");
  ok(igual(proximoDiaUtil(d("2026-11-25")), "2026-11-26"), "depois de quarta vem quinta");
  ok(igual(diaUtilAteh(d("2026-11-29")), "2026-11-27"), "domingo recua para a sexta");
  ok(igual(diaUtilAteh(d("2026-11-25")), "2026-11-25"), "dia útil não se mexe");
}

console.log("\n2. S-2200 — admissão: até o dia anterior ao início:");
{
  ok(igual(prazoAdmissao(d("2026-12-01")).prazo, "2026-11-30"), "admissão 01/12 → prazo 30/11");
  // A transmissão funciona todo dia: não há ajuste de fim de semana.
  ok(igual(prazoAdmissao(d("2026-11-30")).prazo, "2026-11-29"), "admissão na segunda → prazo no domingo (sem ajuste)");
}

console.log("\n3. S-2299 / rescisão — 10 dias corridos do término (CLT art. 477 §6º):");
{
  ok(igual(prazoRescisao(d("2026-11-20")).prazo, "2026-11-30"), "término 20/11 → 30/11 (10º dia é segunda)");
  ok(igual(prazoRescisao(d("2026-11-18")).prazo, "2026-11-27"), "10º dia num sábado → antecipa para a sexta");
  ok(igual(prazoRescisao(d("2026-11-19")).prazo, "2026-11-27"), "10º dia num domingo → antecipa para a sexta");
  ok(/antecipado/.test(prazoRescisao(d("2026-11-18")).regra), "a regra diz que foi antecipado");
  ok(!/antecipado/.test(prazoRescisao(d("2026-11-20")).regra), "sem fim de semana, a regra não fala em antecipar");
  // Transferência no grupo: mesmo prazo do S-2299, sem falar em rescisão.
  ok(igual(prazoTransferenciaGrupo(d("2026-11-18")).prazo, "2026-11-27"), "transferência: mesmo prazo do S-2299 (antecipa do sábado)");
  ok(!/477|pagamento da rescis/i.test(prazoTransferenciaGrupo(d("2026-11-20")).regra.replace("sem pagamento de rescisão", "")), "transferência: o texto não cita o art. 477");
  ok(/sem pagamento de rescisão/.test(prazoTransferenciaGrupo(d("2026-11-20")).regra), "transferência: o texto diz que não há rescisão");
}

console.log("\n4. S-2210 — CAT: 1º dia útil seguinte; óbito, imediato:");
{
  ok(igual(prazoCat(d("2026-11-25"), false).prazo, "2026-11-26"), "acidente na quarta → quinta");
  ok(igual(prazoCat(d("2026-11-27"), false).prazo, "2026-11-30"), "acidente na sexta → segunda");
  ok(igual(prazoCat(d("2026-11-28"), false).prazo, "2026-11-30"), "acidente no sábado → segunda");
  ok(igual(prazoCat(d("2026-11-27"), true).prazo, "2026-11-27"), "óbito → no próprio dia");
  // 01:00Z do dia 26 = 22:00 do dia 25 em Brasília. Com o dia em UTC, o
  // prazo pularia um dia (27/11); com o dia de Brasília, é 26/11.
  const diaDoAcidente = dataBrasilia(new Date("2026-11-26T01:00:00Z"));
  ok(igual(diaDoAcidente, "2026-11-25"), "acidente às 22h de Brasília é do dia de Brasília");
  ok(igual(prazoCat(diaDoAcidente, false).prazo, "2026-11-26"), "…e o prazo conta dele (26/11, não 27/11)");
}

console.log("\n5. S-2230 — afastamento:");
{
  const af = (p: Partial<AfastamentoParaEsocial> & { tipo: string; inicio: string; fim: string; dias: number }) =>
    prazoAfastamento({
      tipo: p.tipo,
      dataInicio: d(p.inicio),
      dataFim: d(p.fim),
      dias: p.dias,
      ligadoAAcidente: p.ligadoAAcidente ?? false,
    });

  ok(
    igual(af({ tipo: "ATESTADO", inicio: "2026-11-02", fim: "2026-11-21", dias: 20 })?.prazo, "2026-11-17"),
    "doença de 20 dias a partir de 02/11 → até o 16º dia (17/11)",
  );
  ok(af({ tipo: "ATESTADO", inicio: "2026-11-02", fim: "2026-11-11", dias: 10 }) === null, "doença de 10 dias não é evento");
  ok(
    af({ tipo: "ATESTADO", inicio: "2026-11-02", fim: "2026-11-16", dias: 15 }) === null,
    "doença de exatamente 15 dias não é evento (precisa ser ACIMA de 15)",
  );
  ok(
    igual(af({ tipo: "ATESTADO", inicio: "2026-11-01", fim: "2026-11-20", dias: 0 })?.prazo, "2026-11-16"),
    "sem `dias` preenchido, a duração sai das datas (20 dias → evento)",
  );
  ok(
    igual(af({ tipo: "ACIDENTE_TRABALHO", inicio: "2026-11-10", fim: "2026-11-11", dias: 2 })?.prazo, "2026-12-15"),
    "acidente de trabalho de 2 dias → cobrado (conservador), até 15 do mês seguinte",
  );
  ok(
    igual(af({ tipo: "ACIDENTE_TRABALHO", inicio: "2026-11-10", fim: "2026-12-09", dias: 30 })?.prazo, "2026-11-25"),
    "acidente de trabalho de 30 dias → até o 16º dia (25/11)",
  );
  ok(
    igual(
      af({ tipo: "ATESTADO", inicio: "2026-11-10", fim: "2026-11-14", dias: 5, ligadoAAcidente: true })?.prazo,
      "2026-12-15",
    ),
    "atestado ligado a um acidente registrado conta como acidente de trabalho",
  );
  ok(
    igual(af({ tipo: "ACIDENTE_TRABALHO", inicio: "2026-12-03", fim: "2026-12-04", dias: 2 })?.prazo, "2027-01-15"),
    "afastamento de dezembro → 15 de janeiro do ano seguinte",
  );
  ok(
    igual(af({ tipo: "LICENCA_MATERNIDADE", inicio: "2026-11-03", fim: "2027-03-02", dias: 120 })?.prazo, "2026-12-15"),
    "licença-maternidade → até 15 do mês seguinte ao início",
  );
  ok(
    igual(af({ tipo: "AFASTAMENTO_INSS", inicio: "2026-11-16", fim: "2026-11-25", dias: 10 })?.prazo, "2026-11-16"),
    "afastamento INSS curto (só o trecho do INSS) → até o próprio início",
  );
  ok(af({ tipo: "FALTA_JUSTIFICADA", inicio: "2026-11-02", fim: "2026-11-30", dias: 29 }) === null, "falta justificada não é S-2230");
  ok(af({ tipo: "LICENCA_GALA", inicio: "2026-11-02", fim: "2026-11-04", dias: 3 }) === null, "licença-gala não é S-2230");
}

console.log("\n6. Aviso prévio proporcional (Lei 12.506/2011):");
{
  ok(avisoPrevioProporcional(0) === 30, "0 anos → 30 dias");
  ok(avisoPrevioProporcional(0.9) === 30, "ano incompleto não conta → 30 dias");
  ok(avisoPrevioProporcional(1) === 33, "1 ano → 33 dias");
  ok(avisoPrevioProporcional(10) === 60, "10 anos → 60 dias");
  ok(avisoPrevioProporcional(20) === 90, "20 anos → 90 dias (o teto)");
  ok(avisoPrevioProporcional(25) === 90, "25 anos → 90 dias (não passa do teto)");
  ok(avisoPrevioProporcional(-1) === 30, "data invertida não dá aviso negativo");
  // Um dia antes de completar 10 anos ainda são 9.
  ok(
    avisoPrevioProporcional(anosCompletos(d("2016-11-26"), d("2026-11-25"))) === 57,
    "admissão 26/11/2016, saída 25/11/2026 → 9 anos completos → 57 dias",
  );

  ok(avisoPrevioDevido("SEM_JUSTA_CAUSA", 10).dias === 60, "dispensa sem justa causa, 10 anos → 60 dias");
  const acordo = avisoPrevioDevido("ACORDO", 10);
  ok(acordo.dias === 60 && acordo.texto.includes("30"), "acordo (484-A) → mostra a metade (30) se indenizado");
  ok(avisoPrevioDevido("PEDIDO_DEMISSAO", 25).dias === 30, "pedido de demissão → 30 dias, sem proporcional");
  ok(avisoPrevioDevido("JUSTA_CAUSA", 10).dias === null, "justa causa → sem aviso");
  ok(avisoPrevioDevido("TRANSFERENCIA_GRUPO", 10).dias === null, "transferência no grupo → sem aviso");
  ok(avisoPrevioDevido(null, 10).dias === null, "sem motivo → sem aviso, pedindo o motivo");
}

console.log("\n7. Situação do prazo:");
{
  const hoje = d("2026-11-25");
  ok(situacaoDoPrazo(d("2026-11-24"), hoje).situacao === "VENCIDO", "ontem → vencido");
  ok(situacaoDoPrazo(d("2026-11-24"), hoje).dias === -1, "…há 1 dia");
  ok(situacaoDoPrazo(d("2026-11-25"), hoje).situacao === "HOJE", "hoje → vence hoje (ainda no prazo)");
  const futuro = situacaoDoPrazo(d("2026-11-30"), hoje);
  ok(futuro.situacao === "NO_PRAZO" && futuro.dias === 5, "30/11 → no prazo, faltam 5 dias");
}

console.log("\n8. Chave do evento e contratos:");
{
  const ref = referenciaDoEvento("colab1", d("2026-12-01"));
  ok(ref === "colab1@2026-12-01", "admissão/desligamento levam a data na chave");
  ok(referenciaDoEvento("colab1", d("2026-12-02")) !== ref, "corrigir a data muda a chave (a pendência volta)");
  const lida = lerReferencia(ref);
  ok(lida.id === "colab1" && lida.data === "2026-12-01", "a chave volta a id + data");
  ok(referenciaDoEvento("acid1") === "acid1" && lerReferencia("acid1").data === null, "acidente/afastamento: só o id");
  ok(contratoGeraEventoDeEmpregado("CLT") && contratoGeraEventoDeEmpregado("EXPERIENCIA"), "CLT e experiência geram S-2200/S-2299");
  ok(contratoGeraEventoDeEmpregado(null), "contrato sem tipo entra (na dúvida, cobra)");
  ok(!contratoGeraEventoDeEmpregado("ESTAGIO") && !contratoGeraEventoDeEmpregado("PJ"), "estágio e PJ ficam de fora");
}

if (falhas > 0) {
  console.error(`\n${falhas} verificação(ões) falharam.`);
  process.exit(1);
}
console.log("\nTodos os testes passaram.");
