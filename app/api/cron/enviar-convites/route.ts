// Envio automático diário dos convites de pesquisa (Vercel Cron).
//
// Uma rodada por dia: envia convites PENDENTES das pesquisas ATIVAS,
// agrupados por setor (setores menores completam primeiro), respeitando o
// teto global de LIMITE_DIARIO_ENVIOS envios/dia (fuso de Brasília) — em
// poucos dias toda a base é coberta sem estourar o limite do provedor de
// e-mail. Convites já enviados ficam marcados (status SENT + canal + data)
// e nunca são reenviados; FAILED fica para reenvio manual na tela.
//
// Auth: Vercel Cron envia "Authorization: Bearer $CRON_SECRET"; para disparo
// manual/diagnóstico aceita ?secret=$CRON_SECRET.
import { NextRequest, NextResponse } from "next/server";
import { rodadaEnvioAutomatico, LIMITE_DIARIO_ENVIOS } from "@/lib/convites";
import { deveRodarAgora, origemAutorizacao } from "@/lib/cron-horario";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const origem = origemAutorizacao(req);
  if (!origem) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // vercel.json chama esta rota a cada 15 min; só roda de fato perto do
  // horário configurado em Configuração → Lembretes (padrão 12:00). Disparo
  // manual (?secret=) ignora o horário de propósito — ver lib/cron-horario.ts.
  if (origem === "cron" && !(await deveRodarAgora("enviar-convites"))) {
    return NextResponse.json({ ok: true, pulado: true, motivo: "fora do horário configurado" });
  }

  try {
    const resultado = await rodadaEnvioAutomatico();
    console.log(
      `cron enviar-convites: ${resultado.totalEnviados} enviado(s), ` +
        `${resultado.totalFalhas} falha(s), orçamento inicial ${resultado.orcamentoInicial}/${LIMITE_DIARIO_ENVIOS}.`,
    );
    return NextResponse.json({ ok: true, limiteDiario: LIMITE_DIARIO_ENVIOS, ...resultado });
  } catch (e) {
    console.error("cron enviar-convites:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
