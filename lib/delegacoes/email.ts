import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { prazoEmTexto, diasAtePrazo } from "@/lib/delegacoes/consultas";
import { rotuloEvidencia, rotuloCriticidade } from "@/lib/constants-delegacoes";
import { emailDe, comoAbrir } from "@/lib/delegacoes/destino-email";

// O módulo Delegações no E-MAIL — irmão de lib/delegacoes/telegram.ts.
//
// Pedido da Direção em 29/08/2026: a demanda tem que chegar por e-mail
// TAMBÉM, não só pelo Telegram — sempre que o responsável tiver e-mail
// (login ou ficha de colaborador — ver destino-email.ts), incondicional a ter
// ou não Telegram vinculado.
// É o mesmo espírito de `lib/cobranca-rh-pendencias.ts` e
// `lib/convite-portal.ts`: SMTP existente, `chave` de dedupe, `fromName`
// pela marca de quem recebe.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

type DemandaParaEmail = {
  id: string;
  titulo: string;
  descricao: string | null;
  criterioAceite: string;
  evidenciaExigida: string;
  criticidade: number;
  prazo: Date;
  solicitante: { nome: string };
};

function assuntoDaDemandaNova(d: DemandaParaEmail): string {
  return `[Delegações] ${d.titulo}`;
}

function textoDaDemandaNova(d: DemandaParaEmail, abrir: string): string {
  const dias = diasAtePrazo(d.prazo);
  const quando =
    dias === 0 ? "hoje" : dias === 1 ? "amanhã" : dias > 0 ? `em ${dias} dias` : "prazo já vencido";
  return [
    `${d.titulo}`,
    "",
    `Pedido por ${d.solicitante.nome}`,
    `Prazo: ${prazoEmTexto(d.prazo)} (${quando}) · ${rotuloCriticidade(d.criticidade)}`,
    "",
    d.descricao ?? "",
    d.descricao ? "" : null,
    `Fica pronto quando: ${d.criterioAceite}`,
    "",
    `Na entrega vou pedir: ${rotuloEvidencia(d.evidenciaExigida).toLowerCase()}.`,
    "",
    abrir,
  ]
    .filter((l): l is string => l !== null && l !== "")
    .join("\n");
}

function htmlDaDemandaNova(d: DemandaParaEmail, abrir: string): string {
  const dias = diasAtePrazo(d.prazo);
  const quando =
    dias === 0 ? "hoje" : dias === 1 ? "amanhã" : dias > 0 ? `em ${dias} dias` : "prazo já vencido";
  return [
    `<p><b>${esc(d.titulo)}</b></p>`,
    `<p>Pedido por ${esc(d.solicitante.nome)}</p>`,
    `<p>Prazo: <b>${prazoEmTexto(d.prazo)}</b> (${quando}) · ${rotuloCriticidade(d.criticidade)}</p>`,
    d.descricao ? `<p>${esc(d.descricao)}</p>` : "",
    `<p>Fica pronto quando: ${esc(d.criterioAceite)}</p>`,
    `<p>Na entrega vou pedir: ${rotuloEvidencia(d.evidenciaExigida).toLowerCase()}.</p>`,
    abrir,
  ]
    .filter(Boolean)
    .join("");
}

/** Mesma escapada usada nos geradores de relatório do repo — texto livre nunca vira HTML. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type ResultadoEnvio = { ok: true; deduplicado?: boolean } | { ok: false; motivo: string };

/**
 * Manda a demanda por e-mail ao responsável. Mesmo contrato de
 * `avisarDemandaEnviada` (Telegram): nunca lança — quem chama decide se a
 * falha vira aviso na tela, e a demanda já está gravada de qualquer jeito.
 *
 * `chave` é o id da demanda: ela só é ENVIADA uma vez na vida (a máquina de
 * estados não deixa `ENVIAR` rodar duas vezes), então uma chave fixa por
 * demanda já garante que um retry de rede não duplica o e-mail.
 */
