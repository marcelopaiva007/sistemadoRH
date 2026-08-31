import { prisma } from "@/lib/prisma";
import { answerCallbackQuery, removerBotoes, sendTelegramMessage } from "@/lib/telegram";
import { validarReporte, validarTransicao } from "@/lib/delegacoes/estados";
import { diasAtePrazo, prazoEmTexto } from "@/lib/delegacoes/consultas";
import { avisarDemandaEntregue, botoesDaCobranca, lerCallback } from "@/lib/delegacoes/telegram";
import { avisarDemandaEntreguePorEmail } from "@/lib/delegacoes/email";
import { classificarInteracao } from "@/lib/delegacoes/classificar";

// O que acontece quando a pessoa TOCA num botão ou ESCREVE no bot.
//
// Este arquivo é a metade que faltava: até aqui o webhook (app/api/telegram/
// webhook/route.ts) só entendia `message`, e ignorava `callback_query` — ou
// seja, botão inline não fazia nada. É extensão ADITIVA: o webhook chama estas
// funções e, se elas disserem "não é comigo", segue com o fluxo do portal
// exatamente como antes.
//
// A REGRA QUE MANDA AQUI é a mesma das telas: `validarTransicao` decide, não
// este arquivo. Um toque em "✅ Aceito" numa demanda já aceita, ou de quem não
// é o responsável, é recusado pela máquina — e a pessoa recebe o mesmo motivo
// em português que veria no painel.

const NAO_VINCULADO =
  "Não consegui identificar você. Envie /start e toque em \"📱 Compartilhar meu número\".";

/**
 * Quem está falando, a partir do chat: chat → Colaborador → User.
 *
 * A demanda aponta para um `User` (regra 1, dono único) e o chat conhece o
 * COLABORADOR. A ponte é `User.colaboradorId`, resolvida aqui a cada update —
 * nunca vinda do próprio update, que é dado de fora.
 */
async function quemFala(chatId: string) {
  const colaborador = await prisma.colaborador.findFirst({
    where: { telegramChatId: chatId, ativo: true },
    select: { id: true, usuario: { select: { id: true, nome: true, ativo: true } } },
  });
  if (!colaborador?.usuario || !colaborador.usuario.ativo) return null;
  return { userId: colaborador.usuario.id, nome: colaborador.usuario.nome };
}

/** Carrega a demanda no formato que a máquina de estados entende. */
async function demandaDe(demandaId: string, userId: string) {
  const d = await prisma.demanda.findFirst({
    // O `where` já amarra a demanda ao dono: o id do botão vem de fora, e sem
    // isto um `callback_data` forjado agiria na demanda de outra pessoa.
    where: { id: demandaId, responsavelId: userId },
    select: {
      id: true,
      titulo: true,
      status: true,
      solicitanteId: true,
      responsavelId: true,
      evidenciaExigida: true,
      emRisco: true,
      prazo: true,
    },
  });
  return d;
}

/**
 * O texto que a pessoa escreve depois de tocar num botão precisa saber A QUAL
 * DEMANDA pertence. Em vez de inventar uma tabela de estado, usamos o que já
 * existe: a última interação ENVIADA por Telegram para uma demanda dela. É
 * literalmente "sobre o que estávamos conversando", e a tabela de interações
 * existe justamente para isso (spec §3.2).
 *
 * A janela de 24h evita que uma resposta solta de dias depois seja grudada
 * numa conversa esquecida — nesse caso o bot pergunta em vez de adivinhar.
 */
const HORAS_DE_CONTEXTO = 24;

async function demandaEmConversa(userId: string) {
  const desde = new Date(Date.now() - HORAS_DE_CONTEXTO * 60 * 60 * 1000);
  const ultima = await prisma.demandaInteracao.findFirst({
    where: {
      tipo: "ENVIADA",
      canal: "TELEGRAM",
      createdAt: { gte: desde },
      demanda: { responsavelId: userId, status: { in: ["ENVIADA", "ACEITA", "EM_EXECUCAO"] } },
    },
    orderBy: { createdAt: "desc" },
    select: { demandaId: true },
  });
  return ultima?.demandaId ?? null;
}

/** Registra o evento do log imutável, com o autor do Telegram. */
async function evento(demandaId: string, tipo: string, autor: { userId: string; nome: string }) {
  await prisma.demandaEvento.create({
    data: { demandaId, tipoEvento: tipo, autorId: autor.userId, autorNome: autor.nome },
  });
}

