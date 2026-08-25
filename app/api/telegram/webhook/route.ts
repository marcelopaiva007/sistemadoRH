// Webhook do bot do Telegram (@Marcelo_Paiva_07_bot) — vínculo automático do
// telegramChatId dos colaboradores e porta de entrada do portal.
//
// Fluxo para o colaborador:
//   1. /start no bot -> o bot pede para tocar em "📱 Compartilhar meu número".
//   2. O contato chega aqui; casamos o número com Colaborador.telefone
//      (importado do elleven) pelos últimos 8 dígitos.
//   3. Match único -> grava telegramChatId. Sem match/ambíguo -> pede o CPF,
//      que casa com Colaborador.cpf.
//   4. /portal -> manda para AQUELE chat um link de vida curta e uso único do
//      portal do colaborador. É o bot fazendo o papel de login: para entrar é
//      preciso controlar o Telegram já vinculado àquela pessoa.
//
// Segurança: o setWebhook registra um secret_token derivado do token do bot
// (lib/telegram.ts); o Telegram devolve esse valor em cada update no header
// x-telegram-bot-api-secret-token, e recusamos qualquer chamada sem ele.
// Sempre respondemos 200 para updates entendidos ou não — o Telegram reenvia
// updates com resposta != 2xx e isso viraria fila infinita de retries.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { conferirNascimento, extrairCpfEData } from "@/lib/telegram-identidade";
import { sendTelegramMessage, telegramWebhookSecret } from "@/lib/telegram";
import { criarLinkDeAcesso, MINUTOS_VALIDADE_LINK } from "@/lib/portal-auth";
import { sufixoTelefone } from "@/lib/telefone";

export const runtime = "nodejs";

type TelegramUpdate = {
  message?: {
    chat?: { id?: number | string };
    from?: { id?: number | string; first_name?: string };
    text?: string;
    contact?: { phone_number?: string; user_id?: number | string };
  };
};

