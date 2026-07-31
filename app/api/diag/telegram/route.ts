// Diagnóstico do bot do Telegram em produção — TEMPORÁRIO.
//
// O painel da Vercel não mostra o valor de TELEGRAM_BOT_TOKEN (é sensível) e o
// .env local aponta para um bot pessoal, não para o @contato_LM que o RH usa.
// Como chatId é específico de cada bot, o bot errado em produção significa que
// ninguém recebe — e isso não aparece como erro, some calado.
//
// getMe só identifica o bot; não envia mensagem para ninguém.
//
//   GET /api/diag/telegram?secret=...
//
// REMOVER assim que o bot estiver confirmado.
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function autorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  return req.nextUrl.searchParams.get("secret") === secret;
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ configurado: false, erro: "TELEGRAM_BOT_TOKEN ausente" });
  }

  // O id do bot é o trecho antes dos dois-pontos e não é segredo; o resto do
  // token é, e não sai daqui.
  const botId = token.split(":")[0];

  try {
    const [me, webhook] = await Promise.all([
      fetch(`https://api.telegram.org/bot${token}/getMe`).then((r) => r.json()),
      fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`).then((r) => r.json()),
    ]);

    return NextResponse.json({
      configurado: true,
      botId,
      username: me?.ok ? me.result.username : null,
      nome: me?.ok ? me.result.first_name : null,
      erroTelegram: me?.ok ? null : me?.description ?? "resposta inesperada",
      webhook: webhook?.ok ? webhook.result.url || "(nenhum)" : null,
      webhookPendentes: webhook?.ok ? webhook.result.pending_update_count ?? 0 : null,
      webhookUltimoErro: webhook?.ok ? webhook.result.last_error_message ?? null : null,
    });
  } catch (e) {
    return NextResponse.json({
      configurado: true,
      botId,
      erro: e instanceof Error ? e.message : String(e),
    });
  }
}