export async function avisarDemandaEnviadaPorEmail(demandaId: string): Promise<ResultadoEnvio> {
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
      solicitante: { select: { nome: true } },
      responsavel: {
        select: {
          nome: true,
          email: true,
          role: true,
          colaborador: {
            select: {
              email: true,
              empresaId: true,
              empresa: { select: { marca: { select: { nome: true } } } },
            },
          },
        },
      },
    },
  });
  if (!demanda) return { ok: false, motivo: "Demanda não encontrada." };

  const para = emailDe(demanda.responsavel);
  if (!para) {
    return {
      ok: false,
      motivo: `${demanda.responsavel.nome} não tem e-mail no cadastro de colaborador`,
    };
  }

  const linkDemanda = `${APP_URL}/delegacoes/${demanda.id}`;
  const abrir = comoAbrir(demanda.responsavel, linkDemanda);
  const fromName = demanda.responsavel.colaborador?.empresa.marca.nome
    ? `RH ${demanda.responsavel.colaborador.empresa.marca.nome}`
    : "Delegações";

  const envio = await sendEmail({
    to: para,
    subject: assuntoDaDemandaNova(demanda),
    text: textoDaDemandaNova(demanda, abrir.texto),
    html: htmlDaDemandaNova(demanda, abrir.html),
    fromName,
    origem: "DELEGACOES",
    empresaId: demanda.responsavel.colaborador?.empresaId,
    marcaNome: demanda.responsavel.colaborador?.empresa.marca.nome,
    chave: `delegacoes-nova:${demanda.id}`,
  });
  if (!envio.ok) return { ok: false, motivo: envio.error };
  if (envio.deduplicado) return { ok: true, deduplicado: true };

  // Mesma trilha que o envio por Telegram grava — o histórico da demanda vê
  // os dois canais, cada um com seu próprio registro (spec §3.2).
  await prisma.demandaInteracao.create({
    data: {
      demandaId: demanda.id,
      tipo: "ENVIADA",
      canal: "EMAIL",
      conteudo: "Demanda enviada ao responsável por e-mail.",
    },
  });

  return { ok: true };
}

type DemandaEntregueParaEmail = {
  id: string;
  titulo: string;
  responsavel: { nome: string };
};

function assuntoDaEntrega(d: DemandaEntregueParaEmail): string {
  return `[Delegações] Entregue: ${d.titulo}`;
}

function textoDaEntrega(d: DemandaEntregueParaEmail, linkDemanda: string): string {
  return [
    `${d.titulo}`,
    "",
    `${d.responsavel.nome} entregou. Só falta a sua aprovação para encerrar.`,
    "",
    `Abrir: ${linkDemanda}`,
  ].join("\n");
}

function htmlDaEntrega(d: DemandaEntregueParaEmail, linkDemanda: string): string {
  return [
    `<p><b>${esc(d.titulo)}</b></p>`,
    `<p>${esc(d.responsavel.nome)} entregou. Só falta a sua aprovação para encerrar.</p>`,
    `<p><a href="${linkDemanda}">Abrir no sistema</a></p>`,
  ].join("");
}

/**
 * Irmã de `avisarDemandaEnviadaPorEmail`, mas para o SOLICITANTE quando a
 * entrega chega — mesmo pedido da Direção de 29/08/2026 (e-mail sempre
 * junto do Telegram), aplicado ao evento que faltava avisar.
 */
