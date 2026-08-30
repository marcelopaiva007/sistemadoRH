import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { CHAVE_ANTHROPIC, segredo } from "@/lib/segredos";
import { sendTelegramMessage } from "@/lib/telegram";
import { sendEmail } from "@/lib/email";
import { diasAtePrazo, prazoEmTexto } from "@/lib/delegacoes/consultas";
import {
  ESQUEMA_CLASSIFICACAO,
  montarSistemaClassificador,
  normalizarClassificacao,
  type ClassificacaoBruta,
} from "@/lib/delegacoes/classificador";

// A METADE IMPURA do classificador (spec §7): carrega o retrato da demanda,
// fala com a Anthropic, grava o resultado na interação, e ROTEIA — que é a
// parte que a spec chama de "filtro que protege a Direção":
//
//   NO_PRAZO              → só grava. Ninguém é avisado além do que já ia ser.
//   EM_RISCO               → liga emRisco + oferece repactuação ao responsável.
//   TRAVADO_DEPENDENCIA    → liga emRisco + registra o bloqueador no evento.
//   PRECISA_DECISAO_SUA    → notifica a Direção NA HORA (Telegram + e-mail).
//
// Mesmo molde de lib/actions/delegacoes-ia.ts: modelo claude-sonnet-5, tool
// forçada (JSON estrito, sem markdown — a exigência literal da spec), chave
// vinda cifrada do banco. Chamado de dois lugares — o texto livre do
// Telegram (lib/delegacoes/telegram-webhook.ts) e o reporte do painel
// (lib/actions/delegacoes.ts::reportarProgresso) — sempre DEPOIS de a
// interação já estar gravada: falhar aqui nunca desfaz o reporte.

const MODELO = "claude-sonnet-5";
const MAX_TOKENS = 1500;
const LIMITE_TEXTO = 2000;

/**
 * Classifica UMA interação RECEBIDA e roteia. Nunca lança — uma falha aqui
 * (sem chave, API fora, texto vazio) é logada e ignorada: o reporte que a
 * gerou já está gravado e vale, com ou sem a leitura da IA.
 */
export async function classificarInteracao(demandaId: string, interacaoId: string): Promise<void> {
  try {
    const [demanda, interacao, repactuacoes] = await Promise.all([
      prisma.demanda.findUnique({
        where: { id: demandaId },
        select: {
          id: true,
          titulo: true,
          criterioAceite: true,
          prazo: true,
          solicitante: {
            select: { nome: true, email: true, colaborador: { select: { telegramChatId: true } } },
          },
          responsavel: {
            select: { nome: true, colaborador: { select: { telegramChatId: true } } },
          },
        },
      }),
      prisma.demandaInteracao.findUnique({ where: { id: interacaoId }, select: { conteudo: true } }),
      prisma.demandaRepactuacao.findMany({
        where: { demandaId },
        orderBy: { createdAt: "asc" },
        select: { motivo: true, prazoNovo: true },
      }),
    ]);
    if (!demanda || !interacao) return;

    const texto = interacao.conteudo.trim().slice(0, LIMITE_TEXTO);
    if (!texto) return;

    const chave = await segredo(CHAVE_ANTHROPIC);
    if (!chave) return; // IA desligada — o reporte já está gravado, só não é lido.

    const anthropic = new Anthropic({ apiKey: chave });
    const resposta = await anthropic.messages.create({
      model: MODELO,
      max_tokens: MAX_TOKENS,
      output_config: { effort: "low" },
      system: montarSistemaClassificador({
        titulo: demanda.titulo,
        criterioAceite: demanda.criterioAceite,
        prazoTexto: prazoEmTexto(demanda.prazo),
        diasRestantes: diasAtePrazo(demanda.prazo),
        repactuacoes: repactuacoes.map((r) => ({ data: prazoEmTexto(r.prazoNovo), motivo: r.motivo })),
      }),
      tools: [
        {
          name: "classificar_resposta",
          description: "Classifica a resposta do responsável sobre a demanda.",
          input_schema: ESQUEMA_CLASSIFICACAO,
        },
      ],
      tool_choice: { type: "tool", name: "classificar_resposta" },
      messages: [{ role: "user", content: texto }],
    });

    if (resposta.stop_reason === "refusal") return;
    const chamada = resposta.content.find((c) => c.type === "tool_use");
    if (!chamada || chamada.type !== "tool_use") return;

    const normalizado = normalizarClassificacao(chamada.input as ClassificacaoBruta);
    if (!normalizado.ok) return;
    const { resultado } = normalizado;

    await prisma.demandaInteracao.update({
      where: { id: interacaoId },
      data: { classificacaoIa: resultado.classificacao, confiancaIa: resultado.confianca },
    });

    if (resultado.classificacao === "NO_PRAZO") return; // spec: Direção não é notificada, fica só no digest.

    if (resultado.classificacao === "EM_RISCO") {
      await prisma.demanda.updateMany({
        where: { id: demandaId, status: { in: ["ACEITA", "EM_EXECUCAO"] } },
        data: { emRisco: true },
      });
      await registrarEscalada(demandaId, resultado);
      await ofertarRepactuacao(demanda, resultado);
      return;
    }

    if (resultado.classificacao === "TRAVADO_DEPENDENCIA") {
      await prisma.demanda.updateMany({
        where: { id: demandaId, status: { in: ["ACEITA", "EM_EXECUCAO"] } },
        data: { emRisco: true },
      });
      await registrarEscalada(demandaId, resultado);
      return;
    }

    // PRECISA_DECISAO_SUA — a única que interrompe a Direção na hora.
    await registrarEscalada(demandaId, resultado);
    await notificarSolicitante(demanda, resultado, interacaoId);
  } catch (e) {
    console.error(`[classificar] falhou na interação ${interacaoId}:`, e);
  }
}