const TECLADO_CONTATO = {
  keyboard: [[{ text: "📱 Compartilhar meu número", request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};
const REMOVER_TECLADO = { remove_keyboard: true };

// Sem nome de marca: no /start ainda não sabemos quem é a pessoa, e citar uma
// marca do grupo diante de quem é de outra soa como mensagem trocada.
const MSG_BOAS_VINDAS =
  "Olá! Aqui é o RH. 👋\n\n" +
  "Para vincular seu Telegram ao sistema de RH (e receber as pesquisas por aqui), " +
  "toque no botão \"📱 Compartilhar meu número\" abaixo.\n\n" +
  "Se o botão não aparecer, envie seu CPF e sua data de nascimento numa " +
  "mensagem só (ex.: 12345678900 15/03/1990).";
const MSG_PORTAL_SEM_VINCULO =
  "Antes de abrir o portal preciso saber quem é você. 🙂\n\n" +
  "Envie /start e toque em \"📱 Compartilhar meu número\".";
const MSG_PORTAL_LINK_RECENTE =
  "Acabei de te mandar um link aqui em cima — use aquele. ⬆️\n\n" +
  "Se ele já não valer mais, peça /portal de novo daqui a pouco.";
const MSG_PORTAL_INDISPONIVEL =
  "O portal está indisponível no momento. Procure o RH. 🙏";
const MSG_PEDIR_CPF =
  "Não encontrei seu número no cadastro. 🤔\n\n" +
  "Para confirmar que é você, envie seu CPF e sua data de nascimento numa " +
  "mensagem só, assim:\n\n12345678900 15/03/1990";
const MSG_PEDIR_DATA =
  "Quase lá! Preciso também da sua data de nascimento, para confirmar que é " +
  "você. Envie CPF e data juntos, assim:\n\n12345678900 15/03/1990";
const MSG_CPF_NAO_ENCONTRADO =
  "CPF não encontrado no cadastro de colaboradores. Confira os números ou procure o RH.";
const MSG_DATA_NAO_CONFERE =
  "A data de nascimento não confere com o cadastro. 🔒\n\n" +
  "Confira o dia/mês/ano e tente de novo. Se persistir, procure o RH.";
const MSG_SEM_NASCIMENTO =
  "Achei seu cadastro, mas ele ainda não tem a data de nascimento para eu " +
  "confirmar que é você. Procure o RH para completar a ficha e liberar o acesso.";

function digitos(s: string): string {
  return (s || "").replace(/\D/g, "");
}

/**
 * Marca da empresa do colaborador — nunca as três do grupo.
 *
 * Quem é da Centrysol ou da VAPT recebendo mensagem assinada "LM Telecom" lê
 * como e-mail trocado, e é o primeiro contato do RH pelo canal novo.
 */
async function marcaDo(colaboradorId: string): Promise<string> {
  const c = await prisma.colaborador.findUnique({
    where: { id: colaboradorId },
    select: { empresa: { select: { marca: { select: { nome: true } } } } },
  });
  return c?.empresa.marca.nome ?? "RH";
}

async function vincular(
  chatId: string,
  colaborador: { id: string; nome: string; cpf: string | null; telegramChatId: string | null }
): Promise<void> {
  const jaDono = await prisma.colaborador.findFirst({
    where: { telegramChatId: chatId, NOT: { id: colaborador.id } },
    select: { id: true, nome: true, cpf: true },
  });
  if (jaDono) {
    // Mesmo CPF em outra ficha = a MESMA pessoa cadastrada duas vezes (o grupo
    // tem vários CNPJs e a base veio de importações por razão social). Em
    // 12/08/2026 isso travou um colaborador real: o CPF dele achava a ficha B,
    // o chat estava na ficha A, e o bot o recusava como se fosse "outro
    // colaborador" — dele mesmo. Pessoa igual não é conflito — mas só
    // confirmar sem mover o chat também não resolve: na transferência de CNPJ
    // a ficha antiga é desativada, e o chat preso nela deixa o /portal sem
    // ficha ativa ("faça /start") enquanto o /start responde "já vinculado" —
    // loop sem saída. O chat SEGUE a pessoa: sai da ficha antiga e entra na
    // ficha que os caminhos de busca escolheram (sempre uma ficha ativa).
    if (jaDono.cpf && colaborador.cpf && digitos(jaDono.cpf) === digitos(colaborador.cpf)) {
      await prisma.$transaction([
        prisma.colaborador.update({ where: { id: jaDono.id }, data: { telegramChatId: null } }),
        prisma.colaborador.update({ where: { id: colaborador.id }, data: { telegramChatId: chatId } }),
      ]);
      await sendTelegramMessage(
        chatId,
        `Você já está vinculado, ${colaborador.nome.split(" ")[0]}! ✅\n\n` +
          "Envie /portal quando quiser consultar suas férias, seus dados e seus documentos.",
        REMOVER_TECLADO
      );
      return;
    }
    // Pessoas diferentes: dizer O NOME de quem segura o chat é o que destrava.
    // A mensagem antiga mandava "procurar o RH" sem pista nenhuma — e o RH não
    // tinha como adivinhar em qual das centenas de fichas o chat estava. Só o
    // primeiro nome, para quem está com este Telegram na mão: é informação
    // mínima e suficiente para o RH achar a ficha e limpar o campo.
    await sendTelegramMessage(
      chatId,
      `Este Telegram já está vinculado a ${jaDono.nome.split(" ")[0]}. 🤔\n\n` +
        "Se vocês dividem o aparelho, cada um precisa do próprio Telegram para usar o portal.\n\n" +
        "Se não for isso, procure o RH e diga esse nome — o vínculo é ajustado na ficha do colaborador.",
      REMOVER_TECLADO
    );
    return;
  }
  if (colaborador.telegramChatId === chatId) {
    await sendTelegramMessage(
      chatId,
      `Você já está vinculado, ${colaborador.nome.split(" ")[0]}! ✅`,
      REMOVER_TECLADO
    );
    return;
  }
  // A FICHA JÁ TEM OUTRO TELEGRAM: não se toma o lugar de ninguém.
  //
  // As guardas acima protegem o CHAT de quem está falando (este Telegram já
  // pertence a outra ficha?) — nunca protegiam a FICHA de destino. Como CPF não
  // é segredo (está na ficha, o DP conhece, e o próprio bot pede para digitar),
  // qualquer pessoa com um Telegram ainda não vinculado podia mandar o CPF de
  // um colega e SOBRESCREVER o vínculo dele: a partir daí, /portal abria as
  // férias, os dados e os documentos da vítima — e ela perdia o acesso sem
  // entender por quê.
  //
  // O caso legítimo de mover o chat (transferência de CNPJ, mesma pessoa em
  // duas fichas) já é tratado acima, no ramo em que os CPFs batem.
  // A pergunta é sobre o CPF, NÃO sobre esta ficha. `fichaAtivaPorCpf` prefere
  // de propósito uma ficha SEM chat (é o que destrava a transferência de CNPJ),
  // então perguntar só `colaborador.telegramChatId` deixava a porta aberta: a
  // vítima com duas fichas do mesmo CPF (o schema permite — `@@unique([empresaId,
  // cpf])`) tem a ficha A com o chat dela e a ficha B sem chat; o atacante caía
  // na B, a guarda não disparava, e o /portal — que busca por chatId — passava a
  // devolver os dados da vítima.
  const cpfDigitos = digitos(colaborador.cpf ?? "");
  const jaVinculadaPeloCpf = cpfDigitos
    ? await prisma.colaborador.findFirst({
        where: { cpf: cpfDigitos, telegramChatId: { not: null }, NOT: { telegramChatId: chatId } },
        select: { id: true },
      })
    : null;

  if (jaVinculadaPeloCpf || (colaborador.telegramChatId && colaborador.telegramChatId !== chatId)) {
    await sendTelegramMessage(
      chatId,
      "Esse cadastro já está vinculado a outro Telegram. 🔒\n\n" +
        "Se a conta for sua e você trocou de aparelho ou de número, procure o RH: " +
        "eles liberam o vínculo na sua ficha e você refaz o /start por aqui.",
      REMOVER_TECLADO
    );
    return;
  }
  await prisma.colaborador.update({
    where: { id: colaborador.id },
    data: { telegramChatId: chatId },
  });
  await sendTelegramMessage(
    chatId,
    `Pronto, ${colaborador.nome.split(" ")[0]}! ✅\n\n` +
      `Seu Telegram foi vinculado ao RH da ${await marcaDo(colaborador.id)}. ` +
      "As pesquisas e comunicados chegarão por aqui.\n\n" +
      "Envie /portal quando quiser consultar suas férias, seus dados e seus documentos.",
    REMOVER_TECLADO
  );
}

/**
 * A ficha ATIVA desta pessoa (CPF em dígitos), com a mesma preferência
 * determinística do caminho de CPF digitado: primeiro a ficha que já tem este
 * chat, depois uma sem chat nenhum (não rouba vínculo), por fim a mais antiga.
 * findMany porque o mesmo CPF existe em mais de uma ficha (um CNPJ por razão
 * social, importações separadas).
 */
async function fichaAtivaPorCpf(
  cpf: string,
  chatId: string
): Promise<{ id: string; nome: string; cpf: string | null; telegramChatId: string | null; dataNascimento: Date | null } | null> {
  const fichas = await prisma.colaborador.findMany({
    where: { cpf, ativo: true },
    select: { id: true, nome: true, cpf: true, telegramChatId: true, dataNascimento: true },
    orderBy: { createdAt: "asc" },
  });
  return (
    fichas.find((f) => f.telegramChatId === chatId) ??
    fichas.find((f) => !f.telegramChatId) ??
    fichas[0] ??
    null
  );
}

/**
 * Transferência de CNPJ: a ficha antiga é desativada e uma nova é criada, mas o
 * chat do Telegram (@@unique) fica preso na ficha antiga. Quem já era vinculado
 * pedia /portal e recebia "faça /start" para sempre. Aqui o vínculo segue a
 * pessoa: se o chat está numa ficha inativa e existe ficha ativa com o mesmo
 * CPF, migra e devolve a ficha ativa.
 */
async function migrarVinculoParaFichaAtiva(
  chatId: string
): Promise<{ id: string; nome: string } | null> {
  const fichaComChat = await prisma.colaborador.findFirst({
    where: { telegramChatId: chatId },
    select: { id: true, cpf: true },
  });
  const cpf = digitos(fichaComChat?.cpf ?? "");
  if (!fichaComChat || cpf.length !== 11) return null;
  const destino = await fichaAtivaPorCpf(cpf, chatId);
  if (!destino || destino.id === fichaComChat.id) return null;
  await prisma.$transaction([
    prisma.colaborador.update({ where: { id: fichaComChat.id }, data: { telegramChatId: null } }),
    prisma.colaborador.update({ where: { id: destino.id }, data: { telegramChatId: chatId } }),
  ]);
  return { id: destino.id, nome: destino.nome };
}

// Manda o link do portal para o chat que pediu — e só para ele. Nunca revela se
// o chat está vinculado a alguém: quem não tem vínculo recebe a instrução de
// fazer o /start, sem confirmar ou negar cadastro.
async function enviarLinkDoPortal(chatId: string): Promise<void> {
  const colaborador =
    (await prisma.colaborador.findFirst({
      where: { telegramChatId: chatId, ativo: true },
      select: { id: true, nome: true },
    })) ?? (await migrarVinculoParaFichaAtiva(chatId));
  if (!colaborador) {
    await sendTelegramMessage(chatId, MSG_PORTAL_SEM_VINCULO, TECLADO_CONTATO);
    return;
  }

  const link = await criarLinkDeAcesso(colaborador.id, "TELEGRAM");
  if (!link.ok) {
    await sendTelegramMessage(
      chatId,
      link.motivo === "link_recente" ? MSG_PORTAL_LINK_RECENTE : MSG_PORTAL_INDISPONIVEL,
    );
    return;
  }

  await sendTelegramMessage(
    chatId,
    `Oi, ${colaborador.nome.split(" ")[0]}! Aqui está seu acesso ao portal: 🔐\n\n` +
      `${link.url}\n\n` +
      `O link vale ${MINUTOS_VALIDADE_LINK} minutos e abre uma vez só. ` +
      "Não repasse para ninguém — ele dá acesso aos seus dados. " +
      "Precisando de outro, é só enviar /portal.",
  );
}

export async function POST(req: NextRequest) {
  const secret = await telegramWebhookSecret();
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const message = update.message;
  const chatIdRaw = message?.chat?.id;
  if (!message || chatIdRaw === undefined) return NextResponse.json({ ok: true });
  const chatId = String(chatIdRaw);

  try {
    // 1) Contato compartilhado -> casa pelo telefone.
    if (message.contact?.phone_number) {
      const donoDoContato = message.contact.user_id;
      const remetente = message.from?.id;
      if (donoDoContato !== undefined && remetente !== undefined && String(donoDoContato) !== String(remetente)) {
        await sendTelegramMessage(
          chatId,
          "Esse contato não é o seu. Toque no botão para compartilhar o SEU número. 🙂",
          TECLADO_CONTATO
        );
        return NextResponse.json({ ok: true });
      }
      const sufixo = sufixoTelefone(message.contact.phone_number);
      if (sufixo) {
        // Sem filtro de `ativo` aqui: na transferência de CNPJ o telefone
        // costuma ficar só na ficha antiga (desativada). O match inativo não
        // vincula — ele serve de ponte pelo CPF até a ficha ativa da pessoa.
        const colaboradores = await prisma.colaborador.findMany({
          where: { telefone: { not: null } },
          select: { id: true, nome: true, cpf: true, telefone: true, telegramChatId: true, ativo: true },
        });
        const matches = colaboradores.filter((c) => sufixoTelefone(c.telefone) === sufixo);
        const ativos = matches.filter((c) => c.ativo);
        if (ativos.length === 1) {
          await vincular(chatId, ativos[0]);
          return NextResponse.json({ ok: true });
        }
        if (ativos.length === 0 && matches.length > 0) {
          const cpfs = [...new Set(matches.map((c) => digitos(c.cpf ?? "")).filter((c) => c.length === 11))];
          const destino = cpfs.length === 1 ? await fichaAtivaPorCpf(cpfs[0], chatId) : null;
          if (destino) {
            await vincular(chatId, destino);
            return NextResponse.json({ ok: true });
          }
        }
      }
      await sendTelegramMessage(chatId, MSG_PEDIR_CPF);
      return NextResponse.json({ ok: true });
    }

    const texto = (message.text || "").trim();

    // 2) /portal -> link de acesso ao portal do colaborador.
    if (texto.startsWith("/portal")) {
      await enviarLinkDoPortal(chatId);
      return NextResponse.json({ ok: true });
    }

    // 3) /start -> boas-vindas com o botão de contato.
    if (texto.startsWith("/start")) {
      await sendTelegramMessage(chatId, MSG_BOAS_VINDAS, TECLADO_CONTATO);
      return NextResponse.json({ ok: true });
    }

    // 4) CPF (+ data de nascimento) digitado.
    const { cpf, data } = extrairCpfEData(texto, digitos);
    if (cpf.length === 11) {
      // A preferência determinística vive em fichaAtivaPorCpf — o findFirst
      // sem ordenação escolhia uma ficha imprevisível, e podia escolher
      // exatamente a que NÃO tinha o chat, transformando a própria pessoa em
      // "outro colaborador".
      const colaborador = await fichaAtivaPorCpf(cpf, chatId);
      if (!colaborador) {
        await sendTelegramMessage(chatId, MSG_CPF_NAO_ENCONTRADO);
        return NextResponse.json({ ok: true });
      }
      // Segundo fator: a data de nascimento. É o que impede quem só sabe o CPF
      // do colega (que não é segredo) de assumir o portal dele.
      if (!data) {
        await sendTelegramMessage(chatId, MSG_PEDIR_DATA);
        return NextResponse.json({ ok: true });
      }
      if (!colaborador.dataNascimento) {
        await sendTelegramMessage(chatId, MSG_SEM_NASCIMENTO);
        return NextResponse.json({ ok: true });
      }
      if (!conferirNascimento(colaborador.dataNascimento, data)) {
        await sendTelegramMessage(chatId, MSG_DATA_NAO_CONFERE);
        return NextResponse.json({ ok: true });
      }
      await vincular(chatId, colaborador);
      return NextResponse.json({ ok: true });
    }

    // 5) Qualquer outra coisa -> instruções.
    await sendTelegramMessage(chatId, MSG_BOAS_VINDAS, TECLADO_CONTATO);
  } catch (e) {
    // Nunca propaga erro como 5xx (o Telegram ficaria reenviando o update);
    // o log da Vercel é o lugar de investigar.
    console.error("telegram-webhook:", e);
  }
  return NextResponse.json({ ok: true });
}

// Health check simples (sem dados): GET /api/telegram/webhook
export async function GET() {
  return NextResponse.json({ ok: true, service: "telegram-webhook" });
}
