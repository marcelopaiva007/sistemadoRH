// Núcleo do envio de convites de pesquisa — compartilhado entre as server
// actions da UI (lib/actions/pesquisas.ts) e o cron de envio automático
// diário (app/api/cron/enviar-convites).
//
// Regras de envio:
//  - Canal preferido: Telegram (chat_id vinculado); fallback: e-mail.
//  - LIMITE GLOBAL de LIMITE_DIARIO_ENVIOS envios por dia-calendário de
//    Brasília (margem sob o limite diário do plano gratuito do Resend).
//  - O cron envia por SETOR: completa setores inteiros enquanto o orçamento do
//    dia permitir (menores primeiro), e usa o restante para avançar num setor
//    grande — em poucos dias todos os convites saem sem estourar o limite.
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { sendEmail } from "@/lib/email";
import { LIMITE_DIARIO_ENVIOS } from "@/lib/constants-rh";

export { LIMITE_DIARIO_ENVIOS };

export type TokenParaEnvio = {
  id: string;
  token: string;
  colaborador: { nome: string; telegramChatId: string | null; email: string | null };
  pesquisa: { titulo: string; anonima: boolean };
};

// Início do dia corrente no fuso de Brasília (o servidor roda em UTC).
export function inicioDoDiaSaoPaulo(agora = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  // 00:00 em São Paulo = 03:00 UTC (UTC-3, sem horário de verão desde 2019).
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day"), 3, 0, 0));
}

export async function enviosRestantesHoje(): Promise<number> {
  const enviadosHoje = await prisma.surveyToken.count({
    where: { status: "SENT", enviadoEm: { gte: inicioDoDiaSaoPaulo() } },
  });
  return Math.max(0, LIMITE_DIARIO_ENVIOS - enviadosHoje);
}

export async function enviarUmConvite(
  token: TokenParaEnvio,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const link = `${baseUrl}/responder/${token.token}`;
  const primeiroNome = token.colaborador.nome.split(" ")[0];
  const texto = `Olá, ${primeiroNome}! Você foi convidado a responder a pesquisa "${token.pesquisa.titulo}". Acesse: ${link}`;

  let resultado: { ok: true } | { ok: false; error: string };
  let canal: "TELEGRAM" | "EMAIL";
  if (token.colaborador.telegramChatId) {
    canal = "TELEGRAM";
    resultado = await sendTelegramMessage(token.colaborador.telegramChatId, texto);
  } else if (token.colaborador.email) {
    canal = "EMAIL";
    resultado = await sendEmail({
      to: token.colaborador.email,
      subject: `Pesquisa: ${token.pesquisa.titulo}`,
      html:
        `<p>Olá, <strong>${primeiroNome}</strong>!</p>` +
        `<p>Você foi convidado a responder a pesquisa <strong>${token.pesquisa.titulo}</strong>.</p>` +
        (token.pesquisa.anonima
          ? `<p>A pesquisa é anônima: as respostas são analisadas apenas de forma agregada.</p>`
          : "") +
        `<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none">Responder pesquisa</a></p>` +
        `<p>Ou copie o link: ${link}</p>`,
    });
  } else {
    const erro = "Colaborador sem Telegram vinculado e sem e-mail cadastrado.";
    await prisma.surveyToken.update({ where: { id: token.id }, data: { status: "FAILED", erro } });
    return { ok: false, error: erro };
  }

  await prisma.surveyToken.update({
    where: { id: token.id },
    data: resultado.ok
      ? { status: "SENT", canal, enviadoEm: new Date(), erro: null }
      : { status: "FAILED", canal, erro: resultado.error },
  });
  return resultado;
}

export type ResumoEnvioAutomatico = {
  pesquisaId: string;
  pesquisaTitulo: string;
  empresaNome: string;
  porSetor: { setor: string; enviados: number; falhas: number }[];
};

// Uma rodada do envio automático: percorre as pesquisas ATIVAS (cada uma já é
// de uma única empresa — envios nunca misturam empresas) e envia convites
// PENDENTES agrupados por setor, dentro do orçamento diário. Convites FAILED
// não são retentados automaticamente (ficam para revisão/reenvio manual na
// tela), para uma falha permanente não consumir o orçamento todo dia.
export async function rodadaEnvioAutomatico(): Promise<{
  orcamentoInicial: number;
  totalEnviados: number;
  totalFalhas: number;
  pesquisas: ResumoEnvioAutomatico[];
}> {
  const orcamentoInicial = await enviosRestantesHoje();
  let restante = orcamentoInicial;
  let totalEnviados = 0;
  let totalFalhas = 0;
  const resumo: ResumoEnvioAutomatico[] = [];

  const pesquisasAtivas = await prisma.pesquisa.findMany({
    where: { status: "ACTIVE", tokens: { some: { status: "PENDING" } } },
    orderBy: { createdAt: "asc" },
    select: { id: true, titulo: true, anonima: true, empresa: { select: { nome: true } } },
  });

  for (const pesquisa of pesquisasAtivas) {
    if (restante <= 0) break;

    const pendentes = await prisma.surveyToken.findMany({
      where: { pesquisaId: pesquisa.id, status: "PENDING" },
      select: {
        id: true,
        token: true,
        colaborador: {
          select: {
            nome: true,
            telegramChatId: true,
            email: true,
            setor: { select: { nome: true } },
          },
        },
      },
    });
    if (pendentes.length === 0) continue;

    // Agrupa por setor; menores primeiro para completar setores inteiros.
    const porSetor = new Map<string, typeof pendentes>();
    for (const t of pendentes) {
      const setor = t.colaborador.setor?.nome ?? "Sem setor";
      if (!porSetor.has(setor)) porSetor.set(setor, []);
      porSetor.get(setor)!.push(t);
    }
    const setoresOrdenados = [...porSetor.entries()].sort(
      (a, b) => a[1].length - b[1].length || a[0].localeCompare(b[0]),
    );

    const resumoPesquisa: ResumoEnvioAutomatico = {
      pesquisaId: pesquisa.id,
      pesquisaTitulo: pesquisa.titulo,
      empresaNome: pesquisa.empresa.nome,
      porSetor: [],
    };

    for (const [setor, tokens] of setoresOrdenados) {
      if (restante <= 0) break;
      let enviados = 0;
      let falhas = 0;
      for (const t of tokens.slice(0, restante)) {
        const resultado = await enviarUmConvite({
          id: t.id,
          token: t.token,
          colaborador: t.colaborador,
          pesquisa: { titulo: pesquisa.titulo, anonima: pesquisa.anonima },
        });
        if (resultado.ok) {
          enviados++;
          restante--;
        } else {
          falhas++;
        }
      }
      totalEnviados += enviados;
      totalFalhas += falhas;
      if (enviados + falhas > 0) resumoPesquisa.porSetor.push({ setor, enviados, falhas });
    }

    if (resumoPesquisa.porSetor.length > 0) resumo.push(resumoPesquisa);
  }

  return { orcamentoInicial, totalEnviados, totalFalhas, pesquisas: resumo };
}