async function registrarEscalada(
  demandaId: string,
  resultado: { classificacao: string; bloqueador: string | null; resumo: string; confianca: number },
) {
  await prisma.demandaEvento.create({
    data: {
      demandaId,
      tipoEvento: "ESCALADA",
      autorId: null,
      autorNome: "sistema",
      dados: {
        origem: "classificador",
        classificacao: resultado.classificacao,
        bloqueador: resultado.bloqueador,
        resumo: resultado.resumo,
        confianca: resultado.confianca,
      },
    },
  });
}

type PartesPessoa = {
  nome: string;
  email?: string | null;
  colaborador: { telegramChatId: string | null } | null;
};

/**
 * EM_RISCO: "o sistema oferece repactuação ao responsável" — mesmo convite
 * que o botão "📅 Repactuar prazo" já manda, para não inventar um segundo
 * texto para a mesma pergunta.
 */
async function ofertarRepactuacao(
  demanda: { titulo: string; responsavel: PartesPessoa },
  resultado: { resumo: string },
) {
  const chatId = demanda.responsavel.colaborador?.telegramChatId;
  if (!chatId) return;
  await sendTelegramMessage(
    chatId,
    `Entendi: "${resultado.resumo}"\n\n` +
      `Para quando você consegue "${demanda.titulo}"?\n\n` +
      "Responda com a data e o motivo, assim: 15/09 fornecedor atrasou o orçamento.",
  );
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * PRECISA_DECISAO_SUA: notifica quem PEDIU (o solicitante — não a Direção em
 * geral, é a pessoa que vai decidir) imediatamente, Telegram e e-mail.
 */
async function notificarSolicitante(
  demanda: { titulo: string; solicitante: PartesPessoa },
  resultado: { resumo: string; bloqueador: string | null },
  interacaoId: string,
) {
  const texto = [
    `❗ "${demanda.titulo}" precisa de uma decisão sua`,
    "",
    resultado.resumo,
  ].join("\n");

  const chatId = demanda.solicitante.colaborador?.telegramChatId;
  const promessas: Promise<unknown>[] = [];
  if (chatId) promessas.push(sendTelegramMessage(chatId, texto));
  if (demanda.solicitante.email) {
    promessas.push(
      sendEmail({
        to: demanda.solicitante.email,
        fromName: "Delegações",
        subject: `[Delegações] Precisa da sua decisão — ${demanda.titulo}`,
        text: texto,
        html: `<p>${esc(texto).replace(/\n/g, "<br/>")}</p>`,
        chave: `delegacoes-decisao:${interacaoId}`,
      }),
    );
  }
  await Promise.all(promessas);
}
