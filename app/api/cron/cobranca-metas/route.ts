// Cobrança diária de metas por Telegram e e-mail.
//
// TRAVA DE SEGURANÇA: só envia de verdade quando COBRANCA_ATIVA="true". Enquanto
// não estiver, roda em modo "dry-run" (calcula e retorna o que SERIA enviado, sem
// mandar nada) — assim dá para configurar tudo e testar sem cobrar ninguém por
// engano.
//
// Variáveis de ambiente:
//   COBRANCA_ATIVA      — "true" liga o envio real (default: dry-run)
//   CRON_SECRET         — auth do Vercel Cron (Bearer), como no sync-elleven
//   COBRANCA_SECRET     — (opcional) para disparo manual via ?secret=
//   TELEGRAM_BOT_TOKEN, RESEND_API_KEY, COBRANCA_EMAIL_FROM — ver lib/notificacoes.ts
import { NextRequest, NextResponse } from "next/server";
import { periodoAtual, periodoLabel } from "@/lib/periodo";
import { carregarAcompanhamento } from "@/lib/acompanhamento-data";
import {
  enviarTelegram,
  enviarEmail,
  telegramConfigurado,
  emailConfigurado,
  type EnvioResultado,
} from "@/lib/notificacoes";

export const runtime = "nodejs";
export const maxDuration = 120;

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") === `Bearer ${cronSecret}`)
    return true;
  const manual = process.env.COBRANCA_SECRET;
  const provided =
    req.nextUrl.searchParams.get("secret") || req.headers.get("x-cobranca-secret");
  if (manual && provided === manual) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ativa = process.env.COBRANCA_ATIVA === "true";
  const periodo = periodoAtual();
  const acompanhamentos = await carregarAcompanhamento(periodo);
  const assunto = `Sua meta de ${periodoLabel(periodo)} — LM`;

  const resultados: Array<
    { nome: string } & (EnvioResultado | { dryRun: true; canais: string[]; previa: string })
  > = [];
  let enviados = 0;
  let semContato = 0;

  for (const a of acompanhamentos) {
    const canais: string[] = [];
    if (a.telegramChatId) canais.push("telegram");
    if (a.email) canais.push("email");
    if (canais.length === 0) {
      semContato++;
      continue;
    }

    if (!ativa) {
      resultados.push({
        nome: a.nome,
        dryRun: true,
        canais,
        previa: a.mensagem.slice(0, 160),
      });
      continue;
    }

    if (a.telegramChatId) {
      const r = await enviarTelegram(a.telegramChatId, a.mensagem);
      resultados.push({ nome: a.nome, ...r });
      if (r.ok) enviados++;
    }
    if (a.email) {
      const r = await enviarEmail(a.email, assunto, a.mensagem);
      resultados.push({ nome: a.nome, ...r });
      if (r.ok) enviados++;
    }
  }

  return NextResponse.json({
    ok: true,
    periodo,
    ativa,
    dryRun: !ativa,
    canaisConfigurados: {
      telegram: telegramConfigurado(),
      email: emailConfigurado(),
    },
    totalPessoas: acompanhamentos.length,
    comContato: acompanhamentos.filter((a) => a.email || a.telegramChatId).length,
    semContato,
    enviados,
    resultados: resultados.slice(0, 200),
  });
}
