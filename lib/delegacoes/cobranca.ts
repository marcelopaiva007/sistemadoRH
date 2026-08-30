import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { sendEmail } from "@/lib/email";
import { botoesDaCobranca } from "@/lib/delegacoes/telegram";
import { prazoEmTexto, diasAtePrazo } from "@/lib/delegacoes/consultas";
import { rotuloCriticidade, rotuloEvidencia } from "@/lib/constants-delegacoes";
import { STATUS_EM_ANDAMENTO } from "@/lib/delegacoes/estados";
import { proximoDegrau, proximaCobranca, type DegrauComMomento } from "@/lib/delegacoes/regua";

// O MOTOR DA RÉGUA (PR 5) — a parte que LÊ o banco, DECIDE (via
// lib/delegacoes/regua.ts, puro) e AGE: manda a mensagem certa pelo canal
// certo e avança `nivelEscalonamento`. Chamado só pelo cron
// (app/api/cron/demandas-cobranca), nunca pelo cliente — é por isso que mora
// fora de lib/actions/delegacoes.ts: aquele arquivo é a porta de escrita do
// USUÁRIO; este é a porta de escrita do SISTEMA, com seu próprio ator
// (`autorId: null`, `autorNome: "sistema"` nos eventos).
//
// CONCORRÊNCIA: mesmo padrão de lib/actions/delegacoes.ts —
// `updateMany({ where: { id, nivelEscalonamento: <o lido> } })`. Duas
// execuções do cron disputando a mesma demanda (retry de timeout, overlap de
// invocação) fazem uma avançar o nível e a outra achar 0 linhas — sem cobrar
// duas vezes o mesmo degrau.
//
// ESCOPO: só demandas ACEITA/EM_EXECUCAO (`STATUS_EM_ANDAMENTO`) — o
// responsável já comprometeu com o prazo. ENVIADA (aceite pendente) é o
// cron `demandas-aceite`, que cobra uma coisa diferente (regra 5). ENTREGUE
// não entra aqui: a bola está com o SOLICITANTE, não o responsável.

const SELECT_COBRANCA = {
  id: true,
  titulo: true,
  descricao: true,
  criterioAceite: true,
  evidenciaExigida: true,
  criticidade: true,
  prazo: true,
  enviadaEm: true,
  status: true,
  nivelEscalonamento: true,
  emRisco: true,
  solicitante: { select: { nome: true } },
  responsavel: {
    select: {
      nome: true,
      email: true,
      colaborador: {
        select: {
          telegramChatId: true,
          empresa: { select: { marca: { select: { nome: true } } } },
        },
      },
    },
  },
} as const;

/**
 * As demandas com um degrau vencido, prontas para o cron processar.
 * `proximaCobranca <= agora` é o índice — `Demanda_proximaCobranca_status_idx`
 * já existe desde o PR 2 para exatamente esta consulta.
 */
export async function demandasParaCobrar(agora = new Date(), limite = 200) {
  return prisma.demanda.findMany({
    where: { status: { in: [...STATUS_EM_ANDAMENTO] }, proximaCobranca: { lte: agora } },
    select: { id: true },
    take: limite,
    orderBy: { proximaCobranca: "asc" },
  });
}

async function carregarParaCobranca(id: string) {
  return prisma.demanda.findUnique({ where: { id }, select: SELECT_COBRANCA });
}

/** Deriva do SELECT real (helper acima), não do modelo genérico — só assim o
 * tipo carrega `solicitante`/`responsavel`, que só existem por causa do
 * `select`. */
type DemandaCobranca = NonNullable<Awaited<ReturnType<typeof carregarParaCobranca>>>;

export type ResultadoCobranca = "ok" | "pulou" | "conflito" | "nao-encontrada";

/**
 * Processa UMA demanda: acha o degrau vencido, avança o nível (com guarda de
 * concorrência) e manda a mensagem. Retorna o que aconteceu — o cron soma os
 * resultados no relatório da rodada, não lança em falha de uma demanda só.
 */
