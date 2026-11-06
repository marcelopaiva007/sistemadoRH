"use server";

// Envio de contracheques — o que o RH faz: mandar o aviso dos contracheques
// de uma competência, reenviar com desbloqueio e cobrar pendentes no Telegram.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { empresasVisiveis, podeOperarEmpresaRH, requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { avisarColaborador, enviarContracheques } from "@/lib/contracheques/envio";
import { competenciaDoTexto, rotuloDoContracheque } from "@/lib/contracheques/situacao";
import { gerarTokenAssinatura } from "@/lib/contracheques/token-auth";
import { montarMensagemLembreteTelegram } from "@/lib/contracheques/lembretes";
import { sendTelegramMessage } from "@/lib/telegram";

/** Teto por clique: cada aviso é uma chamada ao Telegram ou ao SMTP. */
const MAXIMO_POR_ENVIO = 400;

export type ResultadoEnvio =
  | { ok: true; avisados: number; semCanal: number; jaConfirmados: number; falhas: number }
  | { ok: false; error: string };

/**
 * Manda o aviso dos contracheques escolhidos.
 */
export async function enviarContrachequesAction(
  empresaId: string,
  competenciaTexto: string,
  documentoIds: string[]
): Promise<ResultadoEnvio> {
  const user = await requireEmpresaAccess(empresaId);
  const competencia = competenciaDoTexto(competenciaTexto);
  if (!competencia) return { ok: false, error: "Competência inválida." };
  const ids = [...new Set(documentoIds)].slice(0, MAXIMO_POR_ENVIO);
  if (ids.length === 0) return { ok: false, error: "Nenhum contracheque para enviar." };

  const visiveis = await empresasVisiveis(user);
  const docs = await prisma.documentoColaborador.findMany({
    where: {
      id: { in: ids },
      tipo: "CONTRACHEQUE",
      competencia,
      arquivoId: { not: null },
      empresaId: { in: visiveis },
      colaborador: { ativo: true, empresa: { ativo: true } },
    },
    select: { id: true, empresaId: true },
  });
  const empresas = [...new Set(docs.map((d) => d.empresaId))];
  for (const e of empresas) {
    if (!(await podeOperarEmpresaRH(user, e))) {
      return { ok: false, error: "Sem permissão para enviar contracheques desta empresa." };
    }
  }
  if (docs.length === 0) return { ok: false, error: "Nenhum contracheque desta competência encontrado." };

  const r = await enviarContracheques(
    docs.map((d) => d.id),
    { nome: user.name ?? null }
  );
  for (const e of empresas) {
    const conta = r.porEmpresa[e];
    if (!conta) continue;
    await registrarAuditoria({
      empresaId: e,
      acao: "ENVIAR_CONVITE",
      entidade: "ReciboContracheque",
      entidadeId: null,
      resumo: `Aviso de contracheque de ${rotuloDoContracheque(competencia, "MENSAL")}: ${conta.avisados} avisado(s), ${conta.semCanal} sem Telegram nem e-mail.`,
      detalhes: { competencia: competenciaTexto, documentos: docs.filter((d) => d.empresaId === e).map((d) => d.id) },
    });
  }
  revalidatePath(`/rh/${empresaId}/contracheques`);
  return { ok: true, avisados: r.avisados, semCanal: r.semCanal, jaConfirmados: r.jaConfirmados, falhas: r.falhas };
}

/**
 * Reenvia o e-mail de um contracheque específico, invalidando o token anterior,
 * gerando novo link seguro e zerando contadores de erro/bloqueio.
 */
