import "server-only";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

// Lembrete do portal para quem ainda não vinculou o Telegram.
//
// A lista é montada na hora e se corrige sozinha: quem vinculou desde o último
// envio simplesmente não aparece. Ninguém recebe cobrança de algo que já fez.
//
// Assina a marca de cada pessoa, nunca as três do grupo — quem é da Centrysol
// lendo "LM Telecom" acha que a mensagem veio trocada.

/** Depois disto o lembrete para de sair sozinho, sem precisar mexer no cron. */
export const FIM_DA_CAMPANHA = new Date("2026-07-31T02:59:00Z"); // 30/07, 23h59 de Brasília

export const BOT_DO_RH = "@ContatoLm_bot";

const PRAZO = "quinta, 30/07";

function corpo(nome: string, marca: string): { texto: string; html: string } {
  const primeiro = nome.split(" ")[0].replace(/\b\w/g, (c) => c.toUpperCase());
  const texto =
    `Oi, ${primeiro}! Tudo bem?\n\n` +
    `Vimos que você ainda não ativou o canal do RH no Telegram — é por onde você\n` +
    `consulta suas férias e seus documentos direto do celular.\n\n` +
    `1. No Telegram, procure ${BOT_DO_RH}\n` +
    `2. Toque em Iniciar\n` +
    `3. Toque em "Compartilhar meu número"\n\n` +
    `Se pedir CPF, é só digitar os números.\n\n` +
    `O prazo vai até ${PRAZO}. Leva menos de um minuto.\n\n` +
    `Qualquer dúvida, me chama!\n\n` +
    `RH - ${marca}\n`;

  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;border:1px solid #e2e5e9;">
<tr><td style="padding:30px 32px;">
  <p style="margin:0 0 18px;font-size:16px;color:#15191e;">Oi, ${primeiro}! Tudo bem?</p>
  <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#3d454f;">
    Vimos que você ainda não ativou o canal do RH no Telegram — é por onde você consulta
    <b>suas férias e seus documentos</b> direto do celular.
  </p>
  <table role="presentation" style="width:100%;background:#f0f4f9;border-radius:6px;margin:0 0 18px;">
    <tr><td style="padding:18px 20px;font-size:15px;line-height:1.9;color:#15191e;">
      <b>1.</b> No Telegram, procure <b>${BOT_DO_RH}</b><br>
      <b>2.</b> Toque em <b>Iniciar</b><br>
      <b>3.</b> Toque em <b>📱 Compartilhar meu número</b>
    </td></tr>
  </table>
  <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#5a636e;">Se pedir CPF, é só digitar os números.</p>
  <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#15191e;">
    O prazo vai até <b>${PRAZO}</b>. Leva menos de um minuto.
  </p>
  <p style="margin:0;font-size:15px;color:#3d454f;">Qualquer dúvida, me chama! 😊</p>
  <p style="margin:26px 0 0;padding-top:16px;border-top:1px solid #e9ecef;font-size:12px;color:#8a929c;">RH — ${marca}</p>
</td></tr></table></body></html>`;

  return { texto, html };
}

export type ResultadoLembrete = {
  encerrada: boolean;
  destinatarios: number;
  enviados: number;
  falhas: number;
  semEmail: number;
  jaVincularam: number;
};

export async function rodadaLembretePortal(agora = new Date()): Promise<ResultadoLembrete> {
  const [pendentes, semEmail, jaVincularam] = await Promise.all([
    prisma.colaborador.findMany({
      where: { ativo: true, telegramChatId: null, email: { not: null } },
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        email: true,
        empresa: { select: { marca: { select: { nome: true } } } },
      },
    }),
    prisma.colaborador.count({ where: { ativo: true, telegramChatId: null, email: null } }),
    prisma.colaborador.count({ where: { ativo: true, telegramChatId: { not: null } } }),
  ]);

  const base = { destinatarios: pendentes.length, semEmail, jaVincularam };

  if (agora > FIM_DA_CAMPANHA) {
    return { encerrada: true, enviados: 0, falhas: 0, ...base };
  }

  const valido = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;
  let enviados = 0;
  let falhas = 0;

  for (const p of pendentes) {
    if (!p.email || !valido.test(p.email)) continue;
    const marca = p.empresa.marca.nome;
    const { texto, html } = corpo(p.nome, marca);
    const r = await sendEmail({
      to: p.email,
      subject: `Falta ativar seu acesso ao RH — prazo ${PRAZO}`,
      html,
      text: texto,
      fromName: `RH ${marca}`,
      // Uma cobrança por pessoa por dia, mesmo se o cron for disparado à mão
      // mais de uma vez. Foi esta campanha que, em 28/07, mandou ~60 e-mails em
      // 8 segundos e comeu a cota do dia antes de os convites saírem.
      chave: `portal:${p.id}`,
    });
    if (r.ok) enviados++;
    else {
      falhas++;
      // Sem cota não adianta seguir: o resto do laço só produziria recusas.
      if (r.motivo === "COTA") break;
    }
  }

  return { encerrada: false, enviados, falhas, ...base };
}
