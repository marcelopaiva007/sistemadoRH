// Cron de gestão do ciclo de pesquisas de clima (Vercel Cron).
// Roda 1×/dia. Cria rascunhos de novos ciclos (anual/pulso), encerra
// pesquisas vencidas. RH ativa manualmente o rascunho.
//
// Auth: Vercel Cron envia "Authorization: Bearer $CRON_SECRET"; para
// disparo manual/diagnóstico aceita ?secret=$CRON_SECRET.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  coletarCandidatos,
  criarCicloRascunho,
  encerrarVencidas,
  ativarAgendadas,
  type ResultadoGestaoCiclo,
} from "@/lib/pesquisa-ciclo";
import { notificarCiclo } from "@/lib/pesquisa-notificacoes";

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

  const resultado: ResultadoGestaoCiclo = {
    criados: [],
    encerrados: [],
    ativados: [],
    jaNotificados: [],
    erros: [],
  };

  try {
    // 1. Coleta candidatos para novo ciclo
    const candidatos = await coletarCandidatos();

    // 2. Cria rascunhos + notifica
    for (const cand of candidatos) {
      try {
        const { pesquisaId, titulo } = await criarCicloRascunho(cand);
        resultado.criados.push({
          empresaId: cand.empresaId,
          pesquisaId,
          tipo: cand.tipo,
          titulo,
        });

        const notif = await notificarCiclo({
          empresaId: cand.empresaId,
          pesquisaId,
          titulo,
          tipo: "CRIADA",
        });
        console.log(
          `gestion-ciclo: pesquisa ${titulo} criada e ${notif.enviados} notificação(ões) enviada(s) — ${notif.erros} erro(s).`,
        );
      } catch (e) {
        resultado.erros.push(
          `criar ${cand.empresaNome} ${cand.tipo}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    // 3. Encerra pesquisas vencidas (ativa há 30+ dias, sem respostas há 7+)
    const encerrados = await encerrarVencidas();
    resultado.encerrados = encerrados;

    for (const enc of encerrados) {
      try {
        const pesquisa = await prisma.pesquisa.findUnique({
          where: { id: enc.pesquisaId },
          select: { empresaId: true },
        });
        if (pesquisa) {
          await notificarCiclo({
            empresaId: pesquisa.empresaId,
            pesquisaId: enc.pesquisaId,
            titulo: enc.titulo,
            tipo: "ENCERRADA",
          });
        }
      } catch (e) {
        resultado.erros.push(
          `notificar encerramento ${enc.titulo}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    // 4. Placeholder para ativação agendada
    resultado.ativados = await ativarAgendadas();

    console.log(
      `cron gestao-ciclo: ${resultado.criados.length} criado(s), ${resultado.encerrados.length} encerrado(s), ${resultado.erros.length} erro(s).`,
    );

    return NextResponse.json({ ok: resultado.erros.length === 0, ...resultado });
  } catch (e) {
    console.error("cron gestao-ciclo:", e);
    resultado.erros.push(e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, ...resultado }, { status: 500 });
  }
}
