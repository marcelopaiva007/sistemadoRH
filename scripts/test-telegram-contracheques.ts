import {
  enviarCodigo2faTelegram,
  montarMensagemCienciaConfirmada,
  parseCallbackCienciaContracheque,
} from "../lib/contracheques/telegram-ciencia";

async function test() {
  console.log("1. Testando parse do callback data:");
  const id1 = parseCallbackCienciaContracheque("contracheque:ciente:recibo-123");
  if (id1 !== "recibo-123") throw new Error(`Esperado 'recibo-123', obtido: ${id1}`);

  const id2 = parseCallbackCienciaContracheque("portal:abrir");
  if (id2 !== null) throw new Error("Callback de outro tipo deve retornar null");
  console.log("  ✓ Parse de callback data aprovado");

  console.log("\n2. Testando montagem da mensagem com carimbo de ciência:");
  const textoOriginal = "Oi, João! Seu contracheque de 11/2026 foi enviado para o seu e-mail j***@gmail.com. Abra e assine até 11/11/2026. 📄\n\nRH — LM Telecom";
  const data = new Date("2026-11-06T15:45:00Z");
  const editada = montarMensagemCienciaConfirmada(textoOriginal, data);
  if (!editada.includes("Ciência confirmada em 06/11 às 12:45") && !editada.includes("Ciência confirmada")) {
    throw new Error(`Texto editado não contém carimbo esperado: ${editada}`);
  }
  if (!editada.includes("Lembre-se de abrir seu e-mail para assinar.")) {
    throw new Error("Texto editado deve conter aviso para abrir e-mail");
  }
  console.log("  ✓ Mensagem editada com carimbo aprovada");

  console.log("\n3. Testando função de envio de código 2FA:");
  if (typeof enviarCodigo2faTelegram !== "function") {
    throw new Error("enviarCodigo2faTelegram deve ser função");
  }
  console.log("  ✓ Função enviarCodigo2faTelegram declarada");

  console.log("\nTodos os testes de telegram-contracheques passaram.");
}

test().catch((e) => {
  console.error("✗ Falha em test-telegram-contracheques:", e);
  process.exit(1);
});
