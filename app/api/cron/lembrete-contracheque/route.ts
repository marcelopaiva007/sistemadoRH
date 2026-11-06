// Lembrete automático de contracheques pendentes (dias 2, 4 e 5 após envio).
// Executado diariamente via Vercel Cron no horário configurado pelo RH.

import { NextRequest, NextResponse } from "next/server";
import { deveRodarAgora, origemAutorizacao } from "@/lib/cron-horario";
import { rodadaLembreteContracheque } from "@/lib/contracheques/lembretes";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const origem = origemAutorizacao(req);
  if (!origem) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Se chamado pelo Vercel Cron, só executa próximo ao horário programado
  if (origem === "cron" && !(await deveRodarAgora("lembrete-contracheque"))) {
    return NextResponse.json({ ok: true, pulado: true, motivo: "fora do horário configurado" });
  }

  try {
    const resultado = await rodadaLembreteContracheque();
    console.log(
      `cron lembrete-contracheque: ${resultado.cobrados} cobrado(s), ${resultado.falhas} falha(s), ` +
        `${resultado.verificados} total verificado.`
    );
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    console.error("cron lembrete-contracheque:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
