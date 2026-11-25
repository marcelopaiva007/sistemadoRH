// Absenteísmo recortado à janela [hoje − 30, hoje] (lib/bi.ts, que reusa o
// recorte da folha em lib/folha-ausencias.ts). Nada aqui toca o banco.
//   npx tsx scripts/test-absenteismo-janela.ts
//
// O defeito que motivou (26/11/2026): painel, CSV de indicadores e tela
// inicial somavam o `dias` INTEIRO de toda ausência que começou nos últimos 30
// dias — um afastamento de 15 dias iniciado anteontem contava 15 faltas, 13
// delas no futuro — e ignoravam a que começou antes da janela e seguia dentro.
import {
  absenteismoPorSetor,
  diasDeFaltaNaJanela,
  filtroAusenciasDaJanela,
  janelaDoAbsenteismo,
} from "@/lib/bi";
import {
  diasDaAusenciaNaCompetencia,
  diasDaAusenciaNoIntervalo,
} from "@/lib/folha-ausencias";
import { contarDiasCorridos } from "@/lib/ferias";
import { dataUTC, hojeCalendarioBrasilia } from "@/lib/datas";

let falhas = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    falhas++;
    console.error(`  ✗ FALHOU: ${msg}`);
  }
}

const ausencia = (inicio: Date, fim: Date, dias = contarDiasCorridos(inicio, fim)) => ({
  dataInicio: inicio,
  dataFim: fim,
  dias,
});

const HOJE = dataUTC(2026, 11, 26);

console.log("1. A janela");
const { inicio, fim } = janelaDoAbsenteismo(HOJE);
ok(inicio.getTime() === dataUTC(2026, 10, 27).getTime(), "começa em hoje − 30 (27/10)");
ok(fim.getTime() === HOJE.getTime(), "termina hoje (26/11)");
const filtro = filtroAusenciasDaJanela(HOJE);
ok(
  filtro.dataInicio.lte.getTime() === HOJE.getTime() && filtro.dataFim.gte.getTime() === inicio.getTime(),
  "o filtro do banco pega toda ausência que TOCA a janela",
);

console.log("2. Recorte de cada ausência");
ok(diasDeFaltaNaJanela(ausencia(dataUTC(2026, 11, 10), dataUTC(2026, 11, 12)), HOJE) === 3, "inteira dentro: o `dias` gravado");
ok(
  diasDeFaltaNaJanela(ausencia(dataUTC(2026, 11, 24), dataUTC(2026, 12, 8)), HOJE) === 3,
  "15 dias iniciados anteontem: só 24, 25 e 26 já aconteceram (antes: 15)",
);
ok(
  diasDeFaltaNaJanela(ausencia(dataUTC(2026, 10, 20), dataUTC(2026, 10, 31)), HOJE) === 5,
  "começou antes da janela: só 27 a 31/10 contam (antes: 0)",
);
ok(
  diasDeFaltaNaJanela(ausencia(dataUTC(2026, 10, 1), dataUTC(2026, 12, 31)), HOJE) === 31,
  "atravessa a janela inteira: 31 dias (27/10 a 26/11)",
);
ok(diasDeFaltaNaJanela(ausencia(dataUTC(2026, 11, 27), dataUTC(2026, 11, 28)), HOJE) === 0, "começa amanhã: 0");
ok(diasDeFaltaNaJanela(ausencia(dataUTC(2026, 10, 1), dataUTC(2026, 10, 26)), HOJE) === 0, "terminou antes da janela: 0");
ok(
  diasDeFaltaNaJanela(ausencia(dataUTC(2026, 11, 20), dataUTC(2026, 11, 30), 4), HOJE) === 4,
  "nunca mais que o `dias` gravado (11 corridos, 4 gravados)",
);
ok(
  diasDeFaltaNaJanela(
    { dataInicio: new Date("2026-11-25T03:00:00Z"), dataFim: new Date("2026-11-27T03:00:00Z"), dias: 3 },
    HOJE,
  ) === 2,
  "data gravada com hora cai no dia certo (25 e 26)",
);

console.log("3. Por setor (o que painel e CSV mostram)");
const linhas = absenteismoPorSetor(
  [
    { setorNome: "Comercial", abonada: false, ...ausencia(dataUTC(2026, 11, 24), dataUTC(2026, 12, 8)) }, // 3
    { setorNome: "Comercial", abonada: false, ...ausencia(dataUTC(2026, 10, 20), dataUTC(2026, 10, 31)) }, // 5
    { setorNome: "Comercial", abonada: true, ...ausencia(dataUTC(2026, 11, 2), dataUTC(2026, 11, 6)) }, // abonada
    { setorNome: "Técnico", abonada: false, ...ausencia(dataUTC(2026, 11, 27), dataUTC(2026, 11, 29)) }, // futura
  ],
  [
    { setor: "Comercial", total: 4 },
    { setor: "Técnico", total: 2 },
  ],
  HOJE,
  30,
  22,
);
const comercial = linhas.find((l) => l.setor === "Comercial")!;
ok(comercial.diasFalta === 8, "Comercial: 3 + 5 = 8 (antes: 15 + 0 = 15)");
ok(Math.abs(comercial.taxaPct - (8 / (4 * 22)) * 100) < 0.001, "taxa = 8 / (4 × 22)");
ok(linhas.find((l) => l.setor === "Técnico")!.diasFalta === 0, "Técnico: falta futura não conta");

console.log("4. A folha não mudou com a generalização");
const virada = ausencia(dataUTC(2026, 1, 28), dataUTC(2026, 2, 5));
ok(diasDaAusenciaNaCompetencia(virada, dataUTC(2026, 1, 1)) === 4, "28–31/01: 4 em janeiro");
ok(diasDaAusenciaNaCompetencia(virada, dataUTC(2026, 2, 1)) === 5, "01–05/02: 5 em fevereiro");
ok(
  diasDaAusenciaNoIntervalo(virada, dataUTC(2026, 2, 1), dataUTC(2026, 2, 28)) === 5,
  "o intervalo explícito dá o mesmo que a competência",
);
ok(diasDaAusenciaNoIntervalo(virada, dataUTC(2026, 2, 5), dataUTC(2026, 2, 1)) === 0, "intervalo invertido: 0");

console.log("5. Hoje é o dia de Brasília");
ok(
  hojeCalendarioBrasilia(new Date("2026-11-27T01:30:00Z")).getTime() === dataUTC(2026, 11, 26).getTime(),
  "22h30 de 26/11 em Brasília (já 27 em UTC) ainda é 26/11",
);
ok(
  hojeCalendarioBrasilia(new Date("2026-11-26T12:00:00Z")).getTime() === dataUTC(2026, 11, 26).getTime(),
  "meio-dia: o mesmo dia",
);

if (falhas > 0) {
  console.error(`\n${falhas} teste(s) falharam.`);
  process.exit(1);
}
console.log("\nTodos os testes passaram.");
