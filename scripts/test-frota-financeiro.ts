// Financeiro da Frota — as contas que quebram calado, provadas sem banco:
// próximo vencimento por recorrência, clamp de fim de mês, semáforo e as
// validações condicionais. Cobre os critérios de aceite da spec de 31/08/2026.
//
//   npx tsx scripts/test-frota-financeiro.ts

import {
  DIAS_ALERTA_VENCIMENTO_FINANCEIRO,
  proximoVencimento,
  retratoFinanceiro,
  somarRecorrenciaUTC,
  validarFinanceiro,
  type RegistroFinanceiro,
} from "../lib/processos/frota-financeiro";

let falhas = 0;
function ok(condicao: boolean, descricao: string) {
  console.log(`${condicao ? "✅" : "❌"} ${descricao}`);
  if (!condicao) falhas++;
}
function igualData(recebido: Date | null, esperadoISO: string | null, descricao: string) {
  const r = recebido ? recebido.toISOString().slice(0, 10) : null;
  const passou = r === esperadoISO;
  console.log(`${passou ? "✅" : "❌"} ${descricao}`);
  if (!passou) {
    console.log(`     esperado: ${esperadoISO}`);
    console.log(`     recebido: ${r}`);
    falhas++;
  }
}

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function registro(sobrescreve: Partial<RegistroFinanceiro> = {}): RegistroFinanceiro {
  return {
    tipoAquisicao: "FINANCIADO",
    situacao: "EM_PAGAMENTO",
    valorParcela: 1200,
    qtdParcelasTotal: 48,
    qtdParcelasPagas: 6,
    dataPrimeiraParcela: d("2026-01-10"),
    recorrencia: "MENSAL",
    recorrenciaIntervaloDias: null,
    dataProximoVencimento: null,
    ...sobrescreve,
  };
}

console.log("\nAceite: 48 parcelas mensais, 6 pagas — próxima é a 7ª\n");
{
  // Primeira em 10/01, 6 pagas → a 7ª vence em 10/07.
  igualData(proximoVencimento(registro()), "2026-07-10", "primeira 10/01 + 6 mensais = 10/07");
}

console.log("\nAceite: fim de mês — 31/01 cai no último dia de fevereiro\n");
{
  const r = registro({ dataPrimeiraParcela: d("2026-01-31"), qtdParcelasPagas: 1 });
  igualData(proximoVencimento(r), "2026-02-28", "31/01 + 1 mês = 28/02 (2026 não é bissexto)");
  const bissexto = registro({ dataPrimeiraParcela: d("2028-01-31"), qtdParcelasPagas: 1 });
  igualData(proximoVencimento(bissexto), "2028-02-29", "31/01 + 1 mês em bissexto = 29/02");
  // O clamp NÃO propaga: março volta ao dia 31, porque a âncora é a primeira.
  const marco = registro({ dataPrimeiraParcela: d("2026-01-31"), qtdParcelasPagas: 2 });
  igualData(proximoVencimento(marco), "2026-03-31", "31/01 + 2 meses = 31/03 (clamp não propaga)");
}

console.log("\nRecorrências não mensais\n");
{
  igualData(
    somarRecorrenciaUTC(d("2026-01-10"), 3, "QUINZENAL", null),
    "2026-02-24",
    "quinzenal: 10/01 + 3×15d = 24/02",
  );
  igualData(
    somarRecorrenciaUTC(d("2026-01-10"), 2, "SEMANAL", null),
    "2026-01-24",
    "semanal: 10/01 + 2×7d = 24/01",
  );
  igualData(
    somarRecorrenciaUTC(d("2026-01-10"), 1, "ANUAL", null),
    "2027-01-10",
    "anual: +12 meses",
  );
  igualData(
    somarRecorrenciaUTC(d("2026-01-10"), 2, "PERSONALIZADA", 20),
    "2026-02-19",
    "personalizada 20d: 10/01 + 40d = 19/02",
  );
  igualData(
    somarRecorrenciaUTC(d("2026-01-10"), 0, "SEM_RECORRENCIA", null),
    "2026-01-10",
    "sem recorrência com 0 pagas: vence na primeira",
  );
  ok(
    somarRecorrenciaUTC(d("2026-01-10"), 1, "SEM_RECORRENCIA", null) === null,
    "sem recorrência com 1 paga: não há próxima",
  );
}

