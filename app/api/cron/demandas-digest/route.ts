// O digest por e-mail (spec §6.1/§9.1) — roda 2x/dia, 7h e 18h de Brasília
// (10h e 21h UTC, sem horário de verão no Brasil desde 2019).
//
// lib/delegacoes/enviar-digest.ts faz o trabalho: agrupa por SOLICITANTE,
// filtra pela periodicidade de cada demanda (lib/delegacoes/digest.ts, puro)
// e manda um e-mail por pessoa, idempotente por chave (solicitante+dia+
// período) — rodar duas vezes na mesma janela não duplica.
//
// Auth: mesmo padrão dos outros crons de Delegações — só Bearer $CRON_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { origemAutorizacao } from "@/lib/cron-horario";
import { enviarDigests } from "@/lib/delegacoes/enviar-digest";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!origemAutorizacao(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resultado = await enviarDigests();
  return NextResponse.json({ ok: true, ...resultado });
}