export async function executarCobranca(demandaId: string, agora = new Date()): Promise<ResultadoCobranca> {
  const d = await carregarParaCobranca(demandaId);
  if (!d) return "nao-encontrada";
  if (!STATUS_EM_ANDAMENTO.includes(d.status as (typeof STATUS_EM_ANDAMENTO)[number])) return "pulou";

  const degrau = proximoDegrau(
    { criticidade: d.criticidade, enviadaEm: d.enviadaEm, prazo: d.prazo, nivelEscalonamento: d.nivelEscalonamento },
    agora,
  );
  if (!degrau) return "pulou";

  const novoNivel = d.nivelEscalonamento + 1;
  const proxima = proximaCobranca({
    criticidade: d.criticidade,
    enviadaEm: d.enviadaEm,
    prazo: d.prazo,
    nivelEscalonamento: novoNivel,
  });

  const { count } = await prisma.demanda.updateMany({
    where: { id: d.id, nivelEscalonamento: d.nivelEscalonamento },
    data: {
      nivelEscalonamento: novoNivel,
      ultimaCobranca: agora,
      proximaCobranca: proxima,
      // Liga, nunca desliga sozinho aqui (spec §4) — desligar é ação de gente
      // (responsável ou solicitante), via validarMarcarEmRisco.
      ...(degrau.painelVermelho ? { emRisco: true } : {}),
    },
  });
  if (count === 0) return "conflito";

  const envolveDirecao = degrau.ccDirecao || degrau.notificaDirecao || degrau.painelVermelho;
  await prisma.demandaEvento.create({
    data: {
      demandaId: d.id,
      tipoEvento: envolveDirecao ? "ESCALADA" : "COBRANCA_ENVIADA",
      autorId: null,
      autorNome: "sistema",
      dados: { degrau: degrau.chave, canais: [...degrau.canais], formal: degrau.formal },
    },
  });

  await Promise.all([
    degrau.canais.includes("TELEGRAM") ? enviarPorTelegram(d, degrau) : Promise.resolve(),
    degrau.canais.includes("EMAIL") ? enviarPorEmail(d, degrau) : Promise.resolve(),
    degrau.notificaDirecao ? notificarDirecao(d, degrau) : Promise.resolve(),
  ]);

  return "ok";
}

function quandoEmTexto(prazo: Date): string {
  const dias = diasAtePrazo(prazo);
  if (dias > 0) return `em ${dias} dia${dias > 1 ? "s" : ""}`;
  if (dias === 0) return "hoje";
  return `${Math.abs(dias)} dia${Math.abs(dias) > 1 ? "s" : ""} atrasada`;
}

/**
 * O texto do lembrete/cobrança. Antes do prazo é convite; depois é cobrança,
 * e cresce de tom com `formal` — nunca inventa urgência que o degrau não tem.
 */
function textoCobranca(d: DemandaCobranca, degrau: DegrauComMomento): string {
  const abertura = degrau.antesDoPrazo
    ? `Lembrete — ${d.titulo}`
    : degrau.formal
      ? `⚠️ Atrasada — ${d.titulo}`
      : `${d.titulo} venceu`;
  return [
    abertura,
    "",
    `Pedido por ${d.solicitante.nome}`,
    `Prazo: ${prazoEmTexto(d.prazo)} (${quandoEmTexto(d.prazo)}) · ${rotuloCriticidade(d.criticidade)}`,
    "",
    `Fica pronto quando: ${d.criterioAceite}`,
    "",
    degrau.antesDoPrazo
      ? "Toque em um dos botões para me dizer como está, ou entregue já."
      : `Na entrega vou pedir: ${rotuloEvidencia(d.evidenciaExigida).toLowerCase()}.`,
  ]
    .filter((l) => l !== "")
    .join("\n");
}

