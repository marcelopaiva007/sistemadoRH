// A prova do motor de licenciamento (lib/processos/licenciamento.ts): o mês
// deriva do final da placa pelo calendário DETRAN-PB 2026 (Portaria nº
// 590/2025/DS), o semáforo decide pelo registro do exercício e pela data
// limite, e nada é inventado quando falta placa válida ou tabela da UF/ano.
//
//   npx tsx scripts/test-processos-licenciamento.ts

import {
  DIAS_ALERTA_LICENCIAMENTO,
  finalDaPlaca,
  resumoLicenciamento,
  retratoLicenciamento,
  UF_ASSUMIDA_QUANDO_VAZIA,
  type VeiculoParaLicenciamento,
} from "../lib/processos/licenciamento";

let falhas = 0;
function igual<T>(recebido: T, esperado: T, descricao: string) {
  const passou = JSON.stringify(recebido) === JSON.stringify(esperado);
  console.log(`${passou ? "✅" : "❌"} ${descricao}`);
  if (!passou) {
    console.log(`     esperado: ${JSON.stringify(esperado)}`);
    console.log(`     recebido: ${JSON.stringify(recebido)}`);
    falhas++;
  }
}

const dia = (iso: string) => new Date(`${iso}T00:00:00Z`);

function veiculo(over: Partial<VeiculoParaLicenciamento>): VeiculoParaLicenciamento {
  return {
    placa: "ABC1234",
    emplacado: true,
    ufEmplacamento: "PB",
    registradoNoExercicio: false,
    ...over,
  };
}

console.log("\nFinal da placa — o último dígito, nas duas grafias\n");
{
  igual(finalDaPlaca("ABC1234"), 4, "placa antiga: ABC1234 termina em 4");
  igual(finalDaPlaca("ABC1D23"), 3, "Mercosul: ABC1D23 termina em 3");
  igual(finalDaPlaca("QFA0F60"), 0, "Mercosul com final 0");
  igual(finalDaPlaca("SEMPLACA01"), null, "placa provisória da importação não deriva final");
  igual(finalDaPlaca(""), null, "placa vazia não deriva final");
}

console.log("\nCalendário PB 2026 — Portaria 590/2025/DS, final → mês\n");
{
  // Final 1 abre o ano: 1ª parcela 30/01, limite 31/03.
  const f1 = retratoLicenciamento(veiculo({ placa: "ABC1231" }), 2026, dia("2026-01-05"));
  igual(f1.primeiraParcela?.toISOString().slice(0, 10), "2026-01-30", "final 1: 1ª parcela 30/01");
  igual(f1.dataLimite?.toISOString().slice(0, 10), "2026-03-31", "final 1: data limite 31/03");
  // Final 0 fecha: 1ª parcela 30/10, limite 30/12.
  const f0 = retratoLicenciamento(veiculo({ placa: "ABC1230" }), 2026, dia("2026-01-05"));
  igual(f0.primeiraParcela?.toISOString().slice(0, 10), "2026-10-30", "final 0: 1ª parcela 30/10");
  igual(f0.dataLimite?.toISOString().slice(0, 10), "2026-12-30", "final 0: data limite 30/12");
  // Mercosul deriva igual: ABC1D23 tem final 3 → limite 29/05.
  const f3 = retratoLicenciamento(veiculo({ placa: "ABC1D23" }), 2026, dia("2026-01-05"));
  igual(f3.dataLimite?.toISOString().slice(0, 10), "2026-05-29", "Mercosul final 3: limite 29/05");
}

console.log("\nSemáforo — o registro do exercício e a data limite decidem\n");
{
  const hoje = dia("2026-08-31"); // o limite do final 6 é exatamente hoje
  igual(
    retratoLicenciamento(veiculo({ placa: "ABC1236" }), 2026, hoje).status,
    "VENCE_EM_BREVE",
    "final 6 em 31/08: o limite é HOJE — vence em breve, ainda não vencido",
  );
  igual(
    retratoLicenciamento(veiculo({ placa: "ABC1235" }), 2026, hoje).status,
    "VENCIDO",
    "final 5 em 31/08: limite era 31/07 — vencido",
  );
  igual(
    retratoLicenciamento(veiculo({ placa: "ABC1230" }), 2026, hoje).status,
    "PENDENTE",
    "final 0 em 31/08: limite 30/12, longe — pendente",
  );
  igual(
    retratoLicenciamento(
      veiculo({ placa: "ABC1235", registradoNoExercicio: true }),
      2026,
      hoje,
    ).status,
    "EM_DIA",
    "registrado no exercício é EM DIA mesmo com a data limite no passado",
  );
  // A fronteira exata do 🟠: limite a exatos DIAS_ALERTA dias.
  const f9 = retratoLicenciamento(
    veiculo({ placa: "ABC1239" }),
    2026,
    dia("2026-10-31"), // 30 dias antes de 30/11
  );
  igual(f9.diasParaLimite, DIAS_ALERTA_LICENCIAMENTO, "final 9 em 31/10: faltam exatos 30 dias");
  igual(f9.status, "VENCE_EM_BREVE", "e 30 dias é a fronteira do vence em breve");
}

