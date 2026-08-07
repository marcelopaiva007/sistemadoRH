// Motor de cobrança das pendências do próprio RH (lib/cobranca-rh-pendencias.ts)
// — roda 1×/dia. Não confundir com o cron lembrete-pesquisa, que cobra
// COLABORADOR para responder pesquisa.

import { NextRequest, NextResponse } from "next/server";
import { executarCobrancaPendenciasRH } from "@/lib/cobranca-rh-pendencias";
import { deveRodarAgora, origemAutorizacao } from "@/lib/cron-horario";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const origem = origemAutorizacao(req);
  if (!origem) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // vercel.json chama esta rota a cada 15 min; só roda de fato perto do
  // horário configurado em Configuração → Lembretes (padrão 09:00). Disparo
  // manual (?secret=) ignora o horário de propósito — ver lib/cron-horario.ts.
  if (origem === "cron" && !(await deveRodarAgora("cobranca-rh-pendencias"))) {
    return NextResponse.json({ ok: true, pulado: true, motivo: "fora do horário configurado" });
  }

  const resultado = await executarCobrancaPendenciasRH();
  return NextResponse.json({ ok: true, ...resultado });
}
