// Registra (ou inspeciona) o webhook do bot do Telegram apontando para o app
// do RH em produção. Rodar UMA vez após o deploy da rota, e novamente só se a
// URL do app mudar.
//
// ATENÇÃO: com webhook ativo, o getUpdates do bot deixa de funcionar (regra da
// própria API do Telegram) — o fluxo manual de "ler chat_id via getUpdates"
// passa a ser desnecessário, pois o webhook grava o vínculo sozinho.
//
// Uso: npx tsx scripts/configurar-telegram-webhook.ts [urlBase]
//      npx tsx scripts/configurar-telegram-webhook.ts --info   (só consulta)
//      npx tsx scripts/configurar-telegram-webhook.ts --off    (remove o webhook)
import "dotenv/config";
import { telegramWebhookSecret } from "@/lib/telegram";

const URL_PADRAO = "https://sistemado-rh-two.vercel.app";

async function api(metodo: string, body?: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN não configurado no .env");
  const res = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function main() {
  const arg = process.argv[2];

  if (arg === "--off") {
    console.log("Removendo webhook...");
    console.log(JSON.stringify(await api("deleteWebhook"), null, 2));
    return;
  }

  if (arg !== "--info") {
    const base = (arg || URL_PADRAO).replace(/\/$/, "");
    const url = `${base}/api/telegram/webhook`;
    const secret = telegramWebhookSecret();
    if (!secret) throw new Error("TELEGRAM_BOT_TOKEN não configurado no .env");
    console.log(`Registrando webhook: ${url}`);
    const resultado = await api("setWebhook", {
      url,
      secret_token: secret,
      allowed_updates: ["message"],
      drop_pending_updates: true,
    });
    console.log(JSON.stringify(resultado, null, 2));
  }

  console.log("getWebhookInfo:");
  const info = (await api("getWebhookInfo")) as { result?: Record<string, unknown> };
  console.log(JSON.stringify(info.result ?? info, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
