// Diagnóstico de e-mail em produção — TEMPORÁRIO.
//
// Existe porque o painel da Vercel não expõe as variáveis por fora e o app não
// tem outra forma de dizer se o SMTP está configurado no ambiente que importa.
// Em 31/07/2026 as cinco variáveis de SMTP sumiram da produção numa
// reconfiguração e todo envio passou a falhar calado — sem isto, só dava para
// descobrir mandando mensagem para colaborador de verdade.
//
// Protegido pelo mesmo CRON_SECRET das rotas de cron. Sem `?to=` apenas relata
// a configuração e NÃO envia nada.
//
//   GET /api/diag/email?secret=...            -> só diagnostica
//   GET /api/diag/email?secret=...&to=alguem  -> envia um teste
//
// REMOVER quando o e-mail estiver confirmado.
import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";

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

  // Só presença e formato — nunca o valor da chave.
  const cfg = {
    SMTP_HOST: process.env.SMTP_HOST ?? null,
    SMTP_PORT: process.env.SMTP_PORT ?? null,
    SMTP_USER: process.env.SMTP_USER ?? null,
    SMTP_PASS: process.env.SMTP_PASS
      ? `${process.env.SMTP_PASS.slice(0, 6)}… (${process.env.SMTP_PASS.length} car.)`
      : null,
    EMAIL_FROM: process.env.EMAIL_FROM ?? null,
  };
  const faltando = Object.entries(cfg)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  const to = req.nextUrl.searchParams.get("to");
  if (!to) {
    return NextResponse.json({ configurado: faltando.length === 0, faltando, cfg });
  }
  if (faltando.length > 0) {
    return NextResponse.json({ enviado: false, faltando, cfg }, { status: 412 });
  }

  const r = await sendEmail({
    to,
    subject: "Teste de envio — Sistema de RH",
    html: `<p>Envio de teste a partir da produção.</p>
           <p>Se você recebeu isto, o SMTP voltou a funcionar.</p>`,
    text: "Envio de teste a partir da produção. Se você recebeu isto, o SMTP voltou a funcionar.",
  });

  return NextResponse.json({ enviado: r.ok, erro: r.ok ? null : r.error, para: to, cfg });
}
