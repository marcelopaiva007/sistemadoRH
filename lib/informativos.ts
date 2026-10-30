// Informativos do RH — o comunicado que o RH escreve e manda para uma pessoa,
// um setor, um CNPJ ou a marca inteira (v1.181.0).
//
// Até aqui a única conversa com o colaborador era o "Fale com o RH", em que o
// RH só responde. Os canais já existiam (bot do Telegram, SMTP, portal); o que
// faltava era o RH poder começar.
//
// O texto vai INTEIRO no Telegram e no e-mail — é informativo, não documento:
// não há nada a proteger atrás de login. O botão "Li e estou ciente" do
// Telegram grava a ciência direto pelo webhook; quem recebeu por e-mail (ou
// não recebeu por canal nenhum) dá a ciência no portal.
//
// Só servidor (sem "server-only": o smoke roda isto direto).
import { prisma } from "@/lib/prisma";
import { answerCallbackQuery, removerBotoes, sendTelegramMessage } from "@/lib/telegram";
import { sendEmail } from "@/lib/email";
import { primeiroNome } from "@/lib/saudacao";
import { BOT_DO_RH } from "@/lib/convite-portal";

// O callback_data do botão. "i:" não colide com o "d:" das Delegações, e o
// Telegram limita a 64 bytes — "i:ok:" + cuid cabe com sobra.
const PREFIXO_CALLBACK = "i:ok:";

export function callbackCiente(destinatarioId: string): string {
  return `${PREFIXO_CALLBACK}${destinatarioId}`;
}

function escaparHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

type Avisado = {
  id: string;
  informativo: { titulo: string; mensagem: string };
  colaborador: {
    nome: string;
    telegramChatId: string | null;
    email: string | null;
    empresa: { marca: { nome: string } };
  };
};

