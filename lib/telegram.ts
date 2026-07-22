// Cliente fino da Bot API do Telegram. Usa o bot pessoal já existente
// (@Marcelo_Paiva_07_bot) — o token vive só em TELEGRAM_BOT_TOKEN (.env),
// nunca no config pessoal do Claude Code (~/.claude/telegram/config.json).
export async function sendTelegramMessage(
  chatId: string,
  text: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return { ok: false, error: "TELEGRAM_BOT_TOKEN não configurado." };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
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
