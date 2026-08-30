// O relatório semanal por e-mail (pedido do CEO em 29/08/2026) — roda 1x/semana,
// segunda de manhã, 8h de Brasília (11h UTC).
//
// lib/delegacoes/enviar-relatorio-semanal.ts faz o trabalho: monta o Painel do
// GRUPO INTEIRO dos últimos 7 dias e manda um e-mail por pessoa `ehDirecao`,
// idempotente por chave (destinatário+dia do envio) — rodar duas vezes na
// mesma janela não duplica.
//
// Auth: mesmo padrão dos outros crons de Delegações — só Bearer $CRON_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { origemAutorizacao } from "@/lib/cron-horario";
import { enviarRelatorioSemanal } from "@/lib/delegacoes/enviar-relatorio-semanal";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!origemAutorizacao(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resultado = await enviarRelatorioSemanal();
  return NextResponse.json({ ok: true, ...resultado });
}
