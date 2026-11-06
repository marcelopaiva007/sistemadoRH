// Envio de contracheques — o aviso e o link seguro de assinatura ao colaborador.
//
// O contracheque NÃO vai anexado no e-mail inicial nem pelo Telegram:
// 1. O e-mail leva um link único (/assinar/[token]) para a página guiada de assinatura.
// 2. O Telegram notifica que o contracheque chegou no e-mail e traz o botão "Estou ciente".
// 3. Quem não tem Telegram recebe o aviso e o código 2FA exclusivamente por e-mail.

import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { sendEmail } from "@/lib/email";
import { rotuloDoContracheque, tipoFolhaDaChave } from "./situacao";
import { gerarTokenAssinatura } from "./token-auth";

export const PRAZO_DIAS_CORRIDOS = 5;

type Avisado = {
  id: string;
  tokenAssinatura: string | null;
  competencia: Date;
  tipoFolha: string;
  colaborador: {
    nome: string;
    telegramChatId: string | null;
    email: string | null;
    empresa: { marca: { nome: string } };
  };
};

function primeiroNome(nome: string): string {
  return (nome.split(" ")[0] ?? "").toLowerCase().replace(/^\p{L}/u, (c) => c.toUpperCase());
}

/** Mascara o e-mail para exibição segura nas mensagens do bot (ex: j***@gmail.com). */
export function mascararEmail(email: string | null | undefined): string {
  if (!email || !email.includes("@")) return "seu e-mail";
  const [usuario, dominio] = email.split("@");
  if (!usuario || !dominio) return "seu e-mail";
  const inicial = usuario[0] ?? "";
  return `${inicial}***@${dominio}`;
}

