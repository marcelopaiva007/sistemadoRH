// Webhook do bot do Telegram (@Marcelo_Paiva_07_bot) — vínculo automático do
// telegramChatId dos colaboradores e porta de entrada do portal.
//
// Fluxo para o colaborador:
//   1. /start no bot -> o bot pede para tocar em "📱 Compartilhar meu número".
//   2. O contato chega aqui; casamos o número com Colaborador.telefone
//      (importado do elleven) pelos últimos 8 dígitos.
//   3. Match único -> grava telegramChatId. Sem match/ambíguo -> pede o CPF,
//      que casa com Colaborador.cpf.
//   4. /portal -> manda para AQUELE chat um link de vida curta e uso único do
//      portal do colaborador. É o bot fazendo o papel de login: para entrar é
//      preciso controlar o Telegram já vinculado àquela pessoa.
//
// Segurança: o setWebhook registra um secret_token derivado do token do bot
// (lib/telegram.ts); o Telegram devolve esse valor em cada update no header
// x-telegram-bot-api-secret-token, e recusamos qualquer chamada sem ele.
// Sempre respondemos 200 para updates entendidos ou não — o Telegram reenvia
// updates com resposta != 2xx e isso viraria fila infinita de retries.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage, telegramWebhookSecret } from "@/lib/telegram";
import { criarLinkDeAcesso, MINUTOS_VALIDADE_LINK } from "@/lib/portal-auth";

export const runtime = "nodejs";

type TelegramUpdate = {
  message?: {
    chat?: { id?: number | string };
    from?: { id?: number | string; first_name?: string };
    text?: string;
    contact?: { phone_number?: string; user_id?: number | string };
  };
};

