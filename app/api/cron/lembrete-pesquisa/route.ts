// Lembrete automático para quem recebeu convite e ainda não respondeu.
// Roda 2×/dia. Máximo 1 lembrete a cada 5 dias por token, até 3 lembretes.
// O contador de lembretes é salvo no campo `erro` com marcador [L:n] —
// gambiarra de propósito até evoluirmos o modelo.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { sendEmail } from "@/lib/email";
import { CONVITES_NA_PESQUISA } from "@/lib/pesquisa-numeros";
import { idsComAfastamentoVigente } from "@/lib/pesquisa-vinculo";

export const runtime = "nodejs";
export const maxDuration = 120;

const DIAS_ENTRE_LEMBRETES = 5;
const MAX_LEMBRETES = 3;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  return req.nextUrl.searchParams.get("secret") === secret;
}

function contarLembretes(erro: string | null): number {
  const match = (erro ?? "").match(/\[L:(\d+)\]/);
  return match ? Number(match[1]) : 0;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Janela: tokens há pelo menos 3 dias e ainda não respondidos
  const limiteMaisDe = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const limiteRateLimiter = new Date(Date.now() - DIAS_ENTRE_LEMBRETES * 24 * 60 * 60 * 1000);

  const tokens = await prisma.surveyToken.findMany({
    where: {
      status: "SENT",
      enviadoEm: { lt: limiteMaisDe },
      respondidoEm: null,
      // RD-001: quem foi desligado depois de receber o convite não recebe
      // mais lembrete — ver lib/pesquisa-vinculo.ts.
      colaborador: { ativo: true },
    },
    include: {
      pesquisa: { select: { id: true, titulo: true, anonima: true, encerradaEm: true } },
      colaborador: {
        select: {
          nome: true,
          email: true,
          telegramChatId: true,
        },
      },
    },
  });

  let enviados = 0;
  let falhas = 0;
  let ignorados = 0;

  // RD-001: INSS/licença-maternidade/suspensão vigente pausa o lembrete,
  // mesmo com cadastro ativo — retoma sozinho quando o afastamento acabar.
  const afastados = await idsComAfastamentoVigente(
    prisma,
    tokens.map((t) => t.colaboradorId),
  );

  for (const token of tokens) {
    if (token.pesquisa.encerradaEm) {
      ignorados++;
      continue;
    }
    if (afastados.has(token.colaboradorId)) {
      ignorados++;
      continue;
    }

    const jaEnviadoHaMaisDe = token.enviadoEm
      ? token.enviadoEm < limiteRateLimiter
      : true;

    if (!jaEnviadoHaMaisDe) {
      ignorados++;
      continue;
    }

    const lembretesFeitos = contarLembretes(token.erro);
    if (lembretesFeitos >= MAX_LEMBRETES) {
      ignorados++;
      continue;
    }

    const link = `${process.env.NEXT_PUBLIC_APP_URL}/responder/${token.token}`;
    const msg = `Olá, ${token.colaborador.nome.split(" ")[0]}! Sua opinião sobre a pesquisa "${token.pesquisa.titulo}" ainda não foi registrada. Leva menos de 5 minutos: ${link}`;

    let ok = false;
    if (token.colaborador.telegramChatId) {
      const r = await sendTelegramMessage(token.colaborador.telegramChatId, msg);
      ok = r.ok;
    } else if (token.colaborador.email) {
      const r = await sendEmail({
        to: token.colaborador.email,
        subject: `Lembrete: pesquisa de clima`,
        text: msg,
        html: `<p>${msg}</p>`,
        // Este cron roda duas vezes por dia (13h e 19h UTC). Sem a chave, quem
        // não respondeu levava o mesmo lembrete duas vezes e pagava dobrado na
        // cota — e ainda contava como 2 dos 3 lembretes a que tem direito.
        chave: `lembrete:${token.id}`,
      });
      ok = r.ok;
      // Sem cota, o resto da fila só geraria recusa; volta amanhã.
      if (!r.ok && r.motivo === "COTA") break;
    }

    if (ok) {
      const marcador = `[L:${lembretesFeitos + 1}]`;
      const erroLimpo = (token.erro ?? "").replace(/\[L:\d+\]\s*/, "");
      await prisma.surveyToken.update({
        where: { id: token.id },
        data: { erro: erroLimpo ? `${marcador} ${erroLimpo}` : marcador },
      });
      enviados++;
    } else {
      falhas++;
    }
  }

  return NextResponse.json({
    ok: true,
    analisados: tokens.length,
    enviados,
    falhas,
    ignorados,
  });
}
