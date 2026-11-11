"use server";

// Envio de contracheques — o que o RH faz: mandar o aviso dos contracheques
// de uma competência, reenviar com desbloqueio e cobrar pendentes no Telegram.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { empresasVisiveis, podeOperarEmpresaRH, requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { avisarColaborador, enviarContracheques } from "@/lib/contracheques/envio";
import {
  camposResetAposInvalidacao,
  montarSnapshotInvalidacao,
  podeInvalidarRecibo,
  validarMotivoInvalidacao,
} from "@/lib/contracheques/invalidacao";
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
      empresaId: doc.empresaId,
      colaborador: doc.colaborador,
    },
    novoToken,
    {
      ehReenvio: true,
      empresaId: doc.empresaId,
      marcaNome: doc.colaborador.empresa.marca.nome,
    }
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

/**
 * Invalida a assinatura eletrônica de um contracheque já confirmado.
 * Preserva o snapshot forense (evidência, foto e PDF original) em ReciboContrachequeInvalidado,
 * reseta o recibo para pendente gerando novo token, e opcionalmente dispara reenvio imediato.
 */
export async function invalidarAssinaturaContrachequeAction(
  empresaId: string,
  documentoId: string,
  entrada: { motivo: string; reenviarAgora?: boolean }
): Promise<{ ok: true; reenviado: boolean; erroReenvio?: string | null } | { ok: false; error: string }> {
  const user = await requireEmpresaAccess(empresaId);

  const validacao = validarMotivoInvalidacao(entrada.motivo);
  if (!validacao.ok) {
    return { ok: false, error: validacao.error };
  }
  const motivoLimpo = validacao.motivo;

  const doc = await prisma.documentoColaborador.findUnique({
    where: { id: documentoId },
    select: {
      id: true,
      empresaId: true,
      colaborador: {
        select: {
          id: true,
          nome: true,
          email: true,
          cpf: true,
          telegramChatId: true,
          empresa: {
            select: {
              id: true,
              nome: true,
              marca: { select: { nome: true } },
            },
          },
        },
      },
      recibo: {
        select: {
          id: true,
          empresaId: true,
          colaboradorId: true,
          documentoId: true,
          competencia: true,
          tipoFolha: true,
          enviadoEm: true,
          canal: true,
          cienciaTelegramEm: true,
          vistoEm: true,
          codigoValidadoEm: true,
          canalCodigo: true,
          confirmadoEm: true,
          confirmadoIp: true,
          confirmadoDispositivo: true,
          confirmadoLocalizacao: true,
          hashDocumento: true,
          textoAceite: true,
          fotoArquivoId: true,
          comprovanteArquivoId: true,
        },
      },
    },
  });

  if (!doc) return { ok: false, error: "Contracheque não encontrado." };
  if (!(await podeOperarEmpresaRH(user, doc.empresaId))) {
    return { ok: false, error: "Sem permissão para alterar contracheques desta empresa." };
  }

  const elegibilidade = podeInvalidarRecibo(doc.recibo);
  if (!elegibilidade.ok) {
    return { ok: false, error: elegibilidade.error };
  }
  const recibo = doc.recibo!;
  if (!recibo.confirmadoEm) {
    return { ok: false, error: "Contracheque não possui assinatura confirmada." };
  }

  const novoToken = gerarTokenAssinatura();

  try {
    await prisma.$transaction(async (tx) => {
      // Bloqueio pessimista para evitar invalidação concorrente simultânea
      const [reciboLock] = await tx.$queryRaw<{ id: string; confirmadoEm: Date | null }[]>`
        SELECT "id", "confirmadoEm"
        FROM rh."ReciboContracheque"
        WHERE "id" = ${recibo.id}
        FOR UPDATE
      `;

      if (!reciboLock || !reciboLock.confirmadoEm) {
        throw new Error("Este contracheque não possui assinatura confirmada para invalidar.");
      }

      // 1. Snapshot forense completo em ReciboContrachequeInvalidado
      const snapshot = montarSnapshotInvalidacao(
        {
          ...recibo,
          confirmadoEm: reciboLock.confirmadoEm,
        },
        motivoLimpo,
        {
          id: user.id,
          nome: user.name ?? "RH",
        }
      );

      await tx.reciboContrachequeInvalidado.create({
        data: snapshot,
      });

      // 2. Zerar carimbos de assinatura e rotacionar token
      await tx.reciboContracheque.update({
        where: { id: recibo.id },
        data: camposResetAposInvalidacao(novoToken),
      });
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Falha ao invalidar assinatura.";
    return { ok: false, error: msg };
  }

  await registrarAuditoria({
    empresaId: doc.empresaId,
    ator: {
      id: user.id,
      nome: user.name ?? "RH",
      papel: user.role ?? "RH",
    },
    acao: "ATUALIZAR",
    entidade: "ReciboContracheque",
    entidadeId: recibo.id,
    resumo: `Invalidou assinatura do contracheque de ${doc.colaborador.nome}: ${motivoLimpo}`,
    detalhes: {
      motivo: motivoLimpo,
      documentoId,
      fotoArquivoId: recibo.fotoArquivoId,
      comprovanteArquivoId: recibo.comprovanteArquivoId,
    },
  });

  let reenviado = false;
  let erroReenvio: string | null = null;

  if (entrada.reenviarAgora) {
    if (doc.colaborador.email || doc.colaborador.telegramChatId) {
      try {
        const marcaNome = doc.colaborador.empresa.marca?.nome || "RH";
        const aviso = await avisarColaborador(
          {
            id: recibo.id,
            tokenAssinatura: novoToken,
            competencia: recibo.competencia,
            tipoFolha: recibo.tipoFolha,
            empresaId: doc.empresaId,
            colaborador: {
              nome: doc.colaborador.nome,
              email: doc.colaborador.email,
              telegramChatId: doc.colaborador.telegramChatId,
              empresa: {
                marca: {
                  nome: marcaNome,
                },
              },
            },
          },
          novoToken,
          {
            ehReenvio: true,
            empresaId: doc.empresaId,
            marcaNome,
          }
        );

        await prisma.reciboContracheque.update({
          where: { id: recibo.id },
          data: {
            enviadoEm: new Date(),
            enviadoPorNome: user.name ?? "RH",
            canal: aviso.canal,
            envioErro: aviso.erro,
            envios: { increment: 1 },
          },
        });

        if (aviso.canal) {
          reenviado = true;
        } else {
          erroReenvio = aviso.erro ?? "Colaborador sem canal de contato.";
        }
      } catch (err: unknown) {
        erroReenvio = err instanceof Error ? err.message : "Erro no envio de notificação.";
      }
    } else {
      erroReenvio = "Colaborador sem e-mail nem Telegram cadastrado para reenvio.";
    }
  }

  revalidatePath(`/rh/${empresaId}/contracheques`);
  revalidatePath("/portal");

  return { ok: true, reenviado, erroReenvio };
}

