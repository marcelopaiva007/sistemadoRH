// Aviso ao colaborador de que o RH respondeu o "Fale com o RH" (26/11/2026).
//
// Até aqui a pessoa só descobria a resposta se entrasse no portal por conta
// própria — e quem pergunta pelo portal raramente volta para conferir. O aviso
// vai pelo canal que o sistema já usa com ela: Telegram se vinculado, senão o
// e-mail do cadastro.
//
// O texto NÃO leva a resposta: a conversa com o RH pode tratar de salário,
// saúde ou desligamento, e e-mail/Telegram ficam abertos em tela de celular,
// notificação na tela bloqueada e caixa compartilhada. O aviso só diz que há
// resposta e como abrir o portal (onde a leitura exige a sessão da pessoa).
//
// Módulo puro (sem banco): a decisão do canal e os textos são testados em
// scripts/test-aviso-resposta-portal.ts.
import { BOT_DO_RH } from "@/lib/bot-do-rh";
import { primeiroNome } from "@/lib/saudacao";

export type CanalAvisoResposta = "TELEGRAM" | "EMAIL";

/**
 * Por onde avisar. Telegram primeiro (é o canal do portal — o /portal sai de
 * lá), e-mail como reserva. Desligado não recebe: o portal recusa quem saiu,
 * então o aviso apontaria para uma porta fechada.
 */
export function canaisDoAvisoDeResposta(c: {
  ativo: boolean;
  telegramChatId: string | null;
  email: string | null;
}): CanalAvisoResposta[] {
  if (!c.ativo) return [];
  const canais: CanalAvisoResposta[] = [];
  if (c.telegramChatId?.trim()) canais.push("TELEGRAM");
  if (c.email?.trim()) canais.push("EMAIL");
  return canais;
}

function escaparHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Os textos do aviso. Recebe só nome e marca — nunca a mensagem ou a resposta. */
export function montarAvisoDeResposta(nome: string, marca: string): {
  telegram: string;
  assunto: string;
  texto: string;
  html: string;
} {
  const primeiro = primeiroNome(nome);
  const saudacao = primeiro ? `Oi, ${primeiro}!` : "Olá!";

  const telegram =
    `💬 ${saudacao} O RH respondeu a sua mensagem do "Fale com o RH".\n\n` +
    `Para ler, envie /portal aqui e abra a seção "Fale com o RH".\n\n` +
    `RH — ${marca}`;

  const assunto = "O RH respondeu a sua mensagem";
  const texto =
    `${saudacao}\n\n` +
    `O RH respondeu a mensagem que você enviou pelo "Fale com o RH" do portal.\n\n` +
    `Para ler: no Telegram, abra ${BOT_DO_RH}, envie /portal e abra a seção "Fale com o RH".\n\n` +
    `RH — ${marca}\n`;
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;border:1px solid #e2e5e9;"><tr><td style="padding:30px 32px;">
<p style="margin:0 0 16px;font-size:16px;color:#15191e;">${escaparHtml(saudacao)}</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3d454f;">O RH respondeu a mensagem que você enviou pelo <b>Fale com o RH</b> do portal.</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3d454f;">Para ler: no Telegram, abra <b>${BOT_DO_RH}</b>, envie <b>/portal</b> e abra a seção <b>Fale com o RH</b>.</p>
<p style="margin:26px 0 0;padding-top:16px;border-top:1px solid #e9ecef;font-size:12px;color:#8a929c;">RH — ${escaparHtml(marca)}</p>
</td></tr></table></body></html>`;

  return { telegram, assunto, texto, html };
}
