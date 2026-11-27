// Fila do teto diário de e-mail dos contracheques (OS 11/11/2026, item 1).
//
// Roda de 15 em 15 minutos no horário comercial, e é barata quando a fila está
// vazia (uma contagem). Não entra em LEMBRETES_CONFIGURAVEIS de propósito: não
// é lembrete, é a continuação de um envio que o RH já mandou fazer — não faz
// sentido o RH "desligar" o resto do envio dele. O primeiro horário do dia
// (07:01 em Brasília) vem antes dos crons de convite e lembrete, para o
// contracheque pegar o saldo novo do dia antes deles.

import { NextRequest, NextResponse } from "next/server";
import { origemAutorizacao } from "@/lib/cron-horario";
import { processarFilaEmailContracheque } from "@/lib/contracheques/fila-email";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!origemAutorizacao(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const r = await processarFilaEmailContracheque();
    if (r.naFila > 0) {
      console.log(
        `cron fila-email-contracheque: ${r.enviados} enviado(s), ${r.falhas} falha(s), ` +
          `${r.aindaNaFila} ainda na fila, saldo inicial ${r.saldoInicial}.`,
      );
    }
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("cron fila-email-contracheque:", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
