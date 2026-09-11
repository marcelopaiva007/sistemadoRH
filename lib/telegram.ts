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

/**
 * Responde ao clique de um botão inline. O Telegram EXIGE esta chamada: sem
 * ela o botão fica com a ampulheta girando por ~30s no celular da pessoa,
 * mesmo que a ação já tenha acontecido do lado de cá.
 *
 * `texto` aparece como um aviso curto no topo da conversa (ou como alerta, se
 * `alerta`). Falha aqui é registrada e engolida: o clique já foi processado, e
 * derrubar a resposta ao webhook faria o Telegram reenviar o mesmo update —
 * ou seja, aplicar a ação duas vezes.
 */
export async function answerCallbackQuery(
  callbackQueryId: string,
  texto?: string,
  alerta = false,
): Promise<void> {
  const token = await segredo(CHAVE_TELEGRAM);
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        ...(texto ? { text: texto.slice(0, 200) } : {}),
        show_alert: alerta,
      }),
    });
  } catch {
    console.error("telegram: falha ao responder callback query");
  }
}

/**
 * Tira os botões de uma mensagem já enviada — usado depois que a pessoa
 * escolheu. Sem isto os botões continuam clicáveis para sempre, e um toque no
 * "✅ Aceito" de três semanas atrás viraria erro de estado na cara dela.
 *
 * Silencioso de propósito: se a mensagem foi apagada ou é antiga demais para
 * editar, não há o que fazer nem o que contar a ninguém.
 */
export async function removerBotoes(chatId: string, messageId: number): Promise<void> {
  const token = await segredo(CHAVE_TELEGRAM);
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }),
    });
  } catch {
    /* mensagem antiga ou apagada: não há o que consertar */
  }
}

// ---------------------------------------------------------------------------
// Registro do webhook — o que o Telegram ENTREGA a este app.
//
// Em 11/09/2026 o "✅ Aceito" das Delegações não fazia nada para ninguém: a
// demanda da Angela (enviada em 31/08) seguia ENVIADA, sem um único evento de
// aceite, com o vínculo do Telegram dela correto e o código do webhook
// tratando `callback_query` desde 29/08. O toque simplesmente NUNCA CHEGAVA:
// o script que registrou o webhook pedia ao Telegram `allowed_updates:
// ["message"]`, e o Telegram obedece à risca — botão inline é outro tipo de
// update (`callback_query`) e era descartado na origem, sem erro em lugar
// nenhum. Sete demandas paradas em ENVIADA pela mesma razão.
//
// Duas lições que viraram código: (1) a lista de tipos vive AQUI, num lugar
// só, e quem registra o webhook (tela ou script) usa esta constante; (2) a
// tela de Canais de envio mostra o que o Telegram tem registrado, para a
// próxima diferença entre "o código trata" e "o Telegram entrega" aparecer
// numa tela, e não num print de celular dias depois.
// ---------------------------------------------------------------------------

/** Tipos de update que o webhook (app/api/telegram/webhook) sabe tratar. */
export const UPDATES_DO_WEBHOOK = ["message", "callback_query"] as const;

export type InfoWebhookTelegram = {
  /** URL registrada no Telegram — vazia quando não há webhook. */
  url: string;
  /** Lista pedida no registro. `null` = o Telegram usa o conjunto padrão dele, que inclui botões. */
  allowedUpdates: string[] | null;
  /** Se os toques em botão inline (`callback_query`) chegam a este app. */
  recebeBotoes: boolean;
  pendentes: number;
  ultimoErro: string | null;
  ultimoErroEm: Date | null;
};

function lerInfo(result: {
  url?: string;
  allowed_updates?: string[];
  pending_update_count?: number;
  last_error_message?: string;
  last_error_date?: number;
}): InfoWebhookTelegram {
  const allowed = result.allowed_updates ?? null;
  return {
    url: result.url ?? "",
    allowedUpdates: allowed,
    // Sem lista explícita o Telegram manda o conjunto padrão, que inclui
    // callback_query. Com lista, só o que está nela.
    recebeBotoes: allowed === null || allowed.includes("callback_query"),
    pendentes: result.pending_update_count ?? 0,
    ultimoErro: result.last_error_message ?? null,
    ultimoErroEm: result.last_error_date ? new Date(result.last_error_date * 1000) : null,
  };
}

/** O que o Telegram tem registrado para este bot. `null` sem token ou sem rede. */
export async function infoWebhookTelegram(): Promise<InfoWebhookTelegram | null> {
  const token = await segredo(CHAVE_TELEGRAM);
  if (!token) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, { cache: "no-store" });
    const body = (await res.json()) as { ok: boolean; result?: Parameters<typeof lerInfo>[0] };
    if (!body.ok || !body.result) return null;
    return lerInfo(body.result);
  } catch {
    return null;
  }
}

/**
 * Registra (ou re-registra) o webhook apontando para `urlBase`, com o secret
 * derivado do token e TODOS os tipos de update que o app trata. Idempotente:
 * chamar de novo com os mesmos dados não muda nada e não perde update.
 *
 * `descartarPendentes` só no script de linha de comando, que é usado ao
 * trocar de ambiente; pela tela nunca se joga fora o que está na fila.
 */
export async function registrarWebhookTelegram(
  urlBase: string,
  opcoes: { descartarPendentes?: boolean } = {},
): Promise<{ ok: true; url: string; info: InfoWebhookTelegram | null } | { ok: false; error: string }> {
  const token = await segredo(CHAVE_TELEGRAM);
  const secret = await telegramWebhookSecret();
  if (!token || !secret) return { ok: false, error: "Bot do Telegram não configurado." };

  const base = urlBase.trim().replace(/\/$/, "");
  if (!/^https:\/\//.test(base)) {
    return { ok: false, error: "A URL do sistema precisa começar com https:// — o Telegram recusa outra coisa." };
  }
  const url = `${base}/api/telegram/webhook`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        secret_token: secret,
        allowed_updates: [...UPDATES_DO_WEBHOOK],
        drop_pending_updates: opcoes.descartarPendentes === true,
      }),
    });
    const body = (await res.json()) as { ok: boolean; description?: string };
    if (!res.ok || !body.ok) {
      return { ok: false, error: `O Telegram recusou o registro: ${body.description ?? `HTTP ${res.status}`}.` };
    }
  } catch {
    return { ok: false, error: "Falha de rede ao registrar o webhook no Telegram." };
  }

  return { ok: true, url, info: await infoWebhookTelegram() };
}