/** Manda UM informativo para UMA pessoa. Devolve o canal usado ou o motivo de não ter ido. */
async function avisar(d: Avisado): Promise<{ canal: "TELEGRAM" | "EMAIL" | null; erro: string | null }> {
  const nome = primeiroNome(d.colaborador.nome);
  const saudacao = nome ? `Oi, ${nome}!` : "Olá!";
  const marca = d.colaborador.empresa.marca.nome;
  const { titulo, mensagem } = d.informativo;

  if (d.colaborador.telegramChatId) {
    const enviado = await sendTelegramMessage(
      d.colaborador.telegramChatId,
      `📢 ${titulo}\n\n${saudacao}\n\n${mensagem}\n\nRH — ${marca}`,
      { inline_keyboard: [[{ text: "✅ Li e estou ciente", callback_data: callbackCiente(d.id) }]] },
    );
    if (enviado.ok) return { canal: "TELEGRAM", erro: null };
    // Telegram falhou (bot bloqueado, chat apagado): tenta o e-mail.
    if (!d.colaborador.email) return { canal: null, erro: `Telegram: ${enviado.error}` };
  }

  if (d.colaborador.email) {
    const texto =
      `${saudacao}\n\n${mensagem}\n\n` +
      `Para confirmar que leu: no Telegram, abra ${BOT_DO_RH}, envie /portal e toque em "Li e estou ciente".\n\n` +
      `RH — ${marca}\n`;
    const paragrafos = escaparHtml(mensagem)
      .split(/\n{2,}/)
      .map(
        (p) =>
          `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3d454f;">${p.replace(/\n/g, "<br>")}</p>`,
      )
      .join("");
    const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;border:1px solid #e2e5e9;"><tr><td style="padding:30px 32px;">
<p style="margin:0 0 6px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#8a929c;">Informativo do RH</p>
<h1 style="margin:0 0 20px;font-size:20px;line-height:1.3;color:#15191e;">${escaparHtml(titulo)}</h1>
<p style="margin:0 0 16px;font-size:15px;color:#15191e;">${escaparHtml(saudacao)}</p>
${paragrafos}
<p style="margin:8px 0 0;font-size:13px;line-height:1.6;color:#5a636e;">Para confirmar que leu: no Telegram, abra <b>${BOT_DO_RH}</b>, envie <b>/portal</b> e toque em <b>Li e estou ciente</b>.</p>
<p style="margin:26px 0 0;padding-top:16px;border-top:1px solid #e9ecef;font-size:12px;color:#8a929c;">RH — ${escaparHtml(marca)}</p>
</td></tr></table></body></html>`;
    const enviado = await sendEmail({
      to: d.colaborador.email,
      subject: titulo,
      html,
      text: texto,
      fromName: `RH ${marca}`,
      // Dedupe pelo destinatário: o mesmo informativo nunca chega duas vezes
      // à mesma caixa no mesmo dia, nem com duplo clique em "Enviar".
      chave: `informativo:${d.id}`,
    });
    return enviado.ok ? { canal: "EMAIL", erro: null } : { canal: null, erro: `E-mail: ${enviado.error}` };
  }

  return { canal: null, erro: "Sem Telegram vinculado nem e-mail cadastrado — verá só no portal." };
}

// Quatro envios ao mesmo tempo: rápido o bastante para uma marca inteira caber
// no maxDuration da tela, e longe do teto de ~30 mensagens/s do Telegram.
const SIMULTANEOS = 4;

/**
 * Manda o aviso a cada destinatário já criado do informativo e grava o
 * resultado linha a linha. Quem chama já resolveu o público dentro do escopo
 * do usuário.
 */
export async function dispararInformativo(
  informativoId: string,
): Promise<{ avisados: number; semCanal: number; falhas: number }> {
  const destinatarios = await prisma.informativoDestinatario.findMany({
    where: { informativoId, enviadoEm: null },
    select: {
      id: true,
      informativo: { select: { titulo: true, mensagem: true } },
      colaborador: {
        select: {
          nome: true,
          telegramChatId: true,
          email: true,
          empresa: { select: { marca: { select: { nome: true } } } },
        },
      },
    },
  });

  let avisados = 0;
  let semCanal = 0;
  let falhas = 0;
  // Cada um no seu try: uma falha (banco, rede) não pode parar o lote nem
  // deixar sem registro quem já foi avisado.
  for (let i = 0; i < destinatarios.length; i += SIMULTANEOS) {
    await Promise.all(
      destinatarios.slice(i, i + SIMULTANEOS).map(async (d) => {
        try {
          const aviso = await avisar(d);
          await prisma.informativoDestinatario.update({
            where: { id: d.id },
            data: { enviadoEm: new Date(), canal: aviso.canal, envioErro: aviso.erro },
          });
          if (aviso.canal) avisados++;
          else semCanal++;
        } catch (e) {
          console.error("[informativos] envio", d.id, e);
          falhas++;
        }
      }),
    );
  }
  return { avisados, semCanal, falhas };
}

/**
 * Toque no "Li e estou ciente" do Telegram. Devolve `tratado: false` quando o
 * callback não é de informativo — o webhook segue para as Delegações.
 *
 * O destinatário só é aceito se o chat do botão for o chat vinculado à ficha
 * dele: sem isto um `callback_data` forjado daria ciência em nome de outra
 * pessoa.
 */
export async function tratarCallbackInformativo(params: {
  callbackQueryId: string;
  chatId: string;
  messageId?: number;
  data: string;
}): Promise<{ tratado: boolean }> {
  if (!params.data.startsWith(PREFIXO_CALLBACK)) return { tratado: false };
  const destinatarioId = params.data.slice(PREFIXO_CALLBACK.length);

  const d = await prisma.informativoDestinatario.findUnique({
    where: { id: destinatarioId },
    select: { id: true, cienteEm: true, colaborador: { select: { telegramChatId: true } } },
  });
  if (!d || d.colaborador.telegramChatId !== params.chatId) {
    await answerCallbackQuery(params.callbackQueryId, "Informativo não encontrado.", true);
    return { tratado: true };
  }

  if (!d.cienteEm) {
    await prisma.informativoDestinatario.update({
      where: { id: d.id },
      data: { cienteEm: new Date(), cientePor: "TELEGRAM" },
    });
  }
  await answerCallbackQuery(params.callbackQueryId, "Obrigado! Ciência registrada.");
  if (params.messageId !== undefined) await removerBotoes(params.chatId, params.messageId);
  return { tratado: true };
}
