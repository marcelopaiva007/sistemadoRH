"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { dataDoFormulario } from "@/lib/datas";
import { lerAnexo } from "@/lib/anexos";
import { TIPOS_DOCUMENTO, tipoDocumentoLabel } from "@/lib/constants-dp";
import type { ActionResult } from "@/lib/constants";

const TIPOS_VALIDOS = new Set<string>(TIPOS_DOCUMENTO.map((t) => t.value));

export async function criarDocumento(
  empresaId: string,
  colaboradorId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);

  const colaborador = await prisma.colaborador.findFirst({
    where: { id: colaboradorId, empresaId },
    select: { id: true, nome: true },
  });
  if (!colaborador) return { ok: false, error: "Colaborador não encontrado nesta empresa." };

  const tipo = String(formData.get("tipo") ?? "").trim();
  if (!TIPOS_VALIDOS.has(tipo)) return { ok: false, error: "Selecione o tipo do documento." };

  const anexoLido = await lerAnexo(formData);
  if (!anexoLido.ok) return { ok: false, error: anexoLido.error };

  const descricao = String(formData.get("descricao") ?? "").trim() || null;
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null;
  const emitidoEm = dataDoFormulario(formData.get("emitidoEm"));
  const validoAte = dataDoFormulario(formData.get("validoAte"));

  if (emitidoEm && validoAte && validoAte < emitidoEm) {
    return { ok: false, error: "A validade não pode ser anterior à emissão." };
  }

  const anexo = anexoLido.anexo;
  // O blob vai numa linha própria antes do documento (numa transação, para não
  // sobrar arquivo órfão se a segunda inserção falhar).
  const documento = await prisma.$transaction(async (tx) => {
    const arquivo = anexo
      ? await tx.arquivo.create({
          data: {
            empresaId,
            nome: anexo.nome,
            mimeType: anexo.mimeType,
            tamanhoBytes: anexo.bytes.byteLength,
            conteudo: anexo.bytes,
            criadoPorId: usuario?.id ?? null,
            criadoPorNome: usuario?.name ?? null,
          },
          select: { id: true },
        })
      : null;

    return tx.documentoColaborador.create({
      data: {
        empresaId,
        colaboradorId,
        tipo,
        descricao,
        observacoes,
        emitidoEm,
        validoAte,
        arquivoId: arquivo?.id ?? null,
        criadoPorId: usuario?.id ?? null,
        criadoPorNome: usuario?.name ?? null,
      },
    });
  });

  await registrarAuditoria({
    empresaId,
    acao: "CRIAR",
    entidade: "DocumentoColaborador",
    entidadeId: documento.id,
    resumo: `${tipoDocumentoLabel(tipo)} de ${colaborador.nome} ${anexo ? "anexado" : "cadastrado sem arquivo"}.`,
    detalhes: { tipo, arquivo: anexo?.nome ?? null, validoAte: validoAte?.toISOString() ?? null },
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/vencimentos`);
  return { ok: true };
}

export async function excluirDocumento(
  empresaId: string,
  colaboradorId: string,
  id: string,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const documento = await prisma.documentoColaborador.findFirst({
    where: { id, empresaId, colaboradorId },
    select: { id: true, tipo: true, arquivoId: true, colaborador: { select: { nome: true } } },
  });
  if (!documento) return { ok: false, error: "Documento não encontrado." };

  // O FK é ON DELETE SET NULL: apagar só o documento deixaria o blob órfão no
  // banco — some da tela mas continua guardado, o oposto do que a LGPD pede.
  await prisma.$transaction(async (tx) => {
    await tx.documentoColaborador.delete({ where: { id } });
    if (documento.arquivoId) await tx.arquivo.delete({ where: { id: documento.arquivoId } });
  });

  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "DocumentoColaborador",
    entidadeId: id,
    resumo: `${tipoDocumentoLabel(documento.tipo)} de ${documento.colaborador.nome} excluído (arquivo removido do banco).`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/vencimentos`);
  return { ok: true };
}
