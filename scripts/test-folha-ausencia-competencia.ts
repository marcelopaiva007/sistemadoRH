// Recorte das ausências ao mês da competência (lib/folha-ausencias.ts).
// Nada aqui toca o banco.
//   npx tsx scripts/test-folha-ausencia-competencia.ts
//
// O defeito que motivou (26/11/2026): uma falta de 28/01 a 05/02 virava 9
// faltas em janeiro E 9 em fevereiro — `importarEventosDerivados` somava o
// `dias` inteiro em toda competência que a ausência tocava.
import {
  diasDaAusenciaNaCompetencia,
  diasDaCompetencia,
  faltasPorColaboradorNaCompetencia,
} from "@/lib/folha-ausencias";
import { competenciaUTC } from "@/lib/constants-folha";
import { contarDiasCorridos } from "@/lib/ferias";
import { dataUTC } from "@/lib/datas";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

/** Ausência como o sistema grava: `dias` = corridos contando as duas pontas. */
const ausencia = (inicio: Date, fim: Date, dias = contarDiasCorridos(inicio, fim)) => ({
  dataInicio: inicio,
  dataFim: fim,
  dias,
});

const JAN = competenciaUTC(2027, 1);
const FEV = competenciaUTC(2027, 2);
const MAR = competenciaUTC(2027, 3);
const DEZ_2026 = competenciaUTC(2026, 12);

console.log("1. Limites do mês");
ok(diasDaCompetencia(FEV).ultimo.getTime() === dataUTC(2027, 2, 28).getTime(), "fevereiro de 2027 termina no dia 28");
ok(
  diasDaCompetencia(competenciaUTC(2028, 2)).ultimo.getTime() === dataUTC(2028, 2, 29).getTime(),
  "fevereiro de 2028 (bissexto) termina no dia 29",
);

console.log("2. Ausência atravessando o mês (o caso do defeito)");
const virada = ausencia(dataUTC(2027, 1, 28), dataUTC(2027, 2, 5));
ok(virada.dias === 9, "28/01 a 05/02 são 9 dias corridos");
ok(diasDaAusenciaNaCompetencia(virada, JAN) === 4, "janeiro recebe só 28, 29, 30 e 31 = 4");
ok(diasDaAusenciaNaCompetencia(virada, FEV) === 5, "fevereiro recebe só 01 a 05 = 5");
ok(
  diasDaAusenciaNaCompetencia(virada, JAN) + diasDaAusenciaNaCompetencia(virada, FEV) === virada.dias,
  "somadas as duas competências, dá os 9 dias — nem um a mais",
);

console.log("3. Ausência atravessando o ano");
const ano = ausencia(dataUTC(2026, 12, 30), dataUTC(2027, 1, 2));
ok(diasDaAusenciaNaCompetencia(ano, DEZ_2026) === 2, "dezembro/2026 recebe 30 e 31 = 2");
ok(diasDaAusenciaNaCompetencia(ano, JAN) === 2, "janeiro/2027 recebe 01 e 02 = 2");

console.log("4. Ausência que começa antes e termina depois do mês");
const longa = ausencia(dataUTC(2027, 1, 20), dataUTC(2027, 3, 10));
ok(diasDaAusenciaNaCompetencia(longa, FEV) === 28, "fevereiro inteiro coberto = 28 dias (não os 50 da ausência)");
ok(diasDaAusenciaNaCompetencia(longa, JAN) === 12, "janeiro recebe de 20 a 31 = 12");
ok(diasDaAusenciaNaCompetencia(longa, MAR) === 10, "março recebe de 01 a 10 = 10");

console.log("5. Ausência inteira fora do mês");
ok(diasDaAusenciaNaCompetencia(ausencia(dataUTC(2027, 3, 1), dataUTC(2027, 3, 3)), FEV) === 0, "março não conta em fevereiro");
ok(diasDaAusenciaNaCompetencia(ausencia(dataUTC(2027, 1, 1), dataUTC(2027, 1, 31)), FEV) === 0, "janeiro inteiro não conta em fevereiro");
ok(diasDaAusenciaNaCompetencia(ausencia(dataUTC(2027, 2, 5), dataUTC(2027, 2, 1), 3), FEV) === 0, "datas invertidas não viram falta");

console.log("6. Ausência dentro do mês");
ok(diasDaAusenciaNaCompetencia(ausencia(dataUTC(2027, 2, 10), dataUTC(2027, 2, 12)), FEV) === 3, "10 a 12/02 = 3");
ok(diasDaAusenciaNaCompetencia(ausencia(dataUTC(2027, 2, 1), dataUTC(2027, 2, 1)), FEV) === 1, "um dia só, no primeiro dia do mês");
ok(diasDaAusenciaNaCompetencia(ausencia(dataUTC(2027, 2, 28), dataUTC(2027, 2, 28)), FEV) === 1, "um dia só, no último dia do mês");
ok(
  diasDaAusenciaNaCompetencia(ausencia(dataUTC(2027, 2, 10), dataUTC(2027, 2, 14), 2), FEV) === 2,
  "inteira no mês, vale o `dias` gravado (o que o RH aprovou), não o recalculado",
);
ok(
  diasDaAusenciaNaCompetencia(ausencia(dataUTC(2027, 1, 30), dataUTC(2027, 2, 10), 3), FEV) <= 3,
  "atravessando o mês, nunca passa do `dias` gravado",
);

console.log("7. Fuso: data gravada com hora não escorrega de mês");
// Datas de calendário são meia-noite UTC (lib/datas.ts); se alguma vier com
// hora — ex.: meia-noite de Brasília gravada como 03:00Z —, o dia é o do UTC.
const comHora = { dataInicio: new Date("2027-02-01T03:00:00Z"), dataFim: new Date("2027-02-02T03:00:00Z"), dias: 2 };
ok(diasDaAusenciaNaCompetencia(comHora, FEV) === 2, "01 e 02/02 gravados às 03:00Z contam 2 em fevereiro");
ok(diasDaAusenciaNaCompetencia(comHora, JAN) === 0, "e nenhum em janeiro");
const fimComHora = { dataInicio: new Date("2027-01-31T00:00:00Z"), dataFim: new Date("2027-01-31T23:59:59Z"), dias: 1 };
ok(diasDaAusenciaNaCompetencia(fimComHora, JAN) === 1, "31/01 com hora no fim do dia continua em janeiro");
ok(diasDaAusenciaNaCompetencia(fimComHora, FEV) === 0, "e não vaza para fevereiro");

console.log("8. Soma por colaborador");
const porPessoa = faltasPorColaboradorNaCompetencia(
  [
    { colaboradorId: "a", ...virada },
    { colaboradorId: "a", ...ausencia(dataUTC(2027, 2, 20), dataUTC(2027, 2, 21)) },
    { colaboradorId: "b", ...ausencia(dataUTC(2027, 1, 5), dataUTC(2027, 1, 6)) },
  ],
  FEV,
);
ok(porPessoa.get("a") === 7, "A: 5 da virada + 2 de 20–21/02 = 7 em fevereiro");
ok(!porPessoa.has("b"), "B só faltou em janeiro — não entra em fevereiro");

if (falhas > 0) {
  console.error(`\n${falhas} teste(s) falharam.`);
  process.exit(1);
}
console.log("\nTodos os testes passaram.");
