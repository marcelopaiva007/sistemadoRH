// Avisos automáticos ao gestor sobre o time dele (lib/aviso-gestor.ts).
//
// ⚠️ NÃO ESTÁ EM vercel.json DE PROPÓSITO. A rota existe e funciona, mas
// nenhum cron a chama ainda: este motor manda mensagem para pessoas, e ligar o
// disparo automático antes de alguém ler a saída da simulação é como se erra
// caro aqui — mensagem enviada não volta.
//
// COMO LIGAR, na ordem:
//   1. `npx tsx scripts/simular-avisos-gestor.ts` e leia mensagem por mensagem;
//   2. dispare manualmente uma vez: `/api/cron/avisos-gestor?secret=...`;
//   3. só então acrescente a linha em vercel.json:
//      { "path": "/api/cron/avisos-gestor", "schedule": "8,23,38,53 * * * *" }
//      (minutos livres: os outros crons ocupam 5,6,9,12 e múltiplos de 15 —
//      ver o histórico da v1.69.1, quando cinco rodando juntos esgotavam a
//      conexão com o banco e derrubavam envio em silêncio.)

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
