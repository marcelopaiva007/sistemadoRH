// Lembrete diário do portal para quem ainda não vinculou o Telegram (Vercel Cron).
//
// Roda dentro da aplicação de propósito: é aqui que estão o SMTP e o banco. Um
// agendador externo precisaria dessas credenciais copiadas para outro lugar.
//
// A lista é montada a cada rodada e se corrige sozinha — quem vinculou desde
// ontem não aparece, e ninguém é cobrado de algo que já fez. A campanha para
// sozinha depois de FIM_DA_CAMPANHA, sem precisar mexer no cron.
//
// Auth: o Vercel Cron manda "Authorization: Bearer $CRON_SECRET"; para disparo
// manual aceita ?secret=$CRON_SECRET — mesmo padrão de /api/cron/enviar-convites.
import { NextRequest, NextResponse } from "next/server";
import { rodadaLembretePortal, FIM_DA_CAMPANHA } from "@/lib/convite-portal";

export const runtime = "nodejs";
export const maxDuration = 300;

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

  try {
    const r = await rodadaLembretePortal();
    console.log(
      r.encerrada
        ? `cron lembrete-portal: campanha encerrada (${r.destinatarios} ainda sem vínculo).`
        : `cron lembrete-portal: ${r.enviados} enviado(s), ${r.falhas} falha(s); ` +
            `${r.jaVincularam} já vincularam, ${r.semEmail} sem e-mail.`,
    );
    return NextResponse.json({ ok: true, fimDaCampanha: FIM_DA_CAMPANHA, ...r });
  } catch (e) {
    console.error("cron lembrete-portal:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
