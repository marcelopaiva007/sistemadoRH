// Sincronização diária das vendas de chip do L&M Movel
// (https://movel.assinelm.com). Sem scraping: a plataforma tem API REST própria
// (login por email+senha -> JWT; GET /vendas/sales?year&month paginado). Toda a
// lógica está em lib/chip-movel.ts (compartilhada com a tela /importar/chip).
//
// Sincroniza o mês corrente e, nos 3 primeiros dias do mês, também o mês
// anterior (vendas de fim de mês que entram depois do fechamento do dia).
//
// Variáveis de ambiente:
//   MOVEL_LOGIN, MOVEL_PASSWORD — conta da plataforma L&M Movel
//   SYNC_CHIP_SECRET (ou SYNC_ELLEVEN_SECRET) — disparo manual via ?secret=...
//   CRON_SECRET — enviado automaticamente pelo Vercel Cron
import { NextRequest, NextResponse } from "next/server";
import { syncChipMovel, type ResultadoSyncChip } from "@/lib/chip-movel";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") === `Bearer ${cronSecret}`)
    return true;

  const manualSecret =
    process.env.SYNC_CHIP_SECRET || process.env.SYNC_ELLEVEN_SECRET;
  const provided =
    req.nextUrl.searchParams.get("secret") || req.headers.get("x-sync-secret");
  if (manualSecret && provided === manualSecret) return true;

  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ?year=&month= permitem reprocessar um mês específico (ex.: backfill de um
  // período já fechado no L&M Movel para conferência).
  const now = new Date();
  const yearParam = Number(req.nextUrl.searchParams.get("year"));
  const monthParam = Number(req.nextUrl.searchParams.get("month"));
  const explicit = yearParam >= 2020 && monthParam >= 1 && monthParam <= 12;

  const alvos: Array<{ year: number; month: number }> = [];
  if (explicit) {
    alvos.push({ year: yearParam, month: monthParam });
  } else {
    alvos.push({ year: now.getFullYear(), month: now.getMonth() + 1 });
    if (now.getDate() <= 3) {
      const anterior = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      alvos.push({
        year: anterior.getFullYear(),
        month: anterior.getMonth() + 1,
      });
    }
  }

  const resultados: ResultadoSyncChip[] = [];
  try {
    for (const alvo of alvos) {
      resultados.push(await syncChipMovel(alvo.year, alvo.month));
    }
    return NextResponse.json({ ok: true, resultados });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message, resultados },
      { status: 500 },
    );
  }
}
