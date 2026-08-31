import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { prazoEmTexto, diasAtePrazo } from "@/lib/delegacoes/consultas";
import { rotuloEvidencia, rotuloCriticidade } from "@/lib/constants-delegacoes";

// O módulo Delegações no Telegram — a parte de FALAR com a pessoa.
//
// Regra estrutural da ordem (§8): nenhuma ação essencial pode exigir o painel.
// Aceitar, repactuar, reportar e entregar precisam funcionar 100% pelo celular.
// Este arquivo monta as mensagens e os botões; quem interpreta o toque é
// `lib/delegacoes/telegram-webhook.ts`, chamado pelo webhook existente.
//
// QUAL CHAT RECEBE. O chat é do COLABORADOR (`Colaborador.telegramChatId`,
// vinculado quando a pessoa mandou /start ao bot). A demanda aponta para um
// `User`. A ponte é `User.colaboradorId` — a mesma do portal. Quem não tem
// ficha vinculada simplesmente não recebe por aqui, e isso é dito na tela de
// quem delega, não escondido.

/**
 * O `callback_data` de um botão. O Telegram limita a 64 BYTES, e o id é um
 * cuid de 25 caracteres — daí as abreviações: `d` de demanda, e duas letras
 * por ação. Sem isso o botão simplesmente não é entregue pelo Telegram.
 */
export type AcaoBotao = "ac" | "rp" | "ct" | "np" | "er" | "tv" | "en";

export function montarCallback(acao: AcaoBotao, demandaId: string): string {
  return `d:${acao}:${demandaId}`;
}

export function lerCallback(data: string): { acao: AcaoBotao; demandaId: string } | null {
  const partes = data.split(":");
  if (partes.length !== 3 || partes[0] !== "d") return null;
  const acoes: AcaoBotao[] = ["ac", "rp", "ct", "np", "er", "tv", "en"];
  if (!acoes.includes(partes[1] as AcaoBotao)) return null;
  if (!partes[2]) return null;
  return { acao: partes[1] as AcaoBotao, demandaId: partes[2] };
}

/** Os botões da demanda RECÉM-ENVIADA (spec §8). */
export function botoesDaDemandaNova(demandaId: string) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Aceito", callback_data: montarCallback("ac", demandaId) },
        { text: "📅 Repactuar prazo", callback_data: montarCallback("rp", demandaId) },
      ],
      [{ text: "❓ Preciso de contexto", callback_data: montarCallback("ct", demandaId) }],
    ],
  };
}

/** Os botões da COBRANÇA (spec §8). O motor que os dispara é o PR 5. */
export function botoesDaCobranca(demandaId: string) {
  return {
    inline_keyboard: [
      [
        { text: "✅ No prazo", callback_data: montarCallback("np", demandaId) },
        { text: "⚠️ Em risco", callback_data: montarCallback("er", demandaId) },
      ],
      [
        { text: "🚧 Travado", callback_data: montarCallback("tv", demandaId) },
        { text: "📎 Entregar", callback_data: montarCallback("en", demandaId) },
      ],
    ],
  };
}

type DemandaParaMensagem = {
  id: string;
  titulo: string;
  descricao: string | null;
  criterioAceite: string;
  evidenciaExigida: string;
  criticidade: number;
  prazo: Date;
  solicitante: { nome: string };
};

/**
 * A mensagem que a pessoa recebe ao ser delegada.
 *
 * O CRITÉRIO DE ACEITE VAI JUNTO, e isso não é enfeite: é o que ela está
 * aceitando quando toca em "✅ Aceito". Mandar só o título transformaria o
 * aceite num clique cego, e a primeira devolução de entrega viraria discussão
 * sobre o que tinha sido combinado.
 */
export function textoDaDemandaNova(d: DemandaParaMensagem): string {
  const dias = diasAtePrazo(d.prazo);
  const quando =
    dias === 0 ? "hoje" : dias === 1 ? "amanhã" : dias > 0 ? `em ${dias} dias` : "prazo já vencido";
  // TEXTO PURO, sem Markdown. `sendTelegramMessage` não manda `parse_mode`, e
  // com isso um `*negrito*` apareceria com os asteriscos à mostra. Pior: como
  // título e critério vêm de texto livre, um asterisco digitado por acaso
  // quebraria a formatação da mensagem inteira no dia em que alguém ligasse o
  // parse_mode. Sem marcação não há o que escapar.
  return [
    `📋 ${d.titulo}`,
    "",
    `Pedido por ${d.solicitante.nome}`,
    `Prazo: ${prazoEmTexto(d.prazo)} (${quando}) · ${rotuloCriticidade(d.criticidade)}`,
    "",
    d.descricao ?? "",
    d.descricao ? "" : null,
    `Fica pronto quando: ${d.criterioAceite}`,
    "",
    `Na entrega vou pedir: ${rotuloEvidencia(d.evidenciaExigida).toLowerCase()}.`,
  ]
    .filter((l): l is string => l !== null && l !== "")
    .join("\n");
}

export type ResultadoEnvio = { ok: true } | { ok: false; motivo: string };

/**
 * Manda a demanda para o responsável. Devolve o motivo quando não dá — e não
 * lança: falhar o envio não pode desfazer a demanda, que já está gravada e
 * continua válida no painel.
 */
