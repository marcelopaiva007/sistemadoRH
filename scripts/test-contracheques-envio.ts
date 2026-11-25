import {
  mascararEmail,
  montarAvisoTelegram,
  montarCorpoEmailContracheque,
  paraAvisoDeContracheque,
} from "../lib/contracheques/envio";

async function test() {
  console.log("1. Testando mascaramento de e-mail:");
  const m1 = mascararEmail("joao.silva@gmail.com");
  if (!m1.startsWith("j") || !m1.includes("***") || !m1.endsWith("@gmail.com")) {
    throw new Error(`Mascaramento inesperado: ${m1}`);
  }
  const m2 = mascararEmail(null);
  if (m2 !== "seu e-mail") throw new Error(`Esperado 'seu e-mail' para null, obtido: ${m2}`);
  console.log("  ✓ Mascaramento de e-mail aprovado:", m1);

  console.log("\n2. Testando template de e-mail inicial (sem anexo):");
  const link = "https://rh.assinelm.com.br/assinar/token-exemplo-seguro-12345";
  const email = montarCorpoEmailContracheque("João", "11/2026", "LM Telecom", link);
  if (email.subject !== "Seu contracheque de 11/2026 — LM Telecom") {
    throw new Error(`Assunto inesperado: ${email.subject}`);
  }
  if (!email.html.includes(link) || !email.html.includes("Abrir e assinar")) {
    throw new Error("HTML do e-mail deve conter o link e o botão 'Abrir e assinar'");
  }
  if (!email.text.includes(link)) {
    throw new Error("Texto do e-mail deve conter o link");
  }
  console.log("  ✓ Template de e-mail inicial aprovado");

  console.log("\n3. Testando aviso do Telegram com botão 'Estou ciente':");
  const tg = montarAvisoTelegram("João", "11/2026", "LM Telecom", m1, "11/11/2026", "recibo-abc-123");
  if (!tg.text.includes("Estou ciente") && !tg.text.includes("Abra e assine até 11/11/2026")) {
    throw new Error(`Texto do Telegram incompleto: ${tg.text}`);
  }
  const kb = tg.replyMarkup as { inline_keyboard: { text: string; callback_data: string }[][] };
  const botao = kb?.inline_keyboard?.[0]?.[0];
  if (!botao || botao.text !== "Estou ciente" || botao.callback_data !== "contracheque:ciente:recibo-abc-123") {
    throw new Error(`Botão do Telegram inválido: ${JSON.stringify(botao)}`);
  }
  console.log("  ✓ Template e botão inline do Telegram aprovados");

  // 26/11/2026: desligado entra no envio (contracheque da rescisão), mas só
  // por e-mail — o link /assinar/<token> não depende do portal nem do Telegram.
  console.log("\n4. Testando canais do aviso para desligado:");
  const ativo = paraAvisoDeContracheque({ ativo: true, telegramChatId: "123", email: "a@b.com" });
  if (ativo.telegramChatId !== "123" || ativo.email !== "a@b.com") {
    throw new Error("Ativo deve manter Telegram e e-mail");
  }
  const desligado = paraAvisoDeContracheque({ ativo: false, telegramChatId: "123", email: "a@b.com" });
  if (desligado.telegramChatId !== null || desligado.email !== "a@b.com") {
    throw new Error(`Desligado deve ficar só com e-mail: ${JSON.stringify(desligado)}`);
  }
  const desligadoSemEmail = paraAvisoDeContracheque({ ativo: false, telegramChatId: "123", email: null });
  if (desligadoSemEmail.telegramChatId !== null || desligadoSemEmail.email !== null) {
    throw new Error("Desligado sem e-mail fica sem canal");
  }
  console.log("  ✓ Desligado recebe só por e-mail");

  console.log("\nTodos os testes de envio passaram.");
}

test().catch((e) => {
  console.error("✗ Falha em test-contracheques-envio:", e);
  process.exit(1);
});