console.log("\nO que grita antes de tudo — não emplacado, e o que não se inventa\n");
{
  const hoje = dia("2026-08-31");
  igual(
    retratoLicenciamento(veiculo({ emplacado: false, registradoNoExercicio: true }), 2026, hoje)
      .status,
    "NAO_EMPLACADO",
    "não emplacado grita antes de tudo — até de um registro marcado",
  );
  igual(
    retratoLicenciamento(veiculo({ placa: "SEMPLACA01" }), 2026, hoje).status,
    "SEM_CALENDARIO",
    "placa provisória: sem calendário, nunca um mês chutado",
  );
  igual(
    retratoLicenciamento(veiculo({ ufEmplacamento: "SP" }), 2026, hoje).status,
    "SEM_CALENDARIO",
    "UF sem tabela publicada aqui (SP): sem calendário, nunca a tabela de outro estado",
  );
  igual(
    retratoLicenciamento(veiculo({}), 2027, hoje).status,
    "SEM_CALENDARIO",
    "exercício sem portaria colada (2027): sem calendário — o commit anual existe por isso",
  );
}

console.log("\nUF vazia — assumida como PB, com a suposição dita\n");
{
  const hoje = dia("2026-01-05");
  const r = retratoLicenciamento(veiculo({ ufEmplacamento: null, placa: "ABC1231" }), 2026, hoje);
  igual(r.ufEfetiva, UF_ASSUMIDA_QUANDO_VAZIA, "UF vazia usa a assumida (PB)");
  igual(r.ufAssumida, true, "e a tela fica sabendo que foi suposição");
  igual(r.status, "PENDENTE", "com a suposição, o calendário PB vale");
  const rPreenchida = retratoLicenciamento(veiculo({ ufEmplacamento: "pb " }), 2026, hoje);
  igual(rPreenchida.ufAssumida, false, "UF preenchida (mesmo 'pb ' com espaço) não é suposição");
  igual(rPreenchida.ufEfetiva, "PB", "e normaliza para maiúscula");
}

console.log('\nResumo — quando a gestão pode dizer "está tudo em dia"\n');
{
  const hoje = dia("2026-08-31");
  const emDia = retratoLicenciamento(
    veiculo({ placa: "ABC1235", registradoNoExercicio: true }),
    2026,
    hoje,
  );
  const vencido = retratoLicenciamento(veiculo({ placa: "ABC1235" }), 2026, hoje);
  const semCal = retratoLicenciamento(veiculo({ placa: "SEMPLACA01" }), 2026, hoje);

  igual(resumoLicenciamento([emDia, emDia]).tudoEmDia, true, "só EM_DIA: tudo em dia");
  igual(resumoLicenciamento([emDia, vencido]).tudoEmDia, false, "um vencido derruba a frase");
  igual(
    resumoLicenciamento([emDia, semCal]).tudoEmDia,
    true,
    "SEM_CALENDARIO não derruba — é ressalva à parte, não pendência afirmada",
  );
  igual(resumoLicenciamento([]).tudoEmDia, false, "frota vazia não afirma nada");
  const r = resumoLicenciamento([emDia, vencido, semCal]);
  igual(
    { total: r.total, emDia: r.emDia, vencidos: r.vencidos, semCalendario: r.semCalendario },
    { total: 3, emDia: 1, vencidos: 1, semCalendario: 1 },
    "as contagens batem uma a uma",
  );
}

console.log("");
if (falhas > 0) {
  console.log(`❌ ${falhas} falha(s).`);
  process.exit(1);
}
console.log("✅ Tudo passou.");