export type TratamentoCallback = { tratado: boolean };

/**
 * O toque num botão. Devolve `tratado: false` quando o `callback_data` não é
 * de Delegações — aí o webhook segue com o que quer que venha a existir.
 */
export async function tratarCallbackDelegacoes(params: {
  callbackQueryId: string;
  chatId: string;
  messageId?: number;
  data: string;
}): Promise<TratamentoCallback> {
  const lido = lerCallback(params.data);
  if (!lido) return { tratado: false };

  const autor = await quemFala(params.chatId);
  if (!autor) {
    await answerCallbackQuery(params.callbackQueryId, "Não identifiquei você.", true);
    await sendTelegramMessage(params.chatId, NAO_VINCULADO);
    return { tratado: true };
  }

  const demanda = await demandaDe(lido.demandaId, autor.userId);
  if (!demanda) {
    await answerCallbackQuery(params.callbackQueryId, "Demanda não encontrada.", true);
    return { tratado: true };
  }

  const responder = async (texto: string, comBotoes = false) => {
    await sendTelegramMessage(
      params.chatId,
      texto,
      comBotoes ? botoesDaCobranca(demanda.id) : undefined,
    );
  };

  switch (lido.acao) {
    case "ac": {
      const veredito = validarTransicao("ACEITAR", demanda, autor.userId);
      if (!veredito.ok) {
        await answerCallbackQuery(params.callbackQueryId, veredito.erro, true);
        return { tratado: true };
      }
      const { count } = await prisma.demanda.updateMany({
        where: { id: demanda.id, status: demanda.status },
        data: { status: "ACEITA", aceiteEm: new Date() },
      });
      if (count === 0) {
        await answerCallbackQuery(params.callbackQueryId, "A demanda mudou. Veja a mensagem nova.", true);
        return { tratado: true };
      }
      await evento(demanda.id, "ACEITA", autor);
      await answerCallbackQuery(params.callbackQueryId, "Aceite registrado.");
      if (params.messageId) await removerBotoes(params.chatId, params.messageId);
      await responder(
        `✅ Combinado. "${demanda.titulo}" está com você, para ${prazoEmTexto(demanda.prazo)}.\n\n` +
          "Quando quiser, escreva aqui como está indo — ou toque em 📎 Entregar quando terminar.",
        true,
      );
      return { tratado: true };
    }

    case "np": {
      // "No prazo" é um reporte curto, e vale como tal: vira interação e
      // dispara o início da execução, exatamente como o texto faria.
      await registrarReporte(demanda, autor, "Está no prazo.");
      await answerCallbackQuery(params.callbackQueryId, "Anotado: no prazo.");
      if (params.messageId) await removerBotoes(params.chatId, params.messageId);
      return { tratado: true };
    }

    case "er":
    case "tv": {
      const risco = lido.acao === "er";
      await registrarReporte(
        demanda,
        autor,
        risco ? "Sinalizou que está em risco." : "Sinalizou que está travado.",
      );
      // A flag de risco é ortogonal ao status e pode ser ligada pelas duas
      // pontas — aqui é a própria pessoa dizendo.
      await prisma.demanda.updateMany({
        where: { id: demanda.id, status: { in: ["ACEITA", "EM_EXECUCAO"] } },
        data: { emRisco: true },
      });
      await evento(demanda.id, "EM_RISCO_LIGADO", autor);
      await answerCallbackQuery(params.callbackQueryId, "Anotado.");
      if (params.messageId) await removerBotoes(params.chatId, params.messageId);
      await responder(
        risco
          ? "Anotei que está em risco. Escreva aqui o que está atrapalhando — quem pediu vai ler."
          : "Anotei que está travado. Escreva aqui o que (ou quem) está travando — quem pediu vai ler.",
      );
      return { tratado: true };
    }

    case "rp": {
      await answerCallbackQuery(params.callbackQueryId, "Me diga a data nova.");
      await responder(
        `📅 Para quando você consegue "${demanda.titulo}"?\n\n` +
          "Responda com a data e o motivo, assim: 15/09 fornecedor atrasou o orçamento.\n" +
          "O prazo combinado fica registrado — repactuar não apaga.",
      );
      return { tratado: true };
    }

    case "ct": {
      await answerCallbackQuery(params.callbackQueryId, "Vou avisar quem pediu.");
      await registrarReporte(demanda, autor, "Pediu mais contexto sobre a demanda.");
      await responder(
        "Anotei que falta contexto. Escreva aqui a sua dúvida — ela vai para quem pediu.",
      );
      return { tratado: true };
    }

    case "en": {
      const veredito = validarTransicao("ENTREGAR", demanda, autor.userId, {
        evidenciaTexto: "?",
        arquivoId: null,
      });
      if (!veredito.ok) {
        await answerCallbackQuery(params.callbackQueryId, veredito.erro, true);
        return { tratado: true };
      }
      await answerCallbackQuery(params.callbackQueryId, "Me mande a evidência.");
      await responder(
        `📎 Para entregar "${demanda.titulo}", responda esta mensagem com a evidência.\n\n` +
          "Quem pediu vai conferir assim: " +
          demanda.evidenciaExigida.toLowerCase() +
          ".\n\nEscreva ENTREGA seguido da prova. Ex.: ENTREGA https://... (ou o número, ou o texto).",
      );
      return { tratado: true };
    }
  }
}

