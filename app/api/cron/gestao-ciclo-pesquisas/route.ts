// Cron de gestão do ciclo de pesquisas de clima (Vercel Cron).
// Roda 1×/dia. Cria rascunhos de novos ciclos (anual/pulso), encerra
// pesquisas vencidas. RH ativa manualmente o rascunho.
//
// Auth: SÓ o header `Authorization: Bearer $CRON_SECRET` do Vercel Cron. O
// `?secret=` na URL foi removido em 27/08/2026 (vazava o segredo em
// log/Referer).
import { NextRequest, NextResponse } from "next/server";
import { executarGestaoCiclo } from "@/lib/pesquisa-ciclo";
import { executarCicloEnps } from "@/lib/pesquisa-enps";
import { executarCicloOnboarding } from "@/lib/pesquisa-onboarding";
import { executarReguaCobranca } from "@/lib/regua-cobranca";
import { segredoConfere } from "@/lib/cron-horario";

export const runtime = "nodejs";
export const maxDuration = 120;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Só o header — o `?secret=` na URL foi removido (pentest 27/08/2026):
  // segredo em query string vaza em log/Referer/histórico.
  // Em tempo constante, como os demais crons (lib/cron-horario.ts) — este é
  // o único fora de `origemAutorizacao` e ficou com `===` até 03/09/2026.
  return segredoConfere(req.headers.get("authorization"), `Bearer ${secret}`);
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
    // eNPS mensal (fase 4) — não passa pelo mesmo `coletarCandidatos`/
    // `criarCicloRascunho` porque aqueles são tipados pra CLIMA (anual/pulso
    // trimestral).
    const enps = await executarCicloEnps();
    const onboarding = await executarCicloOnboarding();
    // Régua de cobrança (fase 5) — lembretes/encerramento de NR01, P05-ENPS
    // e CLIMA (migrado 02/08/2026, ver lib/regua-cobranca.ts). O
    // `encerrarVencidas` do executarGestaoCiclo acima fica no código mas é
    // inerte pra CLIMA agora — nada mais chega aos 30 dias ainda ACTIVE.
    const regua = await executarReguaCobranca();

    console.log(
      `cron gestao-ciclo: ${resultado.criados.length} criado(s), ${resultado.encerrados.length} encerrado(s), ` +
        `${enps.criados.length} eNPS criado(s), ${onboarding.convidados.length} onboarding D+30 convidado(s), ` +
        `régua: ${regua.lembretesEnviados} lembrete(s), ${regua.encerradas} encerrada(s), ` +
        `${resultado.erros.length + enps.erros.length + onboarding.erros.length + regua.erros} erro(s).`,
    );

    return NextResponse.json({
      ok: resultado.erros.length === 0 && enps.erros.length === 0 && onboarding.erros.length === 0 && regua.erros === 0,
      ...resultado,
      enpsCriados: enps.criados,
      onboardingConvidados: onboarding.convidados,
      regua,
      erros: [...resultado.erros, ...enps.erros, ...onboarding.erros],
    });
  } catch (e) {
    console.error("cron gestao-ciclo:", e);
    return NextResponse.json(
      { ok: false, criados: [], encerrados: [], ativados: [], jaNotificados: [], erros: [e instanceof Error ? e.message : String(e)] },
      { status: 500 },
    );
  }
}
