// Avisos automáticos ao gestor sobre o time dele (lib/aviso-gestor.ts).
//
// Desde 12/08/2026 o cron ESTÁ em vercel.json (minuto 8,23,38,53 — livre dos
// demais; ver o histórico da v1.69.1, quando cinco crons juntos esgotavam a
// conexão com o banco). Mas o lembrete NASCE DESLIGADO
// (LEMBRETES_QUE_NASCEM_DESLIGADOS em lib/cron-horario.ts): cada chamada do
// agendador cai no `deveRodarAgora` e sai como "pulado" até alguém LIGAR o
// interruptor na tela de Lembretes. Este motor manda mensagem para a chefia, e
// mandar é decisão de gestão, não efeito colateral de deploy — o dono do
// sistema disse "vou decidir no dia a dia", e o interruptor é esse dia a dia.
//
// Antes de ligar, a prévia mora na tela "Avisos ao gestor" (o que sairia,
// mensagem por mensagem) — e um disparo manual de teste continua possível:
// `/api/cron/avisos-gestor?secret=...` (ignora o interruptor de propósito;
// `?simular=1` mostra sem enviar).

import { NextRequest, NextResponse } from "next/server";
import { executarAvisosDoGestor } from "@/lib/aviso-gestor";
import { deveRodarAgora, origemAutorizacao } from "@/lib/cron-horario";

export const runtime = "nodejs";
// Uma mensagem por GESTOR, não por colaborador — a lista é bem menor que a da
// cobrança de cadastro. 120s cobre com folga.
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const origem = origemAutorizacao(req);
  if (!origem) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (origem === "cron" && !(await deveRodarAgora("avisos-gestor"))) {
    return NextResponse.json({ ok: true, pulado: true, motivo: "fora do horário configurado" });
  }

  // `?simular=1` devolve as mensagens sem enviar — o mesmo que o script faz,
  // acessível de onde não se tem terminal.
  const simular = req.nextUrl.searchParams.get("simular") === "1";

  try {
    const r = await executarAvisosDoGestor({ enviar: !simular });
    console.log(
      `cron avisos-gestor${simular ? " (SIMULAÇÃO)" : ""}: ` +
        `${r.gestoresAvaliados} gestor(es) com equipe, ${r.comItens} com aviso, ` +
        `${r.enviados} enviado(s), ${r.semCanal} sem Telegram, ` +
        `${r.silenciados} item(ns) silenciado(s), ${r.erros} erro(s).`,
    );
    return NextResponse.json({ ok: true, simulado: simular, ...r });
  } catch (e) {
    console.error("cron avisos-gestor:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