/**
 * Reporte curto vindo de botão — mesma regra do reporte por texto. Devolve o
 * id da interação criada (ou null se a máquina recusou) para quem chamar
 * decidir se manda pro classificador — os botões (np/er/tv/ct) já dizem
 * exatamente o que aconteceu, sem precisar de IA para interpretar; só o
 * TEXTO LIVRE (chamador em `tratarTextoDelegacoes`) classifica.
 */
async function registrarReporte(
  demanda: { id: string; status: string; solicitanteId: string; responsavelId: string; evidenciaExigida: string },
  autor: { userId: string; nome: string },
  conteudo: string,
): Promise<string | null> {
  const veredito = validarReporte(demanda, autor.userId, conteudo);
  if (!veredito.ok) return null;
  if (demanda.status === "ACEITA") {
    const { count } = await prisma.demanda.updateMany({
      where: { id: demanda.id, status: "ACEITA" },
      data: { status: "EM_EXECUCAO" },
    });
    if (count > 0) await evento(demanda.id, "EXECUCAO_INICIADA", autor);
  }
  const interacao = await prisma.demandaInteracao.create({
    data: { demandaId: demanda.id, tipo: "RECEBIDA", canal: "TELEGRAM", conteudo },
    select: { id: true },
  });
  return interacao.id;
}

/**
 * O TEXTO LIVRE. Devolve `tratado: false` quando não há conversa de demanda
 * aberta — e é ISSO que preserva o fluxo do portal: quem manda CPF, /start ou
 * /portal continua caindo no caminho de sempre, porque não tem demanda em
 * conversa.
 */