console.log("\nAceite: semáforo nas bordas\n");
{
  const hoje = d("2026-08-31");
  const status = (venc: string) =>
    retratoFinanceiro(registro({ dataProximoVencimento: d(venc) }), hoje).status;
  ok(status("2026-08-30") === "VENCIDO", "vencimento ontem → VENCIDO");
  ok(status("2026-08-31") === "PROXIMO", "vence hoje → PROXIMO (0 dias)");
  ok(status("2026-09-05") === "PROXIMO", "vence em 5 dias → PROXIMO");
  ok(status("2026-09-07") === "PROXIMO", `vence em ${DIAS_ALERTA_VENCIMENTO_FINANCEIRO} dias → PROXIMO (borda)`);
  ok(status("2026-09-08") === "EM_DIA", "vence em 8 dias → EM_DIA");
  ok(status("2026-09-20") === "EM_DIA", "vence em 20 dias → EM_DIA");
}

console.log("\nAceite: à vista e quitado nunca alertam\n");
{
  const hoje = d("2026-08-31");
  ok(
    retratoFinanceiro(registro({ tipoAquisicao: "A_VISTA", situacao: "QUITADO" }), hoje).status ===
      "SEM_COBRANCA",
    "à vista → SEM_COBRANCA, sem cor de alerta",
  );
  ok(
    retratoFinanceiro(
      registro({ tipoAquisicao: "A_VISTA", situacao: "EM_PAGAMENTO", dataProximoVencimento: d("2020-01-01") }),
      hoje,
    ).status === "SEM_COBRANCA",
    "à vista com data no passado ainda não alerta",
  );
  ok(
    retratoFinanceiro(registro({ situacao: "QUITADO" }), hoje).status === "QUITADO",
    "situação quitada → QUITADO",
  );
  ok(retratoFinanceiro(null, hoje).status === "SEM_DADOS", "sem registro → SEM_DADOS");
}

console.log("\nAceite: data manual prevalece sobre a calculada\n");
{
  const r = registro({ dataProximoVencimento: d("2026-12-25") });
  igualData(proximoVencimento(r), "2026-12-25", "manual 25/12 vence sobre o cálculo (10/07)");
}

console.log("\nDerivados: restantes, saldo e quitação prevista\n");
{
  const hoje = d("2026-08-31");
  const ret = retratoFinanceiro(registro(), hoje);
  ok(ret.parcelasRestantes === 42, "48 − 6 = 42 restantes");
  ok(ret.saldoDevedor === 42 * 1200, "saldo = 42 × 1.200 = 50.400");
  igualData(ret.dataQuitacaoPrevista, "2029-12-10", "quitação prevista = 1ª + 47 meses = 10/12/2029");
  const alugado = retratoFinanceiro(
    registro({ tipoAquisicao: "ALUGADO", qtdParcelasTotal: null }),
    hoje,
  );
  ok(alugado.parcelasRestantes === null && alugado.saldoDevedor === null, "alugado sem total: derivados nulos, sem inventar número");
}

console.log("\nValidações condicionais (servidor)\n");
{
  ok(validarFinanceiro(registro()).ok, "registro completo passa");
  ok(!validarFinanceiro(registro({ valorParcela: null })).ok, "EM_PAGAMENTO sem valor da parcela, nega");
  ok(!validarFinanceiro(registro({ dataPrimeiraParcela: null })).ok, "EM_PAGAMENTO sem primeira parcela, nega");
  ok(!validarFinanceiro(registro({ qtdParcelasTotal: null })).ok, "financiado sem total de parcelas, nega");
  ok(
    validarFinanceiro(registro({ tipoAquisicao: "ALUGADO", qtdParcelasTotal: null })).ok,
    "alugado sem total de parcelas, passa (contrato sem fim)",
  );
  ok(
    validarFinanceiro(
      registro({ tipoAquisicao: "A_VISTA", situacao: "QUITADO", valorParcela: null, qtdParcelasTotal: null, dataPrimeiraParcela: null }),
    ).ok,
    "à vista quitado sem parcelamento, passa",
  );
  ok(!validarFinanceiro(registro({ qtdParcelasPagas: 49 })).ok, "pagas > total, nega");
  ok(!validarFinanceiro(registro({ valorParcela: -10 })).ok, "valor negativo, nega");
  ok(
    !validarFinanceiro(registro({ recorrencia: "PERSONALIZADA", recorrenciaIntervaloDias: null })).ok,
    "personalizada sem intervalo, nega",
  );
  ok(!validarFinanceiro(registro({ tipoAquisicao: "OUTRO" })).ok, "tipo fora do domínio, nega");
}

console.log("");
if (falhas > 0) {
  console.error(`❌ ${falhas} falha(s).`);
  process.exit(1);
}
console.log("✅ Tudo passou.");
