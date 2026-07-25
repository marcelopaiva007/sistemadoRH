"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { dataDoFormulario } from "@/lib/datas";
import { STATUS_META, statusMetaLabel } from "@/lib/constants-metas";
import type { ActionResult } from "@/lib/constants";

const STATUS_VALIDOS = STATUS_META.map((s) => s.value);

// Usada pela página consolidada de metas: o alvo (colaborador OU setor) vem
// do próprio formulário, exatamente como a constraint CHECK do banco exige.
export async function criarMeta(
  empresaId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);

  const tipo = String(formData.get("tipo") ?? "");
  const alvoId = String(formData.get("alvoId") ?? "").trim();
  if (!["colaborador", "setor"].includes(tipo) || !alvoId) {
    return { ok: false, error: "Escolha se a meta é individual ou de setor, e quem é o alvo." };
  }

  const titulo = String(formData.get("titulo") ?? "").trim();
  if (!titulo) return { ok: false, error: "Dê um título à meta." };

  const dataInicio = dataDoFormulario(formData.get("dataInicio"));
  const dataFim = dataDoFormulario(formData.get("dataFim"));
  if (!dataInicio || !dataFim) return { ok: false, error: "Informe o início e o fim da meta." };
  if (dataFim < dataInicio) return { ok: false, error: "O fim não pode vir antes do início." };

  let nomeAlvo: string;
  if (tipo === "colaborador") {
    const colaborador = await prisma.colaborador.findFirst({ where: { id: alvoId, empresaId }, select: { nome: true } });
    if (!colaborador) return { ok: false, error: "Colaborador não encontrado nesta empresa." };
    nomeAlvo = colaborador.nome;
  } else {
    const setor = await prisma.setor.findFirst({ where: { id: alvoId, empresaId }, select: { nome: true } });
    if (!setor) return { ok: false, error: "Setor não encontrado nesta empresa." };
    nomeAlvo = setor.nome;
  }

  const meta = await prisma.meta.create({
    data: {
      empresaId,
      colaboradorId: tipo === "colaborador" ? alvoId : null,
      setorId: tipo === "setor" ? alvoId : null,
      titulo,
      descricao: String(formData.get("descricao") ?? "").trim() || null,
      dataInicio,
      dataFim,
      criadoPorId: usuario?.id ?? null,
      criadoPorNome: usuario?.name ?? null,
    },
  });

  await registrarAuditoria({
    empresaId,
    acao: "CRIAR",
    entidade: "Meta",
    entidadeId: meta.id,
    resumo: `Meta "${titulo}" criada para ${tipo === "colaborador" ? nomeAlvo : `o setor ${nomeAlvo}`}.`,
  });

  revalidatePath(`/rh/${empresaId}/metas`);
  if (tipo === "colaborador") revalidatePath(`/rh/${empresaId}/colaboradores/${alvoId}`);
  return { ok: true };
}