function calcularPrazoFormatado(dataBase = new Date()): string {
  const limite = new Date(dataBase.getTime() + PRAZO_DIAS_CORRIDOS * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(limite);
}

/** Monta o template do e-mail inicial com o link de assinatura (sem anexo). */
export function montarCorpoEmailContracheque(
  nome: string,
  ref: string,
  marca: string,
  linkAssinatura: string
): { subject: string; html: string; text: string } {
  const subject = `Seu contracheque de ${ref} — ${marca}`;
  const texto =
    `Oi, ${nome}!\n\n` +
    `Seu contracheque de ${ref} está disponível para assinatura eletrônica.\n\n` +
    `Para abrir, conferir e assinar com autenticação e selfie, acesse o link abaixo (prazo de 5 dias corridos):\n` +
    `${linkAssinatura}\n\n` +
    `A assinatura é simples e rápida: basta confirmar seu CPF, validar o código e tirar uma selfie na tela.\n\n` +
    `RH — ${marca}\n`;

  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" style="max-width:540px;margin:0 auto;background:#fff;border-radius:8px;border:1px solid #e2e5e9;"><tr><td style="padding:32px 36px;">
<h2 style="margin:0 0 16px;font-size:18px;color:#15191e;">Oi, ${nome}!</h2>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3d454f;">Seu <b>contracheque de ${ref}</b> já está disponível para assinatura eletrônica.</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#5a636e;">Por segurança, o documento não vai anexado neste e-mail. Para abrir, ler e assinar com autenticação e selfie, clique no botão abaixo:</p>
<div style="margin:28px 0;text-align:center;">
  <a href="${linkAssinatura}" style="display:inline-block;padding:12px 28px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">Abrir e assinar</a>
</div>
<p style="margin:0 0 16px;font-size:12px;line-height:1.5;color:#8a929c;">Prazo para assinatura: <b>5 dias corridos</b> a partir do recebimento deste e-mail. Se o botão não funcionar, copie e cole o link no seu navegador:<br><a href="${linkAssinatura}" style="color:#0284c7;word-break:break-all;">${linkAssinatura}</a></p>
<p style="margin:28px 0 0;padding-top:16px;border-top:1px solid #e9ecef;font-size:12px;color:#8a929c;">RH — ${marca}</p>
</td></tr></table></body></html>`;

  return { subject, html, text: texto };
}

/** Monta o aviso do Telegram com botão inline "Estou ciente". */
export function montarAvisoTelegram(
  nome: string,
  ref: string,
  marca: string,
  emailMascarado: string,
  prazoTexto: string,
  reciboId: string
): { text: string; replyMarkup: unknown } {
  const text =
    `Oi, ${nome}! Seu contracheque de ${ref} foi enviado para o seu e-mail ${emailMascarado}. Abra e assine até ${prazoTexto}. 📄\n\n` +
    `Toque no botão abaixo para confirmar que recebeu este aviso.\n\n` +
    `RH — ${marca}`;

  const replyMarkup = {
    inline_keyboard: [[{ text: "Estou ciente", callback_data: `contracheque:ciente:${reciboId}` }]],
  };

  return { text, replyMarkup };
}

function obterUrlBase(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (!url) return "https://rh.assinelm.com.br";
  return url.startsWith("http") ? url : `https://${url}`;
}

/**
 * Manda o e-mail com link exclusivo e o aviso no Telegram.
 * Devolve o canal usado ou o motivo da falha.
 */
export async function avisarColaborador(
  r: Avisado,
  tokenAssinatura: string
): Promise<{ canal: "AMBOS" | "EMAIL" | "TELEGRAM" | null; erro: string | null }> {
  const nome = primeiroNome(r.colaborador.nome);
  const ref = rotuloDoContracheque(r.competencia, r.tipoFolha);
  const marca = r.colaborador.empresa.marca.nome;
  const baseUrl = obterUrlBase();
  const linkAssinatura = `${baseUrl}/assinar/${tokenAssinatura}`;
  const prazoTexto = calcularPrazoFormatado();

  if (!r.colaborador.telegramChatId && !r.colaborador.email) {
    return { canal: null, erro: "A pessoa não tem Telegram vinculado nem e-mail cadastrado." };
  }

  let emailOk = false;
  let telegramOk = false;
  let erroEmail: string | null = null;
  let erroTelegram: string | null = null;

  // 1. E-mail obrigatório com link único
  if (r.colaborador.email) {
    const template = montarCorpoEmailContracheque(nome, ref, marca, linkAssinatura);
    const enviado = await sendEmail({
      to: r.colaborador.email,
      subject: template.subject,
      html: template.html,
      text: template.text,
      fromName: `RH ${marca}`,
    });
    if (enviado.ok) emailOk = true;
    else erroEmail = `E-mail: ${enviado.error}`;
  } else {
    erroEmail = "Sem e-mail cadastrado";
  }

  // 2. Telegram com botão "Estou ciente" (se vinculado)
  if (r.colaborador.telegramChatId) {
    const emailMasc = mascararEmail(r.colaborador.email);
    const tg = montarAvisoTelegram(nome, ref, marca, emailMasc, prazoTexto, r.id);
    const enviado = await sendTelegramMessage(r.colaborador.telegramChatId, tg.text, tg.replyMarkup);
    if (enviado.ok) telegramOk = true;
    else erroTelegram = `Telegram: ${enviado.error}`;
  }

  if (emailOk && telegramOk) return { canal: "AMBOS", erro: null };
  if (emailOk) return { canal: "EMAIL", erro: erroTelegram ? `Aviso enviado por e-mail (${erroTelegram})` : null };
  if (telegramOk) return { canal: "TELEGRAM", erro: erroEmail ? `Avisado pelo Telegram (${erroEmail})` : null };

  return {
    canal: null,
    erro: [erroEmail, erroTelegram].filter(Boolean).join(" · ") || "Colaborador sem canal de contato.",
  };
}

/**
 * Cria/atualiza o recibo com token seguro e manda os avisos de e-mail e Telegram.
 */
export async function enviarContracheques(
  documentoIds: string[],
  usuario: { nome: string | null }
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

  for (const d of docs) {
    try {
      let recibo = await prisma.reciboContracheque.findUnique({
        where: { documentoId: d.id },
        select: {
          id: true,
          tokenAssinatura: true,
          competencia: true,
          tipoFolha: true,
          confirmadoEm: true,
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

      if (!recibo) {
        const tokenNovo = gerarTokenAssinatura();
        recibo = await prisma.reciboContracheque.create({
          data: {
            documentoId: d.id,
            empresaId: d.empresaId,
            colaboradorId: d.colaboradorId,
            competencia: d.competencia!,
            tipoFolha: tipoFolhaDaChave(d.chaveDedupe),
            tokenAssinatura: tokenNovo,
          },
          select: {
            id: true,
            tokenAssinatura: true,
            competencia: true,
            tipoFolha: true,
            confirmadoEm: true,
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
      }

      if (recibo.confirmadoEm) {
        jaConfirmados++;
        continue;
      }

      // Se não tiver token ou estiver reenviando, garante token ativo
      const tokenAssinatura = recibo.tokenAssinatura ?? gerarTokenAssinatura();

      const aviso = await avisarColaborador(recibo, tokenAssinatura);
      await prisma.reciboContracheque.update({
        where: { id: recibo.id },
        data: {
          tokenAssinatura,
          enviadoEm: new Date(),
          enviadoPorNome: usuario.nome,
          canal: aviso.canal,
          envioErro: aviso.erro,
          envios: { increment: 1 },
          // Reenvio reseta contadores de erro e desbloqueia
          bloqueadoEm: null,
          tentativasCodigo: 0,
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
