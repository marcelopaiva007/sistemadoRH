// Cron de gestão do ciclo de pesquisas de clima (Vercel Cron).
// Roda 1×/dia. Cria rascunhos de novos ciclos (anual/pulso), encerra
// pesquisas vencidas. RH ativa manualmente o rascunho.
//
// Auth: Vercel Cron envia "Authorization: Bearer $CRON_SECRET"; para
// disparo manual/diagnóstico aceita ?secret=$CRON_SECRET.
import { NextRequest, NextResponse } from "next/server";
import { executarGestaoCiclo } from "@/lib/pesquisa-ciclo";

export const runtime = "nodejs";
export const maxDuration = 120;

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

  try {
    // A orquestração (candidatos → rascunhos → notificação → encerramento →
    // ativação agendada) mora em lib/pesquisa-ciclo.ts: o botão manual da
    // tela de Pesquisas (lib/actions/pesquisas.ts) chama a mesma função, para
    // não ter duas versões da mesma lógica divergindo com o tempo.
    const resultado = await executarGestaoCiclo();

    console.log(
      `cron gestao-ciclo: ${resultado.criados.length} criado(s), ${resultado.encerrados.length} encerrado(s), ${resultado.erros.length} erro(s).`,
    );

    return NextResponse.json({ ok: resultado.erros.length === 0, ...resultado });
  } catch (e) {
    console.error("cron gestao-ciclo:", e);
    return NextResponse.json(
      { ok: false, criados: [], encerrados: [], ativados: [], jaNotificados: [], erros: [e instanceof Error ? e.message : String(e)] },
      { status: 500 },
    );
  }
}
