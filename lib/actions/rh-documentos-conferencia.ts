"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { removerDoBlob } from "@/lib/blob";
import { sendTelegramMessage } from "@/lib/telegram";
import { tipoDocumentoLabel } from "@/lib/constants-dp";
import type { ActionResult } from "@/lib/constants";

// Conferência dos documentos que o colaborador envia pelo portal.
//
// O que chega do portal não vale como verdade cadastral até alguém olhar: uma
// foto tremida, o documento de outra pessoa ou o tipo errado no seletor entram
// igual. `conferidoEm` nulo é a fila; preenchido é o aval de quem conferiu.
//
// A devolução apaga o arquivo em vez de guardá-lo: um RG ilegível não tem uso
// nenhum depois, e manter cópia de documento pessoal sem finalidade é o tipo de
// resíduo que a LGPD cobra caro.

async function carregar(empresaId: string, id: string) {
  return prisma.documentoColaborador.findFirst({
    where: { id, empresaId, origem: "COLABORADOR" },
    select: {
      id: true,
      tipo: true,
      conferidoEm: true,
      colaboradorId: true,
      arquivoId: true,
      arquivo: { select: { blobUrl: true } },
      colaborador: { select: { nome: true, telegramChatId: true } },
    },
  });
}

/** Aval do RH: o documento passa a valer na ficha. */
export async function conferirDocumento(empresaId: string, id: string): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);

  const doc = await carregar(empresaId, id);
  if (!doc) return { ok: false, error: "Documento não encontrado nesta empresa." };
  if (doc.conferidoEm) return { ok: false, error: "Este documento já foi conferido." };

  await prisma.documentoColaborador.update({
    where: { id },
    data: { conferidoEm: new Date(), conferidoPorNome: usuario?.name ?? null },
  });

  await registrarAuditoria({
    empresaId,
    acao: "APROVAR",
    entidade: "DocumentoColaborador",
    entidadeId: id,
    resumo: `Documento ${tipoDocumentoLabel(doc.tipo)} de ${doc.colaborador.nome} conferido e aceito.`,
  });

  revalidatePath(`/rh/${empresaId}/aprovacoes`);
  revalidatePath(`/rh/${empresaId}/colaboradores/${doc.colaboradorId}`);
  return { ok: true };
}

/**
 * Devolve ao colaborador com o motivo, e avisa pelo Telegram.
 *
 * O motivo é obrigatório: "recusado" sem explicação faz a pessoa reenviar a
 * mesma foto ruim, e o documento volta para a fila do RH igual.
 */
export async function devolverDocumento(
  empresaId: string,
  id: string,
  motivo: string,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);

  const texto = motivo.trim();
  if (texto.length < 5) {
    return { ok: false, error: "Explique o motivo — é o que o colaborador vai ler para corrigir." };
  }

  const doc = await carregar(empresaId, id);
  if (!doc) return { ok: false, error: "Documento não encontrado nesta empresa." };
  if (doc.conferidoEm) return { ok: false, error: "Este documento já foi conferido." };

  const blobUrl = doc.arquivo?.blobUrl ?? null;
  const arquivoId = doc.arquivoId;

  await prisma.documentoColaborador.delete({ where: { id } });
  if (arquivoId) await prisma.arquivo.delete({ where: { id: arquivoId } });
  if (blobUrl) await removerDoBlob(blobUrl);

  await registrarAuditoria({
    empresaId,
    acao: "REPROVAR",
    entidade: "DocumentoColaborador",
    entidadeId: id,
    resumo: `Documento ${tipoDocumentoLabel(doc.tipo)} de ${doc.colaborador.nome} devolvido: ${texto}`,
  });

  // Sem aviso, a pessoa só descobre a devolução se voltar ao portal por conta
  // própria — e o documento simplesmente nunca chega.
  if (doc.colaborador.telegramChatId) {
    await sendTelegramMessage(
      doc.colaborador.telegramChatId,
      `Olá, ${doc.colaborador.nome.split(" ")[0]}! O RH precisa que você reenvie seu documento ` +
        `(${tipoDocumentoLabel(doc.tipo)}).\n\nMotivo: ${texto}\n\n` +
        `É só enviar /portal aqui para abrir o sistema e anexar de novo.`,
    );
  }

  revalidatePath(`/rh/${empresaId}/aprovacoes`);
  revalidatePath(`/rh/${empresaId}/colaboradores/${doc.colaboradorId}`);
  return { ok: true };
}
