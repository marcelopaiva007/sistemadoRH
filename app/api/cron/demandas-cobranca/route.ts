// O motor da régua de cobrança (spec §6, PR 5) — roda de hora em hora.
//
// Varre demandas ACEITA/EM_EXECUCAO com `proximaCobranca <= agora`
// (lib/delegacoes/cobranca.ts::demandasParaCobrar) e processa cada uma
// (executarCobranca): acha o degrau vencido na régua (lib/delegacoes/regua.ts,
// puro — os percentuais e o D+0..D+3 da spec), avança `nivelEscalonamento` com
// guarda de concorrência, e manda a mensagem pelo(s) canal(is) daquele
// degrau. Idempotente por desenho: rodar duas vezes na mesma janela encontra
// `nivelEscalonamento` já avançado e não duplica nada — não precisa de
// `ultimaCobranca` como guarda adicional (a régua já é a guarda).
//
// Auth: só `Authorization: Bearer $CRON_SECRET` — mesmo padrão dos outros
// crons (lib/cron-horario.ts::origemAutorizacao). Sem `deveRodarAgora`: este
// não é um lembrete que a tela de Configuração liga/desliga por horário — é
// o motor da regra do produto, sempre ligado.

import { NextRequest, NextResponse } from "next/server";
import { origemAutorizacao } from "@/lib/cron-horario";
import { demandasParaCobrar, executarCobranca } from "@/lib/delegacoes/cobranca";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  if (!origemAutorizacao(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agora = new Date();
  const candidatas = await demandasParaCobrar(agora);

  const resultado = { cobrado: 0, pulou: 0, conflito: 0, erro: 0 };
  for (const { id } of candidatas) {
    try {
      const r = await executarCobranca(id, agora);
      if (r === "ok") resultado.cobrado++;
      else if (r === "pulou") resultado.pulou++;
      else if (r === "conflito") resultado.conflito++;
      // "nao-encontrada" não deveria acontecer (a demanda veio da mesma
      // consulta segundos atrás) — conta como erro para aparecer no log.
      else resultado.erro++;
    } catch (e) {
      // Uma demanda que falha (SMTP fora, Telegram fora) não pode derrubar a
      // rodada inteira — as outras 199 candidatas continuam sendo cobradas.
      console.error(`[demandas-cobranca] falhou em ${id}:`, e);
      resultado.erro++;
    }
  }

  return NextResponse.json({ ok: true, candidatas: candidatas.length, ...resultado });
}
