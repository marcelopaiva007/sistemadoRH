// Cliente fino da Bot API do Telegram. O token vem de TELEGRAM_BOT_TOKEN
// (.env) ou, na ausência dela, do que foi cadastrado pela tela de Canais de
// envio (lib/segredos.ts — mesmo mecanismo cifrado da chave da Anthropic).
// Nunca do config pessoal do Claude Code (~/.claude/telegram/config.json).
import { createHash } from "crypto";
import { CHAVE_TELEGRAM, segredo } from "@/lib/segredos";

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  replyMarkup?: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = await segredo(CHAVE_TELEGRAM);
  if (!token) {
    return { ok: false, error: "Bot do Telegram não configurado." };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        // O Telegram abre todo link que passa por aqui para montar o card de
        // preview — e o link do portal é de uso único, então esse acesso o
        // queimava antes de a pessoa tocar na tela. Todo link enviado pelo bot
        // hoje é de uso único; preview aqui não serve para nada e quebra tudo.
        link_preview_options: { is_disabled: true },
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    });
    const body = (await response.json()) as { ok: boolean; description?: string };
    if (!response.ok || !body.ok) {
      return { ok: false, error: body.description ?? `HTTP ${response.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Falha de rede ao enviar mensagem pelo Telegram." };
  }
}

// Segredo do webhook derivado do próprio token do bot: evita ter que cadastrar
// mais uma env var na Vercel. O Telegram devolve esse valor no header
// x-telegram-bot-api-secret-token de cada update.
//
// Assíncrona desde que o token passou a poder vir do banco (segredo() consulta
// o Postgres) — antes bastava ler process.env direto. Todo chamador precisa de
// await agora (ver app/api/telegram/webhook/route.ts e
// scripts/configurar-telegram-webhook.ts).
export async function telegramWebhookSecret(): Promise<string | null> {
  const token = await segredo(CHAVE_TELEGRAM);
  if (!token) return null;
  return createHash("sha256").update(`rh-telegram-webhook:${token}`).digest("hex").slice(0, 48);
}
