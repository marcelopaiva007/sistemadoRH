// Cobrança de cadastro do COLABORADOR pelo Telegram
// (lib/cobranca-cadastro-colaborador.ts) — roda 1×/dia, mas cada pessoa só é
// cobrada de semana em semana e no máximo 4 vezes.
//
// Não confundir com as outras duas rotas de cobrança:
//   /api/cron/cobranca-rh-pendencias  cobra o RH sobre a fila parada
//   /api/cron/lembrete-pesquisa       cobra o colaborador para responder pesquisa

import { NextRequest, NextResponse } from "next/server";
import { executarCobrancaCadastro } from "@/lib/cobranca-cadastro-colaborador";
import { deveRodarAgora, origemAutorizacao } from "@/lib/cron-horario";

export const runtime = "nodejs";
// Uma mensagem de Telegram por pessoa, em série: numa base grande o laço passa
// bem dos 60s da cobrança do RH (que manda um e-mail por analista, não por
// colaborador). Mesmo teto do lembrete-portal, que percorre a mesma base.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const origem = origemAutorizacao(req);
  if (!origem) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // vercel.json chama esta rota a cada 15 min; só roda de fato perto do
  // horário configurado em Configuração → Lembretes (padrão 11:00). Disparo
  // manual (?secret=) ignora o horário de propósito — ver lib/cron-horario.ts.
  if (origem === "cron" && !(await deveRodarAgora("cobranca-cadastro"))) {
    return NextResponse.json({ ok: true, pulado: true, motivo: "fora do horário configurado" });
  }

  try {
    const r = await executarCobrancaCadastro();
    console.log(
      `cron cobranca-cadastro: ${r.enviados} cobrança(s) enviada(s), ${r.erros} erro(s); ` +
        `${r.incompletos} de ${r.avaliados} ficha(s) incompleta(s), ` +
        `${r.aguardandoPrazo} dentro do prazo semanal, ${r.esgotados} já sem rodada.`,
    );
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("cron cobranca-cadastro:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