export async function reenviarEmailContrachequeAction(
  empresaId: string,
  documentoId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireEmpresaAccess(empresaId);
  const doc = await prisma.documentoColaborador.findUnique({
    where: { id: documentoId },
    select: {
      id: true,
      empresaId: true,
      colaborador: {
        select: {
          nome: true,
          email: true,
          telegramChatId: true,
          empresa: { select: { marca: { select: { nome: true } } } },
        },
      },
      recibo: {
        select: {
          id: true,
          competencia: true,
          tipoFolha: true,
          confirmadoEm: true,
        },
      },
    },
  });

  if (!doc) return { ok: false, error: "Documento não encontrado." };
  if (!(await podeOperarEmpresaRH(user, doc.empresaId))) {
    return { ok: false, error: "Sem permissão para alterar contracheques desta empresa." };
  }
  if (!doc.recibo) return { ok: false, error: "Recibo ainda não criado para este documento." };
  if (doc.recibo.confirmadoEm) return { ok: false, error: "Este contracheque já foi confirmado." };

  const novoToken = gerarTokenAssinatura();
  const aviso = await avisarColaborador(
    {
      id: doc.recibo.id,
      tokenAssinatura: novoToken,
      competencia: doc.recibo.competencia,
      tipoFolha: doc.recibo.tipoFolha,
      colaborador: doc.colaborador,
    },
    novoToken
  );

  await prisma.reciboContracheque.update({
    where: { id: doc.recibo.id },
    data: {
      tokenAssinatura: novoToken,
      bloqueadoEm: null,
      tentativasCodigo: 0,
      enviadoEm: new Date(),
      enviadoPorNome: user.name,
      canal: aviso.canal,
      envioErro: aviso.erro,
      envios: { increment: 1 },
    },
  });

  revalidatePath(`/rh/${empresaId}/contracheques`);
  return { ok: true };
}

/**
 * Dispara cobrança imediata via Telegram para contracheques pendentes.
 */
export async function cobrarPendentesTelegramAction(
  empresaId: string,
  competenciaTexto: string,
  documentoIds?: string[]
): Promise<
  | { ok: true; cobrados: number; falhas: number; semTelegram: number }
  | { ok: false; error: string }
> {
  const user = await requireEmpresaAccess(empresaId);
  const competencia = competenciaDoTexto(competenciaTexto);
  if (!competencia) return { ok: false, error: "Competência inválida." };

  const visiveis = await empresasVisiveis(user);
  const docs = await prisma.documentoColaborador.findMany({
    where: {
      tipo: "CONTRACHEQUE",
      competencia,
      empresaId: { in: visiveis },
      colaborador: { ativo: true },
      recibo: { confirmadoEm: null },
      ...(documentoIds && documentoIds.length > 0 ? { id: { in: documentoIds } } : {}),
    },
    select: {
      id: true,
      recibo: {
        select: {
          id: true,
          competencia: true,
          tipoFolha: true,
          colaborador: {
            select: {
              nome: true,
              telegramChatId: true,
              empresa: { select: { marca: { select: { nome: true } } } },
            },
          },
        },
      },
    },
  });

  let cobrados = 0;
  let falhas = 0;
  let semTelegram = 0;

  for (const d of docs) {
    const r = d.recibo;
    if (!r) continue;
    if (!r.colaborador.telegramChatId) {
      semTelegram++;
      continue;
    }

    const primeiro = (r.colaborador.nome.split(" ")[0] ?? "").toLowerCase().replace(/^\p{L}/u, (c) => c.toUpperCase());
    const ref = rotuloDoContracheque(r.competencia, r.tipoFolha);
    const marca = r.colaborador.empresa.marca?.nome || "RH";
    const texto = montarMensagemLembreteTelegram(primeiro, ref, marca, 0);

    const res = await sendTelegramMessage(r.colaborador.telegramChatId, texto);
    if (res.ok) {
      await prisma.reciboContracheque.update({
        where: { id: r.id },
        data: {
          lembretesEnviados: { increment: 1 },
          ultimoLembreteEm: new Date(),
        },
      });
      cobrados++;
    } else {
      falhas++;
    }
  }

  revalidatePath(`/rh/${empresaId}/contracheques`);
  return { ok: true, cobrados, falhas, semTelegram };
}
