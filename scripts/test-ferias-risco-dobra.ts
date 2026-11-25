// Risco de pagar férias em dobro (lib/ferias.ts: periodosEmRiscoDeDobra /
// emRiscoDeDobra) — a regra única da tela de Férias (filtro "Risco de dobra")
// e do cartão "Férias vencidas" de Pendências. Nada aqui toca o banco.
//   npx tsx scripts/test-ferias-risco-dobra.ts
//
// O defeito que motivou (26/11/2026): a regra antiga era "12+ meses de casa e
// nenhuma férias APROVADA começando no último ano" — quem gozou o período
// anterior há 13 meses aparecia em risco mesmo com meses de concessivo pela
// frente.
import {
  DIAS_ALERTA_RISCO_DOBRA,
  emRiscoDeDobra,
  periodosEmRiscoDeDobra,
  type SolicitacaoParaRiscoDobra,
} from "@/lib/ferias";
import { dataUTC, somarDiasUTC } from "@/lib/datas";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

const HOJE = dataUTC(2026, 11, 26);

/** Solicitação de `dias` corridos a partir de `inicio`. */
const ferias = (
  periodoAquisitivoInicio: Date,
  inicio: Date,
  dias: number,
  status = "APROVADA",
  diasAbono = 0,
): SolicitacaoParaRiscoDobra => ({
  periodoAquisitivoInicio,
  dataInicio: inicio,
  dataFim: somarDiasUTC(inicio, dias - 1),
  dias,
  diasAbono,
  status,
});

console.log("1. Quem gozou há 13 meses NÃO está em risco (o falso positivo antigo)");
// Admissão 01/08/2024.
//   P1 = 01/08/2024–31/07/2025, concessivo até 31/07/2026 — gozado em 20/10/2025
//        (13 meses antes de HOJE), dentro do prazo.
//   P2 = 01/08/2025–31/07/2026, fechado, concessivo até 31/07/2027 (247 dias).
// Regra antiga: 12+ meses de casa e nenhuma APROVADA começando no último ano
// → "risco de dobra". Regra nova: nada a cobrar ainda.
const admissaoA = dataUTC(2024, 8, 1);
const gozouHa13Meses = [ferias(admissaoA, dataUTC(2025, 10, 20), 30)];
ok(!emRiscoDeDobra(admissaoA, gozouHa13Meses, HOJE), "gozou há 13 meses e o período seguinte tem 247 dias de prazo: sem risco");
ok(
  periodosEmRiscoDeDobra(admissaoA, gozouHa13Meses, HOJE).length === 0,
  "nenhum período listado em risco",
);

// Admissão 01/12/2025: P1 ainda em curso — só período fechado entra na conta.
ok(!emRiscoDeDobra(dataUTC(2025, 12, 1), [], HOJE), "com o primeiro período em curso, sem risco");

console.log("2. Quem tem período vencendo sem programação ESTÁ em risco");
// Admissão 01/01/2025: P1 = 01/01/2025–31/12/2025, concessivo até 31/12/2026
// → 35 dias de HOJE (dentro da janela de 60). Nenhuma férias marcada.
const admissaoC = dataUTC(2025, 1, 1);
const riscoC = periodosEmRiscoDeDobra(admissaoC, [], HOJE);
ok(riscoC.length === 1, "um período em risco");
ok(riscoC[0]?.diasDescobertos === 30, "os 30 dias estão descobertos");
ok(riscoC[0]?.vencido === false, "ainda não venceu — é risco, não dobra caracterizada");
ok(riscoC[0]?.periodo.diasAteLimite === 35, "faltam 35 dias para o fim do concessivo");

console.log("3. Programação que cobre o período tira o risco");
ok(
  !emRiscoDeDobra(admissaoC, [ferias(admissaoC, dataUTC(2026, 12, 1), 30, "PENDENTE")], HOJE),
  "pedido PENDENTE de 30 dias dentro do prazo cobre (é programação)",
);
ok(
  !emRiscoDeDobra(admissaoC, [ferias(admissaoC, dataUTC(2026, 12, 10), 20, "APROVADA", 10)], HOJE),
  "20 dias de gozo + 10 de abono dentro do prazo cobrem os 30",
);
ok(
  emRiscoDeDobra(admissaoC, [ferias(admissaoC, dataUTC(2026, 12, 1), 15)], HOJE),
  "só 15 dias marcados: os outros 15 continuam em risco",
);
ok(
  emRiscoDeDobra(admissaoC, [ferias(admissaoC, dataUTC(2026, 12, 1), 30, "REPROVADA")], HOJE),
  "pedido REPROVADO não é programação",
);
ok(
  emRiscoDeDobra(admissaoC, [ferias(admissaoC, dataUTC(2027, 1, 5), 30)], HOJE),
  "férias marcadas DEPOIS do fim do concessivo não cobrem — já seriam em dobro (art. 137)",
);
const atravessa = periodosEmRiscoDeDobra(admissaoC, [ferias(admissaoC, dataUTC(2026, 12, 22), 30)], HOJE);
ok(
  atravessa.length === 1 && atravessa[0].diasDescobertos === 20,
  "férias de 22/12 a 20/01: só os 10 dias até 31/12 cobrem; 20 ficam descobertos",
);

console.log("4. Janela: longe do limite não é risco ainda");
// Admissão 01/03/2025: P1 fecha 28/02/2026, concessivo até 28/02/2027 → 94 dias.
ok(!emRiscoDeDobra(dataUTC(2025, 3, 1), [], HOJE), `faltando 94 dias (> ${DIAS_ALERTA_RISCO_DOBRA}) ainda não é risco`);
// Admissão 20/01/2025: concessivo até 19/01/2027 → 54 dias.
ok(emRiscoDeDobra(dataUTC(2025, 1, 20), [], HOJE), "faltando 54 dias já é risco");

console.log("5. Período já vencido sem gozo é dobra caracterizada");
// Admissão 01/06/2023: P1 concessivo até 31/05/2025 (vencido); P2 até 31/05/2026 (vencido).
const vencido = periodosEmRiscoDeDobra(dataUTC(2023, 6, 1), [], HOJE);
ok(vencido.length === 2 && vencido.every((p) => p.vencido), "dois períodos vencidos, os dois marcados como dobra caracterizada");
ok(
  periodosEmRiscoDeDobra(
    dataUTC(2023, 6, 1),
    [ferias(dataUTC(2023, 6, 1), dataUTC(2024, 12, 1), 30)],
    HOJE,
  ).length === 1,
  "gozar o primeiro dentro do prazo deixa só o segundo vencido",
);

console.log("6. Quem ainda não fechou 12 meses nunca está em risco");
ok(!emRiscoDeDobra(dataUTC(2026, 3, 1), [], HOJE), "admitido há 9 meses: sem risco");

if (falhas > 0) {
  console.error(`\n${falhas} teste(s) falharam.`);
  process.exit(1);
}
console.log("\nTodos os testes passaram.");
