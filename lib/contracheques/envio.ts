// Envio de contracheques — o aviso ao colaborador.
//
// O aviso NÃO leva o contracheque nem um link de acesso: o link do portal é de
// uso único e vale 15 minutos (lib/portal-auth.ts), e mensagem de aviso é lida
// horas depois. No Telegram vai um botão "Ver e confirmar" que gera o link NA
// HORA do toque (callback CALLBACK_ABRIR_PORTAL no webhook do bot). Quem não
// tem Telegram recebe e-mail explicando o caminho.
//
// Só servidor (sem "server-only": o smoke roda isto direto).
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { sendEmail } from "@/lib/email";
import { BOT_DO_RH } from "@/lib/bot-do-rh";
import { CALLBACK_ABRIR_PORTAL, rotuloDoContracheque, tipoFolhaDaChave } from "./situacao";

type Avisado = {
  id: string;
  competencia: Date;
  tipoFolha: string;
  colaborador: { nome: string; telegramChatId: string | null; email: string | null; empresa: { marca: { nome: string } } };
};

function primeiroNome(nome: string): string {
  return (nome.split(" ")[0] ?? "").toLowerCase().replace(/^\p{L}/u, (c) => c.toUpperCase());
}

/** Manda o aviso de UM contracheque. Devolve o canal usado ou o motivo de não ter avisado. */
export async function avisarColaborador(r: Avisado): Promise<{ canal: "TELEGRAM" | "EMAIL" | null; erro: string | null }> {
  const nome = primeiroNome(r.colaborador.nome);
  const ref = rotuloDoContracheque(r.competencia, r.tipoFolha);
  const marca = r.colaborador.empresa.marca.nome;

  if (r.colaborador.telegramChatId) {
    const enviado = await sendTelegramMessage(
      r.colaborador.telegramChatId,
      `Oi, ${nome}! Seu contracheque de ${ref} chegou. 📄\n\n` +
        "Toque no botão abaixo para ver e confirmar o recebimento. A confirmação é com uma foto sua, " +
        'como na batida de ponto — é o seu "recebi" assinado.\n\n' +
        `RH — ${marca}`,
      { inline_keyboard: [[{ text: "Ver e confirmar", callback_data: CALLBACK_ABRIR_PORTAL }]] },
    );
    if (enviado.ok) return { canal: "TELEGRAM", erro: null };
    // Telegram falhou (bot bloqueado, chat apagado): tenta o e-mail.
    if (!r.colaborador.email) return { canal: null, erro: `Telegram: ${enviado.error}` };
  }

  if (r.colaborador.email) {
    const texto =
      `Oi, ${nome}!\n\n` +
      `Seu contracheque de ${ref} está disponível no portal do colaborador.\n\n` +
      `Para ver e confirmar o recebimento: no Telegram, abra ${BOT_DO_RH} e envie /portal. ` +
      "A confirmação é com uma foto sua, como na batida de ponto.\n\n" +
      "Ainda não ativou o Telegram do RH? Procure o bot, toque em Iniciar e compartilhe seu número.\n\n" +
      `RH — ${marca}\n`;
    const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;border:1px solid #e2e5e9;"><tr><td style="padding:30px 32px;">
<p style="margin:0 0 18px;font-size:16px;color:#15191e;">Oi, ${nome}!</p>
<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#3d454f;">Seu <b>contracheque de ${ref}</b> está disponível no portal do colaborador.</p>
<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#3d454f;">Para ver e confirmar o recebimento: no Telegram, abra <b>${BOT_DO_RH}</b> e envie <b>/portal</b>. A confirmação é com uma foto sua, como na batida de ponto.</p>
<p style="margin:0;font-size:14px;line-height:1.6;color:#5a636e;">Ainda não ativou o Telegram do RH? Procure o bot, toque em <b>Iniciar</b> e compartilhe seu número.</p>
<p style="margin:26px 0 0;padding-top:16px;border-top:1px solid #e9ecef;font-size:12px;color:#8a929c;">RH — ${marca}</p>
</td></tr></table></body></html>`;
    const enviado = await sendEmail({
      to: r.colaborador.email,
      subject: `Seu contracheque de ${ref} chegou`,
      html,
      text: texto,
      fromName: `RH ${marca}`,
      // Sem chave de dedupe: o reenvio pela tela é justamente o objetivo.
    });
    return enviado.ok ? { canal: "EMAIL", erro: null } : { canal: null, erro: `E-mail: ${enviado.error}` };
  }

  return { canal: null, erro: "A pessoa não tem Telegram vinculado nem e-mail cadastrado." };
}

/**
 * Cria (se preciso) o recibo de cada contracheque e manda o aviso. Quem chama
 * já conferiu o acesso do usuário a cada documento. Já confirmado não recebe
 * aviso de novo.
 */
export async function enviarContracheques(
  documentoIds: string[],
  usuario: { nome: string | null },
): Promise<{
  avisados: number;
  semCanal: number;
  jaConfirmados: number;
  falhas: number;
  porEmpresa: Record<string, { avisados: number; semCanal: number }>;
}> {
  const docs = await prisma.documentoColaborador.findMany({
    where: { id: { in: documentoIds }, tipo: "CONTRACHEQUE", competencia: { not: null }, arquivoId: { not: null } },
    select: { id: true, empresaId: true, colaboradorId: true, competencia: true, chaveDedupe: true },
  });
  let avisados = 0;
  let semCanal = 0;
  let jaConfirmados = 0;
  let falhas = 0;
  const porEmpresa: Record<string, { avisados: number; semCanal: number }> = {};
  // Um por vez e cada um no seu try: uma falha (banco, duas pessoas enviando
  // juntas) não pode parar o lote nem deixar sem registro quem já foi avisado.
  for (const d of docs) {
    try {
      const recibo = await prisma.reciboContracheque.upsert({
        where: { documentoId: d.id },
        update: {},
        create: {
          documentoId: d.id,
          empresaId: d.empresaId,
          colaboradorId: d.colaboradorId,
          competencia: d.competencia!,
          tipoFolha: tipoFolhaDaChave(d.chaveDedupe),
        },
        select: {
          id: true,
          competencia: true,
          tipoFolha: true,
          confirmadoEm: true,
          colaborador: {
            select: { nome: true, telegramChatId: true, email: true, empresa: { select: { marca: { select: { nome: true } } } } },
          },
        },
      });
      if (recibo.confirmadoEm) {
        jaConfirmados++;
        continue;
      }
      const aviso = await avisarColaborador(recibo);
      await prisma.reciboContracheque.update({
        where: { id: recibo.id },
        data: {
          enviadoEm: new Date(),
          enviadoPorNome: usuario.nome,
          canal: aviso.canal,
          envioErro: aviso.erro,
          envios: { increment: 1 },
        },
      });
      const conta = (porEmpresa[d.empresaId] ??= { avisados: 0, semCanal: 0 });
      if (aviso.canal) {
        avisados++;
        conta.avisados++;
      } else {
        semCanal++;
        conta.semCanal++;
      }
    } catch (e) {
      console.error("[contracheques] envio", d.id, e);
      falhas++;
    }
  }
  return { avisados, semCanal, jaConfirmados, falhas, porEmpresa };
}
