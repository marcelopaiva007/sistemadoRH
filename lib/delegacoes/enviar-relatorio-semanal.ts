import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { diaBrasilia } from "@/lib/datas";
import { ehDirecao, paraPainel, SELECT_PAINEL } from "@/lib/delegacoes/consultas";
import { duracaoEmTexto, fracaoEmTexto, montarPainelEntregas, type Painel } from "@/lib/delegacoes/painel-entregas";

// A METADE IMPURA do relatório semanal (pedido do CEO em 29/08/2026): lê o
// banco, monta o MESMO `Painel` do grupo inteiro que a tela
// (app/(app)/delegacoes/relatorio) e o CSV mostram, e manda por e-mail a cada
// pessoa `ehDirecao`. Mesmo molde PURO/IMPURO de enviar-digest.ts — a conta
// em si é montarPainelEntregas (puro); este arquivo só lê, agrupa
// destinatários e envia. Chamado pelo cron demandas-relatorio-semanal, 1x/semana.

const DIAS_JANELA = 7;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function montarEmail(painel: Painel, janelaDias: number): { assunto: string; texto: string; html: string } {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const href = `${appUrl}/delegacoes/relatorio`;

  const linhasTexto = painel.linhas.map(
    (l) =>
      `${l.nome} — ${l.abertas} com ela agora (${l.atrasadas} atrasada(s)), ${fracaoEmTexto(l.noPrazo, l.entregues)} no prazo, ${duracaoEmTexto(l.horasMediaEntrega)} até entregar (estimado: ${duracaoEmTexto(l.horasEstimadasMedia)})`,
  );
  const linhasHtml = painel.linhas
    .map(
      (l) =>
        `<tr><td>${esc(l.nome)}</td><td align="center">${l.abertas || "—"}</td><td align="center">${l.atrasadas || "—"}</td><td align="center">${fracaoEmTexto(l.noPrazo, l.entregues)}</td><td align="center">${duracaoEmTexto(l.horasMediaEntrega)}</td><td align="center">${duracaoEmTexto(l.horasEstimadasMedia)}</td><td align="center">${fracaoEmTexto(l.dentroEstimativa, l.comEstimativa)}</td></tr>`,
    )
    .join("");

  const assunto = `[Delegações] Relatório da semana — ${painel.linhas.length} pessoa(s), últimos ${janelaDias} dias`;

  return {
    assunto,
    texto: [
      `Como o grupo entregou nos últimos ${janelaDias} dias:`,
      "",
      ...linhasTexto,
      "",
      `Ver com filtro de período e exportar: ${href}`,
    ].join("\n"),
    html: [
      `<p>Como o grupo entregou nos últimos ${janelaDias} dias:</p>`,
      `<table cellpadding="4" style="border-collapse:collapse">`,
      `<thead><tr><th align="left">Pessoa</th><th>Com ela agora</th><th>Atrasadas</th><th>No prazo</th><th>Tempo até entregar</th><th>Horas estimadas</th><th>Dentro da estimativa</th></tr></thead>`,
      `<tbody>${linhasHtml}</tbody>`,
      `</table>`,
      `<p><a href="${href}">Ver com filtro de período e exportar</a></p>`,
    ].join(""),
  };
}

export type ResultadoRelatorioSemanal = { enviados: number; deduplicados: number; semEmail: number };

/**
 * Monta e manda o relatório semanal para a Direção. Idempotente por `chave`
 * (destinatário + dia do envio): rodar duas vezes na mesma semana não duplica.
 */
export async function enviarRelatorioSemanal(agora = new Date()): Promise<ResultadoRelatorioSemanal> {
  const inicioJanela = new Date(agora.getTime() - (DIAS_JANELA - 1) * 86_400_000);
  inicioJanela.setHours(0, 0, 0, 0);

  const [linhas, usuarios] = await Promise.all([
    prisma.demanda.findMany({
      where: { createdAt: { gte: inicioJanela } },
      select: SELECT_PAINEL,
    }),
    prisma.user.findMany({
      where: { ativo: true },
      select: { id: true, role: true, email: true },
    }),
  ]);

  const painel = montarPainelEntregas(linhas.map((d) => paraPainel(d)), agora);
  const destinatarios = usuarios.filter((u) => ehDirecao(u));

  const resultado: ResultadoRelatorioSemanal = { enviados: 0, deduplicados: 0, semEmail: 0 };
  if (painel.linhas.length === 0) return resultado;

  const { assunto, texto, html } = montarEmail(painel, DIAS_JANELA);
  const diaDoEnvio = diaBrasilia(agora);

  for (const destinatario of destinatarios) {
    if (!destinatario.email) {
      resultado.semEmail++;
      continue;
    }
    const envio = await sendEmail({
      to: destinatario.email,
      fromName: "Delegações",
      subject: assunto,
      text: texto,
      html,
      chave: `delegacoes-relatorio-semanal:${destinatario.id}:${diaDoEnvio}`,
    });
    if (envio.ok && envio.deduplicado) resultado.deduplicados++;
    else if (envio.ok) resultado.enviados++;
  }

  return resultado;
}
