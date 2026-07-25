"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { dataDoFormulario, formatarData } from "@/lib/datas";
import { lerAnexo } from "@/lib/anexos";
import { contarDiasCorridos } from "@/lib/ferias";
import { TIPOS_AUSENCIA, tipoAusenciaLabel } from "@/lib/constants-dp";
import type { ActionResult } from "@/lib/constants";

const TIPOS_VALIDOS = new Set<string>(TIPOS_AUSENCIA.map((t) => t.value));

export async function registrarAusencia(
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
  if (!TIPOS_VALIDOS.has(tipo)) return { ok: false, error: "Selecione o tipo da ausência." };

  const dataInicio = dataDoFormulario(formData.get("dataInicio"));
  const dataFim = dataDoFormulario(formData.get("dataFim"));
  if (!dataInicio || !dataFim) return { ok: false, error: "Informe o período da ausência." };
  if (dataFim < dataInicio) {
    return { ok: false, error: "A data de término não pode ser anterior à de início." };
  }

  const dias = contarDiasCorridos(dataInicio, dataFim);
  if (dias > 365) return { ok: false, error: "Período muito longo — confira as datas." };

  const anexoLido = await lerAnexo(formData);
  if (!anexoLido.ok) return { ok: false, error: anexoLido.error };
  const anexo = anexoLido.anexo;

  const sobreposta = await prisma.ausencia.findFirst({
    where: {
      colaboradorId,
      status: { in: ["PENDENTE", "APROVADA"] },
      dataInicio: { lte: dataFim },
      dataFim: { gte: dataInicio },
    },
    select: { dataInicio: true, dataFim: true },
  });
  if (sobreposta) {
    return {
      ok: false,
      error: `Já há uma ausência registrada de ${formatarData(sobreposta.dataInicio)} a ${formatarData(sobreposta.dataFim)} que se sobrepõe a esta.`,
    };
  }

  // O atestado vai numa linha própria antes da ausência (numa transação, para
  // não sobrar arquivo órfão se a segunda inserção falhar).
  const ausencia = await prisma.$transaction(async (tx) => {
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

    return tx.ausencia.create({
      data: {
        empresaId,
        colaboradorId,
        tipo,
        dataInicio,
        dataFim,
        dias,
        abonada: formData.get("abonada") === "true",
        cid: String(formData.get("cid") ?? "").trim() || null,
        profissional: String(formData.get("profissional") ?? "").trim() || null,
        registroProfissional: String(formData.get("registroProfissional") ?? "").trim() || null,
        observacoes: String(formData.get("observacoes") ?? "").trim() || null,
        arquivoId: arquivo?.id ?? null,
        registradoPorId: usuario?.id ?? null,
        registradoPorNome: usuario?.name ?? null,
      },
    });
  });

  await registrarAuditoria({
    empresaId,
    acao: "CRIAR",
    entidade: "Ausencia",
    entidadeId: ausencia.id,
    resumo: `${tipoAusenciaLabel(tipo)} de ${colaborador.nome}: ${formatarData(dataInicio)} a ${formatarData(dataFim)} (${dias} dia(s)).`,
    // CID é dado de saúde: a trilha registra que houve anexo/atestado, nunca o
    // diagnóstico em si.
    detalhes: { tipo, dias, anexo: anexo?.nome ?? null },
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/aprovacoes`);
  return { ok: true };
}

export async function decidirAusencia(
  empresaId: string,
  id: string,
  decisao: "APROVADA" | "REPROVADA",
  motivo?: string,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);

  const ausencia = await prisma.ausencia.findFirst({
    where: { id, empresaId },
    select: {
      id: true,
      status: true,
      tipo: true,
      colaboradorId: true,
      dataInicio: true,
      dataFim: true,
      colaborador: { select: { nome: true } },
    },
  });
  if (!ausencia) return { ok: false, error: "Ausência não encontrada nesta empresa." };
  if (ausencia.status !== "PENDENTE") return { ok: false, error: "Esta ausência já foi decidida." };

  await prisma.ausencia.update({
    where: { id },
    data: {
      status: decisao,
      decididoPorId: usuario?.id ?? null,
      decididoPorNome: usuario?.name ?? null,
      decididoEm: new Date(),
      motivoDecisao: motivo?.trim() || null,
    },
  });

  await registrarAuditoria({
    empresaId,
    acao: decisao === "APROVADA" ? "APROVAR" : "REPROVAR",
    entidade: "Ausencia",
    entidadeId: id,
    resumo: `${tipoAusenciaLabel(ausencia.tipo)} de ${ausencia.colaborador.nome} (${formatarData(ausencia.dataInicio)} a ${formatarData(ausencia.dataFim)}) — ${decisao.toLowerCase()}.`,
    detalhes: motivo ? { motivo } : undefined,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${ausencia.colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/aprovacoes`);
  return { ok: true };
}

export async function excluirAusencia(empresaId: string, id: string): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const ausencia = await prisma.ausencia.findFirst({
    where: { id, empresaId },
    select: {
      id: true,
      tipo: true,
      arquivoId: true,
      colaboradorId: true,
      dataInicio: true,
      colaborador: { select: { nome: true } },
    },
  });
  if (!ausencia) return { ok: false, error: "Ausência não encontrada nesta empresa." };

  // Mesmo cuidado do dossiê: o FK é SET NULL, então o atestado precisa ser
  // apagado junto para não ficar órfão no banco.
  await prisma.$transaction(async (tx) => {
    await tx.ausencia.delete({ where: { id } });
    if (ausencia.arquivoId) await tx.arquivo.delete({ where: { id: ausencia.arquivoId } });
  });

  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "Ausencia",
    entidadeId: id,
    resumo: `${tipoAusenciaLabel(ausencia.tipo)} de ${ausencia.colaborador.nome} em ${formatarData(ausencia.dataInicio)} excluída.`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${ausencia.colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/aprovacoes`);
  return { ok: true };
}
