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
import { registrarWebhookTelegram } from "@/lib/telegram";
import { CHAVE_TELEGRAM, segredo } from "@/lib/segredos";

const URL_PADRAO = "https://sistemado-rh-two.vercel.app";

async function api(metodo: string, body?: Record<string, unknown>) {
  // Cai para o banco se não houver TELEGRAM_BOT_TOKEN no .env local — o token
  // real pode estar cadastrado só pela tela de Canais de envio, e este script
  // roda com o mesmo DATABASE_URL do ambiente que se está inspecionando.
  const token = await segredo(CHAVE_TELEGRAM);
  if (!token) throw new Error("Token do Telegram não configurado (nem no .env, nem pela tela de Canais de envio)");
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
    console.log(`Registrando webhook: ${base}/api/telegram/webhook`);
    // A lista de tipos de update vem de lib/telegram.ts (UPDATES_DO_WEBHOOK),
    // não daqui: até 11/09/2026 este script pedia só ["message"], e os botões
    // inline das Delegações nunca chegaram ao app. A tela de Canais de envio
    // faz o mesmo registro por um botão — este script segue útil para trocar
    // de ambiente (previews, máquina local com túnel).
    const resultado = await registrarWebhookTelegram(base, { descartarPendentes: true });
    if (!resultado.ok) throw new Error(resultado.error);
    console.log(`OK: ${resultado.url}`);
  }

  console.log("getWebhookInfo:");
  const info = (await api("getWebhookInfo")) as { result?: Record<string, unknown> };
  console.log(JSON.stringify(info.result ?? info, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
