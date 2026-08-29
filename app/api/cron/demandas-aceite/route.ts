// Regra 5 — aceite ativo (spec §5.5): "sem aceite em 24h/48h/72h, o sistema
// cobra o aceite e registra evento de risco." Roda 4x/dia.
//
// lib/delegacoes/cobranca-aceite.ts faz o trabalho: varre ENVIADA vencida
// (por criticidade) e cobra — uma vez só por demanda, via guarda
// `emRisco: false` (não repete a cada rodada; desligar `emRisco` é ação de
// gente, não deste cron).
//
// Auth: mesmo padrão dos outros crons de Delegações — só Bearer $CRON_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { origemAutorizacao } from "@/lib/cron-horario";
import { demandasComAceitePendente, cobrarAceite } from "@/lib/delegacoes/cobranca-aceite";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!origemAutorizacao(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agora = new Date();
  const pendentes = await demandasComAceitePendente(agora);

  const resultado = { cobrado: 0, conflito: 0, erro: 0 };
  for (const d of pendentes) {
    try {
      const r = await cobrarAceite(d.id);
      if (r === "cobrado") resultado.cobrado++;
      else resultado.conflito++;
    } catch (e) {
      console.error(`[demandas-aceite] falhou em ${d.id}:`, e);
      resultado.erro++;
    }
  }

  return NextResponse.json({ ok: true, pendentes: pendentes.length, ...resultado });
}
