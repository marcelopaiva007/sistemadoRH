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
//
// O teto em si não mora mais aqui: quem conta e recusa é lib/email.ts, o único
// ponto por onde todo envio passa. O orçamento consultado abaixo serve para
// dimensionar o lote antes de começar; a garantia dura é a de lá.
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { sendEmail, orcamentoRestanteHoje, inicioDoDiaSaoPaulo } from "@/lib/email";
import { LIMITE_DIARIO_ENVIOS } from "@/lib/constants-rh";

export { LIMITE_DIARIO_ENVIOS, inicioDoDiaSaoPaulo };

export type TokenParaEnvio = {
  id: string;
  token: string;
  colaborador: { nome: string; telegramChatId: string | null; email: string | null };
  pesquisa: { titulo: string; anonima: boolean };
};

// Quanto ainda cabe hoje. Até 01/08/2026 isto contava SurveyToken com
// canal='EMAIL' — e enxergava só os convites de pesquisa. A campanha do portal,
// os lembretes e as notificações de ciclo gastavam a mesma cota sem aparecer
// aqui, então o contador dizia "100 livres" depois de 60 já terem saído.
// Agora a fonte é o registro de tudo que sai (lib/email.ts).
export async function enviosRestantesHoje(): Promise<number> {
  // Limite só conta para e-mail. Telegram não tem limite.
  return orcamentoRestanteHoje();
}

export type ResultadoConvite =
  | { ok: true }
  // `semCota` avisa quem chama que a parada é do dia, não do convite: o laço
  // de envio deve parar em vez de queimar as tentativas restantes uma a uma.
  | { ok: false; error: string; semCota?: boolean };

export async function enviarUmConvite(token: TokenParaEnvio): Promise<ResultadoConvite> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const link = `${baseUrl}/responder/${token.token}`;
  const primeiroNome = token.colaborador.nome.split(" ")[0];
  const texto = `Olá, ${primeiroNome}! Você foi convidado a responder a pesquisa "${token.pesquisa.titulo}". Acesse: ${link}`;

  let resultado: { ok: true } | { ok: false; error: string; motivo?: string };
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
      // Um convite por pessoa por dia. O id do token já é único por
      // (pesquisa, colaborador) — é o que impede o reenvio manual pela tela de
      // duplicar o que o cron mandou de manhã.
      chave: `convite:${token.id}`,
    });
  } else {
    // Sem canal não é falha, é espera: FAILED nunca é retentado pelo envio
    // automático, então marcar assim aposentaria o convite para sempre — e
    // justamente quem está sem Telegram hoje é quem está sendo cobrado para
    // vincular. Fica PENDING com o motivo à vista, e sai sozinho no dia em que
    // a pessoa vincular.
    const erro = "Aguardando vínculo do Telegram (sem Telegram e sem e-mail cadastrado).";
    await prisma.surveyToken.update({ where: { id: token.id }, data: { erro } });
    return { ok: false, error: erro };
  }

  // Cota estourada não é falha do convite — é fim de expediente. Marcar FAILED
  // aqui aposentaria o convite para sempre (FAILED não é retentado pelo envio
  // automático), e o teto é justamente uma condição que passa sozinha à
  // meia-noite. Fica PENDING, com o motivo à vista, e sai amanhã.
  const semCota = !resultado.ok && resultado.motivo === "COTA";
  if (semCota) {
    await prisma.surveyToken.update({
      where: { id: token.id },
      data: { erro: (resultado as { error: string }).error },
    });
    return { ok: false, error: (resultado as { error: string }).error, semCota: true };
  }

  await prisma.surveyToken.update({
    where: { id: token.id },
    data: resultado.ok
      ? { status: "SENT", canal, enviadoEm: new Date(), erro: null }
      : { status: "FAILED", canal, erro: resultado.error },
  });
  return resultado.ok ? { ok: true } : { ok: false, error: resultado.error };
}