// Atalho usado na própria ficha — o alvo já é o colaborador da página, então
// não precisa escolher tipo/alvo como na página consolidada.
export async function criarMetaIndividual(
  empresaId: string,
  colaboradorId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);

  const colaborador = await prisma.colaborador.findFirst({ where: { id: colaboradorId, empresaId }, select: { nome: true } });
  if (!colaborador) return { ok: false, error: "Colaborador não encontrado nesta empresa." };

  const titulo = String(formData.get("titulo") ?? "").trim();
  if (!titulo) return { ok: false, error: "Dê um título à meta." };

  const dataInicio = dataDoFormulario(formData.get("dataInicio"));
  const dataFim = dataDoFormulario(formData.get("dataFim"));
  if (!dataInicio || !dataFim) return { ok: false, error: "Informe o início e o fim da meta." };
  if (dataFim < dataInicio) return { ok: false, error: "O fim não pode vir antes do início." };

  const meta = await prisma.meta.create({
    data: {
      empresaId,
      colaboradorId,
      titulo,
      descricao: String(formData.get("descricao") ?? "").trim() || null,
      dataInicio,
      dataFim,
      criadoPorId: usuario?.id ?? null,
      criadoPorNome: usuario?.name ?? null,
    },
  });

  await registrarAuditoria({
    empresaId,
    acao: "CRIAR",
    entidade: "Meta",
    entidadeId: meta.id,
    resumo: `Meta "${titulo}" criada para ${colaborador.nome}.`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/metas`);
  return { ok: true };
}

export async function atualizarMeta(
  empresaId: string,
  metaId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const meta = await prisma.meta.findFirst({ where: { id: metaId, empresaId } });
  if (!meta) return { ok: false, error: "Meta não encontrada nesta empresa." };

  const status = String(formData.get("status") ?? "");
  if (!STATUS_VALIDOS.includes(status as (typeof STATUS_VALIDOS)[number])) {
    return { ok: false, error: "Status inválido." };
  }

  const progressoTexto = String(formData.get("progresso") ?? "0");
  const progresso = Number.parseInt(progressoTexto, 10);
  if (!Number.isInteger(progresso) || progresso < 0 || progresso > 100) {
    return { ok: false, error: "Progresso deve ser de 0 a 100." };
  }

  await prisma.meta.update({
    where: { id: metaId },
    data: {
      status,
      progresso,
      descricao: String(formData.get("descricao") ?? "").trim() || null,
    },
  });

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "Meta",
    entidadeId: metaId,
    resumo: `Meta "${meta.titulo}" atualizada — ${statusMetaLabel(status)}, ${progresso}%.`,
  });

  revalidatePath(`/rh/${empresaId}/metas`);
  if (meta.colaboradorId) revalidatePath(`/rh/${empresaId}/colaboradores/${meta.colaboradorId}`);
  return { ok: true };
}

export async function excluirMeta(empresaId: string, metaId: string): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const meta = await prisma.meta.findFirst({ where: { id: metaId, empresaId } });
  if (!meta) return { ok: false, error: "Meta não encontrada nesta empresa." };

  await prisma.meta.delete({ where: { id: metaId } });

  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "Meta",
    entidadeId: metaId,
    resumo: `Meta "${meta.titulo}" excluída.`,
  });

  revalidatePath(`/rh/${empresaId}/metas`);
  if (meta.colaboradorId) revalidatePath(`/rh/${empresaId}/colaboradores/${meta.colaboradorId}`);
  return { ok: true };
}

export async function criarItemPDI(
  empresaId: string,
  colaboradorId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);

  const colaborador = await prisma.colaborador.findFirst({ where: { id: colaboradorId, empresaId }, select: { nome: true } });
  if (!colaborador) return { ok: false, error: "Colaborador não encontrado nesta empresa." };

  const titulo = String(formData.get("titulo") ?? "").trim();
  if (!titulo) return { ok: false, error: "Descreva a ação de desenvolvimento." };

  const item = await prisma.planoDesenvolvimento.create({
    data: {
      empresaId,
      colaboradorId,
      titulo,
      descricao: String(formData.get("descricao") ?? "").trim() || null,
      prazo: dataDoFormulario(formData.get("prazo")),
      criadoPorId: usuario?.id ?? null,
      criadoPorNome: usuario?.name ?? null,
    },
  });

  await registrarAuditoria({
    empresaId,
    acao: "CRIAR",
    entidade: "PlanoDesenvolvimento",
    entidadeId: item.id,
    resumo: `Item de PDI "${titulo}" adicionado para ${colaborador.nome}.`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  return { ok: true };
}

export async function alternarItemPDI(
  empresaId: string,
  colaboradorId: string,
  id: string,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);

  const item = await prisma.planoDesenvolvimento.findFirst({
    where: { id, empresaId, colaboradorId },
    select: { id: true, titulo: true, concluido: true, colaborador: { select: { nome: true } } },
  });
  if (!item) return { ok: false, error: "Item não encontrado." };

  const novoValor = !item.concluido;
  await prisma.planoDesenvolvimento.update({
    where: { id },
    data: novoValor
      ? { concluido: true, concluidoEm: new Date(), concluidoPorId: usuario?.id ?? null, concluidoPorNome: usuario?.name ?? null }
      : { concluido: false, concluidoEm: null, concluidoPorId: null, concluidoPorNome: null },
  });

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "PlanoDesenvolvimento",
    entidadeId: id,
    resumo: `Item de PDI "${item.titulo}" de ${item.colaborador.nome} marcado como ${novoValor ? "concluído" : "pendente"}.`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  return { ok: true };
}

export async function excluirItemPDI(
  empresaId: string,
  colaboradorId: string,
  id: string,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const item = await prisma.planoDesenvolvimento.findFirst({
    where: { id, empresaId, colaboradorId },
    select: { id: true, titulo: true, colaborador: { select: { nome: true } } },
  });
  if (!item) return { ok: false, error: "Item não encontrado." };

  await prisma.planoDesenvolvimento.delete({ where: { id } });

  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "PlanoDesenvolvimento",
    entidadeId: id,
    resumo: `Item de PDI "${item.titulo}" removido de ${item.colaborador.nome}.`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  return { ok: true };
}