export async function avisarDemandaEntreguePorEmail(demandaId: string): Promise<ResultadoEnvio> {
  const demanda = await prisma.demanda.findUnique({
    where: { id: demandaId },
    select: {
      id: true,
      titulo: true,
      responsavel: { select: { nome: true } },
      solicitante: {
        select: {
          nome: true,
          email: true,
          role: true,
          colaborador: {
            select: {
              email: true,
              empresaId: true,
              empresa: { select: { marca: { select: { nome: true } } } },
            },
          },
        },
      },
    },
  });
  if (!demanda) return { ok: false, motivo: "Demanda não encontrada." };

  const para = emailDe(demanda.solicitante);
  if (!para) {
    return { ok: false, motivo: `${demanda.solicitante.nome} não tem e-mail cadastrado` };
  }

  const linkDemanda = `${APP_URL}/delegacoes/${demanda.id}`;
  const fromName = demanda.solicitante.colaborador?.empresa.marca.nome
    ? `RH ${demanda.solicitante.colaborador.empresa.marca.nome}`
    : "Delegações";

  const envio = await sendEmail({
    to: para,
    subject: assuntoDaEntrega(demanda),
    text: textoDaEntrega(demanda, linkDemanda),
    html: htmlDaEntrega(demanda, linkDemanda),
    fromName,
    origem: "DELEGACOES",
    empresaId: demanda.solicitante.colaborador?.empresaId,
    marcaNome: demanda.solicitante.colaborador?.empresa.marca.nome,
    chave: `delegacoes-entrega:${demanda.id}`,
  });
  if (!envio.ok) return { ok: false, motivo: envio.error };
  if (envio.deduplicado) return { ok: true, deduplicado: true };

  await prisma.demandaInteracao.create({
    data: {
      demandaId: demanda.id,
      tipo: "ENVIADA",
      canal: "EMAIL",
      conteudo: "Entrega avisada ao solicitante por e-mail.",
    },
  });

  return { ok: true };
}

/**
 * Irmã de `avisarDemandaConcluidaDireto` (Telegram): avisa o RESPONSÁVEL por
 * e-mail quando o solicitante dá baixa direta — a demanda terminou sem
 * entrega, e a pessoa não deve mais trabalhar nela.
 *
 * `chave` fixa por demanda: ENCERRADA é estado terminal, a baixa só acontece
 * uma vez na vida da demanda — retry de rede não duplica o e-mail.
 */
export async function avisarDemandaConcluidaDiretoPorEmail(
  demandaId: string,
): Promise<ResultadoEnvio> {
  const demanda = await prisma.demanda.findUnique({
    where: { id: demandaId },
    select: {
      id: true,
      titulo: true,
      solicitante: { select: { nome: true } },
      responsavel: {
        select: {
          nome: true,
          email: true,
          role: true,
          colaborador: {
            select: {
              email: true,
              empresaId: true,
              empresa: { select: { marca: { select: { nome: true } } } },
            },
          },
        },
      },
    },
  });
  if (!demanda) return { ok: false, motivo: "Demanda não encontrada." };

  const para = emailDe(demanda.responsavel);
  if (!para) {
    return {
      ok: false,
      motivo: `${demanda.responsavel.nome} não tem e-mail no cadastro de colaborador`,
    };
  }

  const linkDemanda = `${APP_URL}/delegacoes/${demanda.id}`;
  const abrir = comoAbrir(demanda.responsavel, linkDemanda);
  const fromName = demanda.responsavel.colaborador?.empresa.marca.nome
    ? `RH ${demanda.responsavel.colaborador.empresa.marca.nome}`
    : "Delegações";

  const frase = `${demanda.solicitante.nome} deu baixa nesta demanda como concluída — você não precisa mais entregar nada nela.`;
  const envio = await sendEmail({
    to: para,
    subject: `[Delegações] Concluída: ${demanda.titulo}`,
    text: [`${demanda.titulo}`, "", frase, "", abrir.texto].join("\n"),
    html: [`<p><b>${esc(demanda.titulo)}</b></p>`, `<p>${esc(frase)}</p>`, abrir.html].join(""),
    fromName,
    origem: "DELEGACOES",
    empresaId: demanda.responsavel.colaborador?.empresaId,
    marcaNome: demanda.responsavel.colaborador?.empresa.marca.nome,
    chave: `delegacoes-baixa:${demanda.id}`,
  });
  if (!envio.ok) return { ok: false, motivo: envio.error };
  if (envio.deduplicado) return { ok: true, deduplicado: true };

  await prisma.demandaInteracao.create({
    data: {
      demandaId: demanda.id,
      tipo: "ENVIADA",
      canal: "EMAIL",
      conteudo: "Baixa direta avisada ao responsável por e-mail.",
    },
  });

  return { ok: true };
}
