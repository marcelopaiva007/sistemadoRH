// Motor de alertas (fase 3, lib/alertas.ts) — roda 1×/dia. Cada checagem
// dispara e-mail com dedupe diário (ver lib/alertas.ts para o porquê disso
// ser "de novo todo dia" e não "só uma vez").

import { NextRequest, NextResponse } from "next/server";
import { verificarPlanosDeAcaoVencidos, verificarDesligamentosConcentrados, verificarTaxaRespostaBaixa } from "@/lib/alertas";
import { deveRodarAgora, origemAutorizacao } from "@/lib/cron-horario";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const origem = origemAutorizacao(req);
  if (!origem) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // vercel.json chama esta rota a cada 15 min; só roda de fato perto do
  // horário configurado em Configuração → Lembretes (padrão 10:00). Disparo
  // manual (?secret=) ignora o horário de propósito — ver lib/cron-horario.ts.
  if (origem === "cron" && !(await deveRodarAgora("alertas-rh"))) {
    return NextResponse.json({ ok: true, pulado: true, motivo: "fora do horário configurado" });
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
