import {
  deveCobrarContracheque,
  diasCorridosDecorridos,
  montarMensagemLembreteTelegram,
} from "../lib/contracheques/lembretes";

async function test() {
  console.log("1. Testando cálculo de dias corridos no fuso de Brasília:");
  const envio = new Date("2026-11-01T12:00:00Z");
  const agoraDia0 = new Date("2026-11-01T18:00:00Z");
  const agoraDia2 = new Date("2026-11-03T12:00:00Z");
  const agoraDia3 = new Date("2026-11-04T12:00:00Z");
  const agoraDia4 = new Date("2026-11-05T12:00:00Z");
  const agoraDia5 = new Date("2026-11-06T12:00:00Z");
  const agoraDia6 = new Date("2026-11-07T12:00:00Z");

  if (diasCorridosDecorridos(envio, agoraDia0) !== 0) throw new Error("Mesmo dia deve ser 0");
  if (diasCorridosDecorridos(envio, agoraDia2) !== 2) throw new Error("Esperado 2 dias decorridos");
  if (diasCorridosDecorridos(envio, agoraDia4) !== 4) throw new Error("Esperado 4 dias decorridos");
  if (diasCorridosDecorridos(envio, agoraDia5) !== 5) throw new Error("Esperado 5 dias decorridos");
  console.log("  ✓ Cálculo de dias corridos aprovado");

  console.log("\n2. Testando regra de cobrança automática nos dias 2, 4 e 5:");
  // Dia 0 e 1: não cobra
  if (deveCobrarContracheque(envio, agoraDia0, 0).cobrar) throw new Error("Não deve cobrar no dia 0");

  // Dia 2: cobra (1º lembrete)
  const c2 = deveCobrarContracheque(envio, agoraDia2, 0);
  if (!c2.cobrar) throw new Error("Deve cobrar no dia 2");
  if (deveCobrarContracheque(envio, agoraDia2, 1).cobrar) throw new Error("Não deve repetir cobrança do dia 2");

  // Dia 3: não cobra
  if (deveCobrarContracheque(envio, agoraDia3, 1).cobrar) throw new Error("Não deve cobrar no dia 3");

  // Dia 4: cobra (2º lembrete)
  const c4 = deveCobrarContracheque(envio, agoraDia4, 1);
  if (!c4.cobrar) throw new Error("Deve cobrar no dia 4");

  // Dia 5: cobra (3º lembrete - último dia)
  const c5 = deveCobrarContracheque(envio, agoraDia5, 2);
  if (!c5.cobrar) throw new Error("Deve cobrar no dia 5");

  // Dia 6 (atrasado): não dispara lembrete automático diário infinito
  if (deveCobrarContracheque(envio, agoraDia6, 3).cobrar) throw new Error("Não deve cobrar automaticamente após o dia 5");
  console.log("  ✓ Régua dos dias 2, 4 e 5 validada rigorosamente");

  console.log("\n3. Testando texto de lembrete do Telegram:");
  const msg = montarMensagemLembreteTelegram("João", "11/2026", "LM Telecom", 1);
  if (!msg.includes("Lembrete:") || !msg.includes("11/2026") || !msg.includes("LM Telecom")) {
    throw new Error(`Texto de lembrete inválido: ${msg}`);
  }
  console.log("  ✓ Mensagem de lembrete aprovada");

  console.log("\nTodos os testes de lembretes cron passaram.");
}

test().catch((e) => {
  console.error("✗ Falha em test-contracheques-lembrete-cron:", e);
  process.exit(1);
});
