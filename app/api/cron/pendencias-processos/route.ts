// Central de Pendências do módulo Processos & Ativos — roda os detectores
// (lib/processos/pendencias.ts) para TODAS as empresas ativas, uma vez por dia.
//
// Uma vez por dia basta, e é de propósito: os prazos daqui são contados em
// DIAS (30 para indicar condutor, licenciamento anual, validade de CNH) — não
// há relógio que mude de hora em hora. Rodar a cada 15 minutos como os crons
// de comunicação só gastaria banco para dizer a mesma coisa 96 vezes. Quem
// acabou de cadastrar e quer ver a lista na hora tem o botão "Atualizar agora"
// na tela, que chama a mesma função.
//
// Auth: o mesmo padrão das outras rotas de cron (lib/cron-horario.ts) — header
// Bearer $CRON_SECRET vindo do Vercel Cron, ou ?secret= para disparo manual.
// NÃO passa por `deveRodarAgora`: aquilo é dos crons que mandam mensagem, cujo
// horário o RH ajusta na tela de Lembretes. Este não avisa ninguém ainda — só
// mantém a lista em dia. Avisar (Telegram, e-mail) entra quando a tela tiver
// provado que a lista é confiável; alerta de lista que ainda mente ensina o
// time a ignorar o canal.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sincronizarPendencias } from "@/lib/processos/pendencias";
import { origemAutorizacao } from "@/lib/cron-horario";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const origem = origemAutorizacao(req);
  if (!origem) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const empresas = await prisma.empresa.findMany({ where: { ativo: true }, select: { id: true } });
    const resultado = await sincronizarPendencias(empresas.map((e) => e.id));

    console.log(
      `cron pendencias-processos: ${empresas.length} empresa(s) — ` +
        `${resultado.criadas} criada(s), ${resultado.atualizadas} atualizada(s), ` +
        `${resultado.resolvidas} resolvida(s) automaticamente.`,
    );

    return NextResponse.json({ ok: true, empresas: empresas.length, ...resultado });
  } catch (e) {
    console.error("cron pendencias-processos:", e);
    return NextResponse.json(
      { ok: false, erro: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