export async function avisarDemandaEnviada(demandaId: string): Promise<ResultadoEnvio> {
  const demanda = await prisma.demanda.findUnique({
    where: { id: demandaId },
    select: {
      id: true,
      titulo: true,
      descricao: true,
      criterioAceite: true,
      evidenciaExigida: true,
      criticidade: true,
      prazo: true,
      status: true,
      solicitante: { select: { nome: true } },
      responsavel: { select: { nome: true, colaborador: { select: { telegramChatId: true } } } },
    },
  });
  if (!demanda) return { ok: false, motivo: "Demanda não encontrada." };

  const chatId = demanda.responsavel.colaborador?.telegramChatId;
  if (!chatId) {
    return {
      ok: false,
      motivo: `${demanda.responsavel.nome} ainda não vinculou o Telegram (precisa enviar /start ao bot do RH).`,
    };
  }

  const envio = await sendTelegramMessage(
    chatId,
    textoDaDemandaNova(demanda),
    botoesDaDemandaNova(demanda.id),
  );
  if (!envio.ok) return { ok: false, motivo: envio.error };

  // Toda cobrança enviada vira interação (spec §3.2) — é o que o digest e o
  // classificador leem depois, e é também o que diz a esta pessoa "de qual
  // demanda o próximo texto que você escrever está falando".
  await prisma.demandaInteracao.create({
    data: {
      demandaId: demanda.id,
      tipo: "ENVIADA",
      canal: "TELEGRAM",
      conteudo: "Demanda enviada ao responsável, com os botões de aceite.",
    },
  });

  return { ok: true };
}

type DemandaEntregueParaMensagem = {
  id: string;
  titulo: string;
  responsavel: { nome: string };
};

function textoDaEntrega(d: DemandaEntregueParaMensagem): string {
  return [
    `📦 ${d.titulo}`,
    "",
    `${d.responsavel.nome} entregou. Só falta a sua aprovação para encerrar.`,
  ].join("\n");
}

/**
 * Avisa o SOLICITANTE quando o responsável entrega — hoje o único jeito de
 * saber que uma entrega chegou é abrir o painel (`/delegacoes/delegadas`), e
 * ninguém é avisado disso nem por Telegram nem por e-mail. Mesmo contrato de
 * `avisarDemandaEnviada`: nunca lança, e quem chama decide se a falha vira
 * aviso na tela — a entrega já está gravada de qualquer jeito.
 *
 * SÓ o link: aprovar/devolver continuam exigindo o painel (regra 3 mora na
 * máquina de estados e no `where` de cada action, não é reimplementada aqui).
 */
export async function avisarDemandaEntregue(demandaId: string): Promise<ResultadoEnvio> {
  const demanda = await prisma.demanda.findUnique({
    where: { id: demandaId },
    select: {
      id: true,
      titulo: true,
      responsavel: { select: { nome: true } },
      solicitante: { select: { nome: true, colaborador: { select: { telegramChatId: true } } } },
    },
  });
  if (!demanda) return { ok: false, motivo: "Demanda não encontrada." };

  const chatId = demanda.solicitante.colaborador?.telegramChatId;
  if (!chatId) {
    return {
      ok: false,
      motivo: `${demanda.solicitante.nome} ainda não vinculou o Telegram (precisa enviar /start ao bot do RH).`,
    };
  }

  const linkDemanda = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/delegacoes/${demanda.id}`;
  const envio = await sendTelegramMessage(
    chatId,
    `${textoDaEntrega(demanda)}\n\nAbrir: ${linkDemanda}`,
  );
  if (!envio.ok) return { ok: false, motivo: envio.error };

  await prisma.demandaInteracao.create({
    data: {
      demandaId: demanda.id,
      tipo: "ENVIADA",
      canal: "TELEGRAM",
      conteudo: "Entrega avisada ao solicitante, com o link para aprovar ou devolver.",
    },
  });

  return { ok: true };
}

/**
 * Avisa o RESPONSÁVEL quando o solicitante dá baixa direta na demanda
 * (concluída sem entrega formal) — sem este aviso a pessoa continuaria
 * trabalhando numa demanda que já morreu. Mesmo contrato dos irmãos acima:
 * nunca lança, a baixa já está gravada de qualquer jeito.
 */
export async function avisarDemandaConcluidaDireto(demandaId: string): Promise<ResultadoEnvio> {
  const demanda = await prisma.demanda.findUnique({
    where: { id: demandaId },
    select: {
      id: true,
      titulo: true,
      solicitante: { select: { nome: true } },
      responsavel: { select: { nome: true, colaborador: { select: { telegramChatId: true } } } },
    },
  });
  if (!demanda) return { ok: false, motivo: "Demanda não encontrada." };

  const chatId = demanda.responsavel.colaborador?.telegramChatId;
  if (!chatId) {
    return {
      ok: false,
      motivo: `${demanda.responsavel.nome} ainda não vinculou o Telegram (precisa enviar /start ao bot do RH).`,
    };
  }

  const envio = await sendTelegramMessage(
    chatId,
    [
      `✅ ${demanda.titulo}`,
      "",
      `${demanda.solicitante.nome} deu baixa nesta demanda como concluída — você não precisa mais entregar nada nela.`,
    ].join("\n"),
  );
  if (!envio.ok) return { ok: false, motivo: envio.error };

  await prisma.demandaInteracao.create({
    data: {
      demandaId: demanda.id,
      tipo: "ENVIADA",
      canal: "TELEGRAM",
      conteudo: "Baixa direta avisada ao responsável — a demanda foi concluída pelo solicitante.",
    },
  });

  return { ok: true };
}
