// Tratamento de ciência e 2FA do contracheque via Telegram bot.
//
// 1. Parse e processamento do toque no botão inline "Estou ciente".
// 2. Edição da mensagem para carimbar a data/hora e retirar o botão.
// 3. Envio do código de 6 dígitos para autenticação na página de assinatura.

import { prisma } from "@/lib/prisma";
import { answerCallbackQuery, editarMensagemTexto, sendTelegramMessage } from "@/lib/telegram";

export const PREFIXO_CALLBACK_CIENCIA = "contracheque:ciente:";

/** Extrai o reciboId de um callback_data "contracheque:ciente:<reciboId>". */
export function parseCallbackCienciaContracheque(data: string): string | null {
  if (!data.startsWith(PREFIXO_CALLBACK_CIENCIA)) return null;
  const id = data.slice(PREFIXO_CALLBACK_CIENCIA.length).trim();
  return id.length > 0 ? id : null;
}

/** Formata data e hora no fuso de Brasília para a mensagem editada do chat. */
function formatarCienciaChat(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Adiciona o carimbo de ciência à mensagem original e instrui a abrir o e-mail. */
export function montarMensagemCienciaConfirmada(textoOriginal: string, dataHora = new Date()): string {
  const dataHoraTxt = formatarCienciaChat(dataHora);
  // Remove instrução de toque anterior se presente
  const limpo = textoOriginal
    .replace(/Toque no botão abaixo para confirmar que recebeu este aviso\.\n\n?/g, "")
    .trim();

  return `${limpo}\n\n✅ Ciência confirmada em ${dataHoraTxt}. Lembre-se de abrir seu e-mail para assinar.`;
}

/**
 * Processa o clique no botão "Estou ciente":
 * 1. Confere se o recibo existe e se o chat confere com o colaborador.
 * 2. Atualiza `cienciaTelegramEm` no banco.
 * 3. Notifica o Telegram e edita a mensagem removendo o botão inline.
 */
export async function tratarCallbackCienciaContracheque(
  reciboId: string,
  chatId: string,
  messageId?: number,
  callbackId?: string,
  textoOriginal?: string
): Promise<boolean> {
  const recibo = await prisma.reciboContracheque.findUnique({
    where: { id: reciboId },
    select: {
      id: true,
      colaborador: { select: { telegramChatId: true } },
    },
  });

  if (!recibo || String(recibo.colaborador.telegramChatId) !== String(chatId)) {
    if (callbackId) await answerCallbackQuery(callbackId, "Aviso não localizado ou não pertence a este usuário.", true);
    return false;
  }

  const agora = new Date();
  await prisma.reciboContracheque.update({
    where: { id: recibo.id },
    data: { cienciaTelegramEm: agora },
  });

  if (callbackId) {
    await answerCallbackQuery(callbackId, "Ciência confirmada! Lembre-se de abrir o e-mail para assinar.");
  }

  if (messageId && textoOriginal) {
    const novoTexto = montarMensagemCienciaConfirmada(textoOriginal, agora);
    await editarMensagemTexto(chatId, messageId, novoTexto);
  }

  return true;
}

/** Envia o código de verificação 2FA (6 dígitos) via bot do Telegram. */
export async function enviarCodigo2faTelegram(
  chatId: string,
  codigo: string,
  competenciaRotulo: string
): Promise<{ ok: boolean; error?: string }> {
  const texto =
    `Seu código de confirmação para abrir o contracheque de ${competenciaRotulo} é:\n\n` +
    `*${codigo}*\n\n` +
    `Ele é válido por 10 minutos. Se você não solicitou este código, avise o RH imediatamente.`;

  return sendTelegramMessage(chatId, texto);
}