export type ResumoEnvioAutomatico = {
  pesquisaId: string;
  pesquisaTitulo: string;
  empresaNome: string;
  porSetor: { setor: string; enviados: number; falhas: number }[];
};

// Uma rodada do envio automático: percorre as pesquisas ATIVAS (cada uma já é
// de uma única empresa — envios nunca misturam empresas) e envia convites
// PENDENTES com prioridade:
// 1. Telegram: sem limite (tudo de uma vez)
// 2. E-mail: respeitando o orçamento diário (ver LIMITE_DIARIO_ENVIOS)
//
// Convites FAILED não são retentados automaticamente (ficam para revisão/reenvio
// manual na tela), para uma falha permanente não consumir o orçamento todo dia.
export async function rodadaEnvioAutomatico(): Promise<{
  orcamentoInicial: number;
  totalEnviados: number;
  totalFalhas: number;
  pesquisas: ResumoEnvioAutomatico[];
}> {
  const orcamentoInicial = await enviosRestantesHoje();
  let restanteEmail = orcamentoInicial;
  let totalEnviados = 0;
  let totalFalhas = 0;
  const resumo: ResumoEnvioAutomatico[] = [];

  const pesquisasAtivas = await prisma.pesquisa.findMany({
    where: { status: "ACTIVE", tokens: { some: { status: "PENDING" } } },
    orderBy: { createdAt: "asc" },
    select: { id: true, titulo: true, anonima: true, empresa: { select: { nome: true } } },
  });

  for (const pesquisa of pesquisasAtivas) {
    const pendentes = await prisma.surveyToken.findMany({
      where: {
        pesquisaId: pesquisa.id,
        status: "PENDING",
        colaborador: {
          ativo: true,
          OR: [{ telegramChatId: { not: null } }, { email: { not: null } }],
        },
      },
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

    const resumoPesquisa: ResumoEnvioAutomatico = {
      pesquisaId: pesquisa.id,
      pesquisaTitulo: pesquisa.titulo,
      empresaNome: pesquisa.empresa.nome,
      porSetor: [],
    };

    // Prioriza Telegram (sem limite), depois e-mail (com limite)
    const porTelegram = pendentes.filter(t => t.colaborador.telegramChatId);
    const porEmail = pendentes.filter(t => !t.colaborador.telegramChatId && t.colaborador.email);

    const todasAsPrioridades = [...porTelegram, ...porEmail];

    // Agrupa por setor para resumo
    const porSetor = new Map<string, { telegram: typeof porTelegram; email: typeof porEmail }>();
    for (const t of todasAsPrioridades) {
      const setor = t.colaborador.setor?.nome ?? "Sem setor";
      if (!porSetor.has(setor)) porSetor.set(setor, { telegram: [], email: [] });
      const grupo = porSetor.get(setor)!;
      if (t.colaborador.telegramChatId) grupo.telegram.push(t);
      else grupo.email.push(t);
    }

    for (const [setor, { telegram, email }] of porSetor.entries()) {
      let enviados = 0;
      let falhas = 0;

      // Telegram: sem limite
      for (const t of telegram) {
        const resultado = await enviarUmConvite({
          id: t.id,
          token: t.token,
          colaborador: t.colaborador,
          pesquisa: { titulo: pesquisa.titulo, anonima: pesquisa.anonima },
        });
        if (resultado.ok) enviados++;
        else falhas++;
      }

      // E-mail: respeitando limite
      for (const t of email) {
        if (restanteEmail <= 0) break;
        const resultado = await enviarUmConvite({
          id: t.id,
          token: t.token,
          colaborador: t.colaborador,
          pesquisa: { titulo: pesquisa.titulo, anonima: pesquisa.anonima },
        });
        if (resultado.ok) {
          enviados++;
          restanteEmail--;
        } else {
          // Teto batido no meio da rodada (outro caminho gastou cota enquanto
          // esta rodava): para tudo. Continuar só produziria uma recusa por
          // pessoa restante, inflando "falhas" com um problema que não é delas.
          if (resultado.semCota) {
            restanteEmail = 0;
            break;
          }
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