const TECLADO_CONTATO = {
  keyboard: [[{ text: "📱 Compartilhar meu número", request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};
const REMOVER_TECLADO = { remove_keyboard: true };

const MSG_BOAS_VINDAS =
  "Olá! Aqui é o RH da LM Telecom. 👋\n\n" +
  "Para vincular seu Telegram ao sistema de RH (e receber as pesquisas por aqui), " +
  "toque no botão \"📱 Compartilhar meu número\" abaixo.\n\n" +
  "Se o botão não aparecer, envie seu CPF (somente números).";
const MSG_PORTAL_SEM_VINCULO =
  "Antes de abrir o portal preciso saber quem é você. 🙂\n\n" +
  "Envie /start e toque em \"📱 Compartilhar meu número\".";
const MSG_PORTAL_LINK_RECENTE =
  "Acabei de te mandar um link aqui em cima — use aquele. ⬆️\n\n" +
  "Se ele já não valer mais, peça /portal de novo daqui a pouco.";
const MSG_PORTAL_INDISPONIVEL =
  "O portal está indisponível no momento. Procure o RH. 🙏";
const MSG_PEDIR_CPF =
  "Não encontrei seu número no cadastro. 🤔\n\n" +
  "Envie seu CPF (somente números) para eu localizar você.";
const MSG_CPF_NAO_ENCONTRADO =
  "CPF não encontrado no cadastro de colaboradores. Confira os números ou procure o RH.";
const MSG_JA_VINCULADO_OUTRO =
  "Este Telegram já está vinculado a outro colaborador. Procure o RH para ajustar.";

function digitos(s: string): string {
  return (s || "").replace(/\D/g, "");
}

// Últimos 8 dígitos: parte "local" do número BR, estável entre formatos com/sem
// +55, DDD e o nono dígito.
function sufixoTelefone(s: string): string {
  return digitos(s).slice(-8);
}

async function vincular(
  chatId: string,
  colaborador: { id: string; nome: string; telegramChatId: string | null }
): Promise<void> {
  const jaDono = await prisma.colaborador.findFirst({
    where: { telegramChatId: chatId, NOT: { id: colaborador.id } },
    select: { id: true },
  });
  if (jaDono) {
    await sendTelegramMessage(chatId, MSG_JA_VINCULADO_OUTRO, REMOVER_TECLADO);
    return;
  }
  if (colaborador.telegramChatId === chatId) {
    await sendTelegramMessage(
      chatId,
      `Você já está vinculado, ${colaborador.nome.split(" ")[0]}! ✅`,
      REMOVER_TECLADO
    );
    return;
  }
  await prisma.colaborador.update({
    where: { id: colaborador.id },
    data: { telegramChatId: chatId },
  });
  await sendTelegramMessage(
    chatId,
    `Pronto, ${colaborador.nome.split(" ")[0]}! ✅\n\n` +
      "Seu Telegram foi vinculado ao RH da LM Telecom. " +
      "As pesquisas e comunicados chegarão por aqui.\n\n" +
      "Envie /portal quando quiser consultar suas férias, seus dados e seus documentos.",
    REMOVER_TECLADO
  );
}

// Manda o link do portal para o chat que pediu — e só para ele. Nunca revela se
// o chat está vinculado a alguém: quem não tem vínculo recebe a instrução de
// fazer o /start, sem confirmar ou negar cadastro.
async function enviarLinkDoPortal(chatId: string): Promise<void> {
  const colaborador = await prisma.colaborador.findFirst({
    where: { telegramChatId: chatId, ativo: true },
    select: { id: true, nome: true },
  });
  if (!colaborador) {
    await sendTelegramMessage(chatId, MSG_PORTAL_SEM_VINCULO, TECLADO_CONTATO);
    return;
  }

  const link = await criarLinkDeAcesso(colaborador.id, "TELEGRAM");
  if (!link.ok) {
    await sendTelegramMessage(
      chatId,
      link.motivo === "link_recente" ? MSG_PORTAL_LINK_RECENTE : MSG_PORTAL_INDISPONIVEL,
    );
    return;
  }

  await sendTelegramMessage(
    chatId,
    `Oi, ${colaborador.nome.split(" ")[0]}! Aqui está seu acesso ao portal: 🔐\n\n` +
      `${link.url}\n\n` +
      `O link vale ${MINUTOS_VALIDADE_LINK} minutos e abre uma vez só. ` +
      "Não repasse para ninguém — ele dá acesso aos seus dados. " +
      "Precisando de outro, é só enviar /portal.",
  );
}

export async function POST(req: NextRequest) {
  const secret = telegramWebhookSecret();
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const message = update.message;
  const chatIdRaw = message?.chat?.id;
  if (!message || chatIdRaw === undefined) return NextResponse.json({ ok: true });
  const chatId = String(chatIdRaw);

  try {
    // 1) Contato compartilhado -> casa pelo telefone.
    if (message.contact?.phone_number) {
      const donoDoContato = message.contact.user_id;
      const remetente = message.from?.id;
      if (donoDoContato !== undefined && remetente !== undefined && String(donoDoContato) !== String(remetente)) {
        await sendTelegramMessage(
          chatId,
          "Esse contato não é o seu. Toque no botão para compartilhar o SEU número. 🙂",
          TECLADO_CONTATO
        );
        return NextResponse.json({ ok: true });
      }
      const sufixo = sufixoTelefone(message.contact.phone_number);
      if (sufixo.length === 8) {
        const colaboradores = await prisma.colaborador.findMany({
          where: { ativo: true, telefone: { not: null } },
          select: { id: true, nome: true, telefone: true, telegramChatId: true },
        });
        const matches = colaboradores.filter((c) => sufixoTelefone(c.telefone!) === sufixo);
        if (matches.length === 1) {
          await vincular(chatId, matches[0]);
          return NextResponse.json({ ok: true });
        }
      }
      await sendTelegramMessage(chatId, MSG_PEDIR_CPF);
      return NextResponse.json({ ok: true });
    }

    const texto = (message.text || "").trim();

    // 2) /portal -> link de acesso ao portal do colaborador.
    if (texto.startsWith("/portal")) {
      await enviarLinkDoPortal(chatId);
      return NextResponse.json({ ok: true });
    }

    // 3) /start -> boas-vindas com o botão de contato.
    if (texto.startsWith("/start")) {
      await sendTelegramMessage(chatId, MSG_BOAS_VINDAS, TECLADO_CONTATO);
      return NextResponse.json({ ok: true });
    }

    // 4) CPF digitado.
    const cpf = digitos(texto);
    if (cpf.length === 11) {
      const colaborador = await prisma.colaborador.findFirst({
        where: { cpf, ativo: true },
        select: { id: true, nome: true, telegramChatId: true },
      });
      if (colaborador) {
        await vincular(chatId, colaborador);
      } else {
        await sendTelegramMessage(chatId, MSG_CPF_NAO_ENCONTRADO);
      }
      return NextResponse.json({ ok: true });
    }

    // 5) Qualquer outra coisa -> instruções.
    await sendTelegramMessage(chatId, MSG_BOAS_VINDAS, TECLADO_CONTATO);
  } catch (e) {
    // Nunca propaga erro como 5xx (o Telegram ficaria reenviando o update);
    // o log da Vercel é o lugar de investigar.
    console.error("telegram-webhook:", e);
  }
  return NextResponse.json({ ok: true });
}

// Health check simples (sem dados): GET /api/telegram/webhook
export async function GET() {
  return NextResponse.json({ ok: true, service: "telegram-webhook" });
}
