// Motor de alertas (fase 3, lib/alertas.ts) — roda 1×/dia. Cada checagem
// dispara e-mail com dedupe diário (ver lib/alertas.ts para o porquê disso
// ser "de novo todo dia" e não "só uma vez").

import { NextRequest, NextResponse } from "next/server";
import { verificarPlanosDeAcaoVencidos, verificarDesligamentosConcentrados, verificarTaxaRespostaBaixa } from "@/lib/alertas";

export const runtime = "nodejs";
export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  return req.nextUrl.searchParams.get("secret") === secret;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [planosVencidos, desligamentos, taxaResposta] = await Promise.all([
    verificarPlanosDeAcaoVencidos(),
    verificarDesligamentosConcentrados(),
    verificarTaxaRespostaBaixa(),
  ]);

  return NextResponse.json({
    ok: true,
    AL09_planosVencidos: planosVencidos,
    AL10_desligamentosConcentrados: desligamentos,
    AL08_taxaRespostaBaixa: taxaResposta,
  });
}
