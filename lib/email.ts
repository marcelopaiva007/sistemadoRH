// Envio de e-mail via SMTP (nodemailer). Config nas env vars:
//   SMTP_HOST, SMTP_PORT (587 STARTTLS ou 465 TLS), SMTP_USER, SMTP_PASS,
//   EMAIL_FROM (ex.: "RH LM Telecom <rh@assinelm.com.br>").
// Sem configuração, retorna erro claro (mesmo contrato de lib/telegram.ts) —
// o convite fica FAILED com o motivo visível na tela da pesquisa.
import nodemailer, { type Transporter } from "nodemailer";

// Transporter com pool reutilizado entre envios do mesmo processo — sem isso,
// cada e-mail paga um handshake TLS/SMTP completo (~1s), o que inviabiliza o
// envio em lote dentro do tempo de uma server action.
let cached: { key: string; transporter: Transporter } | null = null;
function getTransporter(host: string, port: number, user: string, pass: string): Transporter {
  const key = `${host}:${port}:${user}`;
  if (cached?.key === key) return cached.transporter;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    pool: true,
    maxConnections: 2,
  });
  cached = { key, transporter };
  return transporter;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM || user;

  if (!host || !user || !pass) {
    return {
      ok: false,
      error: "SMTP não configurado (defina SMTP_HOST, SMTP_USER e SMTP_PASS).",
    };
  }

  try {
    const transporter = getTransporter(host, port, user, pass);
    await transporter.sendMail({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: `Falha ao enviar e-mail: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