export async function tratarTextoDelegacoes(params: {
  chatId: string;
  texto: string;
}): Promise<TratamentoCallback> {
  const texto = params.texto.trim();
  if (!texto || texto.startsWith("/")) return { tratado: false };

  const autor = await quemFala(params.chatId);
  if (!autor) return { tratado: false };

  const demandaId = await demandaEmConversa(autor.userId);
  if (!demandaId) return { tratado: false };

  const demanda = await demandaDe(demandaId, autor.userId);
  if (!demanda) return { tratado: false };

  // ENTREGA <evidência> — a entrega pelo celular, sem passar pelo painel.
  const entrega = texto.match(/^entrega\s+([\s\S]+)$/i);
  if (entrega) {
    const evidencia = entrega[1].trim();
    const veredito = validarTransicao("ENTREGAR", demanda, autor.userId, {
      evidenciaTexto: evidencia,
      arquivoId: null,
    });
    if (!veredito.ok) {
      await sendTelegramMessage(params.chatId, veredito.erro);
      return { tratado: true };
    }
    const { count } = await prisma.demanda.updateMany({
      where: { id: demanda.id, status: demanda.status },
      data: { status: "ENTREGUE" },
    });
    if (count === 0) {
      await sendTelegramMessage(params.chatId, "A demanda mudou enquanto você escrevia. Confira no portal.");
      return { tratado: true };
    }
    await prisma.demandaEntrega.create({
      data: {
        demandaId: demanda.id,
        evidenciaTipo: demanda.evidenciaExigida,
        evidenciaTexto: evidencia,
      },
    });
    await evento(demanda.id, "ENTREGUE", autor);
    await sendTelegramMessage(
      params.chatId,
      `✅ Entregue: "${demanda.titulo}".\n\nAgora é com quem pediu — só ele encerra.`,
    );
    // Mesmo aviso que a entrega pelo painel dispara (lib/actions/delegacoes.ts
    // `entregarDemanda`) — sem ele quem pediu nunca fica sabendo que a entrega
    // chegou, nem por Telegram nem por e-mail, e só descobre abrindo o painel.
    await Promise.all([avisarDemandaEntregue(demanda.id), avisarDemandaEntreguePorEmail(demanda.id)]);
    return { tratado: true };
  }

  // dd/mm + motivo — a repactuação pelo celular.
  const repacto = texto.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+([\s\S]{3,})$/);
  if (repacto) {
    const prazoNovo = dataDeDiaMes(repacto[1], repacto[2], repacto[3]);
    const motivo = repacto[4].trim();
    if (!prazoNovo) {
      await sendTelegramMessage(params.chatId, "Não entendi a data. Tente assim: 15/09 motivo.");
      return { tratado: true };
    }
    const anterior = demanda.prazo;
    const { count } = await prisma.demanda.updateMany({
      where: { id: demanda.id, status: demanda.status, prazo: anterior },
      data: { prazo: prazoNovo },
    });
    if (count === 0) {
      await sendTelegramMessage(params.chatId, "A demanda mudou enquanto você escrevia. Confira no portal.");
      return { tratado: true };
    }
    await prisma.demandaRepactuacao.create({
      data: {
        demandaId: demanda.id,
        prazoAnterior: anterior,
        prazoNovo,
        motivo,
        autorId: autor.userId,
        autorNome: autor.nome,
      },
    });
    await evento(demanda.id, "REPACTUADA", autor);
    await sendTelegramMessage(
      params.chatId,
      `📅 Prazo de "${demanda.titulo}" agora é ${prazoEmTexto(prazoNovo)}.\n\n` +
        `O combinado original (${prazoEmTexto(anterior)}) fica registrado, com o seu motivo.`,
    );
    return { tratado: true };
  }

  // Qualquer outro texto é reporte de andamento — o caso mais comum, e o
  // único que passa pelo classificador (PR 6): é TEXTO LIVRE de verdade, ao
  // contrário dos botões (np/er/tv/ct), que já dizem o que aconteceu sem
  // precisar de leitura nenhuma.
  const veredito = validarReporte(demanda, autor.userId, texto);
  if (!veredito.ok) {
    await sendTelegramMessage(params.chatId, veredito.erro);
    return { tratado: true };
  }
  const interacaoId = await registrarReporte(demanda, autor, texto);
  if (interacaoId) await classificarInteracao(demanda.id, interacaoId);
  const dias = diasAtePrazo(demanda.prazo);
  await sendTelegramMessage(
    params.chatId,
    `Anotado em "${demanda.titulo}". ` +
      (dias < 0 ? "O prazo já venceu." : `Faltam ${dias} dia(s) para ${prazoEmTexto(demanda.prazo)}.`),
  );
  return { tratado: true };
}

/**
 * "15/09" vira uma data no fim daquele dia em Brasília — a mesma âncora do
 * `<input type="date">` do painel (`prazoDoFormulario`). Sem ano informado,
 * assume o próximo ocorrido: em dezembro, "05/01" é janeiro do ano que vem, e
 * não uma data dez meses no passado.
 */
function dataDeDiaMes(dia: string, mes: string, ano?: string): Date | null {
  const d = Number(dia);
  const m = Number(mes);
  if (d < 1 || d > 31 || m < 1 || m > 12) return null;

  const hojeSp = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const anoAtual = Number(hojeSp.slice(0, 4));
  let a = ano ? Number(ano.length === 2 ? `20${ano}` : ano) : anoAtual;

  const monta = (anoAlvo: number) => {
    const iso = `${anoAlvo}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const data = new Date(`${iso}T23:59:59-03:00`);
    // Recusa data impossível (30/02 rolaria para março).
    const conferindo = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(data);
    return conferindo === iso ? data : null;
  };

  let resultado = monta(a);
  if (!ano && resultado && resultado.toISOString().slice(0, 10) < hojeSp) {
    a += 1;
    resultado = monta(a);
  }
  return resultado;
}
