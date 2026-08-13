// Cobrança de cadastro do COLABORADOR por Telegram e e-mail
// (lib/cobranca-cadastro-colaborador.ts) — roda 1×/dia, mas cada pessoa só é
// cobrada de três em três dias (duas vezes por semana) e no máximo 8 vezes.
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

  // Esta rota NASCE INERTE. `deveRodarAgora` devolve false enquanto a gestão
  // não ligar o envio automático em Configuração → Lembretes — a linha em
  // vercel.json continua batendo aqui a cada 15 min e saindo sem fazer nada.
  //
  // Deixar o cron agendado e desligado, em vez de tirá-lo do vercel.json, é o
  // que faz o interruptor da tela valer sozinho: ligar não precisa de deploy,
  // e é justamente disso que uma decisão de gestão precisa — poder ser tomada
  // (e desfeita) por quem a toma, na hora em que a toma.
  if (origem === "cron" && !(await deveRodarAgora("cobranca-cadastro"))) {
    return NextResponse.json({ ok: true, pulado: true, motivo: "envio automático desligado ou fora do horário" });
  }

  try {
    const r = await executarCobrancaCadastro();
    console.log(
      `cron cobranca-cadastro: ${r.enviados} pessoa(s) cobrada(s) ` +
        `(${r.porTelegram} por Telegram, ${r.porEmail} por e-mail), ${r.erros} sem nenhum canal; ` +
        `${r.incompletos} de ${r.avaliados} ficha(s) incompleta(s), ` +
        `${r.aguardandoPrazo} dentro do prazo, ${r.esgotados} já sem rodada` +
        (r.emailAdiado > 0 ? `, ${r.emailAdiado} e-mail(s) adiado(s) para preservar a cota do dia` : "") +
        ".",
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