async function enviarPorTelegram(d: DemandaCobranca, degrau: DegrauComMomento) {
  const chatId = d.responsavel.colaborador?.telegramChatId;
  if (!chatId) return; // sem Telegram vinculado — o e-mail (quando no degrau) segue o canal vivo.
  const envio = await sendTelegramMessage(chatId, textoCobranca(d, degrau), botoesDaCobranca(d.id));
  if (!envio.ok) return;
  await prisma.demandaInteracao.create({
    data: {
      demandaId: d.id,
      tipo: "ENVIADA",
      canal: "TELEGRAM",
      conteudo: `Cobrança automática (degrau ${degrau.chave}), com os botões de status.`,
    },
  });
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function enviarPorEmail(d: DemandaCobranca, degrau: DegrauComMomento) {
  if (!d.responsavel.email) return;
  const linkDemanda = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/delegacoes/${d.id}`;
  const fromName = d.responsavel.colaborador?.empresa.marca.nome
    ? `RH ${d.responsavel.colaborador.empresa.marca.nome}`
    : "Delegações";

  const cc = degrau.ccDirecao ? await emailsDaDirecao() : undefined;

  const envio = await sendEmail({
    to: d.responsavel.email,
    cc,
    fromName,
    subject: degrau.antesDoPrazo ? `[Delegações] Lembrete — ${d.titulo}` : `[Delegações] Atrasada — ${d.titulo}`,
    text: textoCobranca(d, degrau) + `\n\nAbrir: ${linkDemanda}`,
    html: `<p>${esc(textoCobranca(d, degrau)).replace(/\n/g, "<br/>")}</p><p><a href="${linkDemanda}">Abrir no sistema</a></p>`,
    // Cada degrau só cobra uma vez na vida da demanda — a chave é o par.
    chave: `delegacoes-regua:${d.id}:${degrau.chave}`,
  });
  if (!envio.ok || envio.deduplicado) return;
  await prisma.demandaInteracao.create({
    data: {
      demandaId: d.id,
      tipo: "ENVIADA",
      canal: "EMAIL",
      conteudo: `Cobrança automática por e-mail (degrau ${degrau.chave}).`,
    },
  });
}

async function emailsDaDirecao(): Promise<string[]> {
  const direcao = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "DIRETORIA"] }, ativo: true, email: { not: null } },
    select: { email: true },
  });
  return direcao.map((u) => u.email).filter((e): e is string => !!e);
}

/**
 * D+2/D+3 crítica: a Direção é avisada DIRETAMENTE, não só em cópia — spec
 * "Painel vermelho + notificação à Direção". Cada pessoa da Direção com
 * Telegram vinculado recebe pelo bot; todas com e-mail recebem por e-mail,
 * numa mensagem só (sem `cc`, porque aqui elas SÃO o destinatário).
 */
async function notificarDirecao(d: DemandaCobranca, degrau: DegrauComMomento) {
  const direcao = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "DIRETORIA"] }, ativo: true },
    select: { email: true, colaborador: { select: { telegramChatId: true } } },
  });
  const texto = [
    `🔴 Demanda atrasada — ${d.titulo}`,
    "",
    `Responsável: ${d.responsavel.nome}`,
    `Pedido por: ${d.solicitante.nome}`,
    `Prazo: ${prazoEmTexto(d.prazo)} (${quandoEmTexto(d.prazo)})`,
  ].join("\n");

  await Promise.all(
    direcao.map(async (pessoa) => {
      if (pessoa.colaborador?.telegramChatId) {
        await sendTelegramMessage(pessoa.colaborador.telegramChatId, texto);
      }
      if (pessoa.email) {
        await sendEmail({
          to: pessoa.email,
          fromName: "Delegações",
          subject: `[Delegações] 🔴 Atrasada — ${d.titulo}`,
          text: texto,
          html: `<p>${esc(texto).replace(/\n/g, "<br/>")}</p>`,
          chave: `delegacoes-notifica-direcao:${d.id}:${degrau.chave}:${pessoa.email}`,
        });
      }
    }),
  );
}
