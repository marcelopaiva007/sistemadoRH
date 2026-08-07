"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { dataDoFormulario, formatarData } from "@/lib/datas";
import { ITENS_OFFBOARDING, itemOffboardingLabel } from "@/lib/constants-offboarding";
import type { ActionResult } from "@/lib/constants";

const ITENS_CATALOGO = ITENS_OFFBOARDING.filter((i) => i.value !== "OUTRO").map((i) => i.value);

/** Cria uma linha por item do catálogo que ainda não existe para esta pessoa. */
export async function gerarChecklistPadrao(
  empresaId: string,
  colaboradorId: string,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const colaborador = await prisma.colaborador.findFirst({
    where: { id: colaboradorId, empresaId },
    select: { id: true, nome: true, dataDesligamento: true },
  });
  if (!colaborador) return { ok: false, error: "Colaborador não encontrado nesta empresa." };
  if (!colaborador.dataDesligamento) {
    return { ok: false, error: "Preencha a data de desligamento na ficha antes de gerar o checklist." };
  }

  const existentes = await prisma.checklistDesligamento.findMany({
    where: { colaboradorId, item: { in: [...ITENS_CATALOGO] } },
    select: { item: true },
  });
  const jaTem = new Set(existentes.map((e) => e.item));
  const faltando = ITENS_CATALOGO.filter((item) => !jaTem.has(item));
  if (faltando.length === 0) return { ok: false, error: "O checklist padrão já foi gerado para esta pessoa." };

  await prisma.checklistDesligamento.createMany({
    data: faltando.map((item) => ({ empresaId, colaboradorId, item })),
  });

  await registrarAuditoria({
    empresaId,
    acao: "CRIAR",
    entidade: "ChecklistDesligamento",
    entidadeId: colaboradorId,
    resumo: `Checklist de desligamento gerado para ${colaborador.nome} (${faltando.length} item(ns)).`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/desligamentos`);
  return { ok: true };
}

/**
 * Dispensa o checklist de offboarding de quem saiu antes do sistema existir —
 * não tem como cobrar devolução de crachá, notebook, EPI etc. de quem já foi
 * embora há meses ou anos. Exige motivo + data de desligamento preenchidos
 * (o mínimo que dá pra confirmar sobre o desligamento) e só vale para quem
 * ainda não tem nenhum item de checklist gerado — quem já começou o
 * checklist termina ele normalmente, não dispensa.
 */
export async function dispensarChecklistDesligamento(
  empresaId: string,
  colaboradorId: string,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);

  const colaborador = await prisma.colaborador.findFirst({
    where: { id: colaboradorId, empresaId },
    select: {
      id: true,
      nome: true,
      dataDesligamento: true,
      motivoDesligamento: true,
      checklistDispensado: true,
      _count: { select: { checklistDesligamento: true } },
    },
  });
  if (!colaborador) return { ok: false, error: "Colaborador não encontrado nesta empresa." };
  if (!colaborador.dataDesligamento) {
    return { ok: false, error: "Preencha a data de desligamento na ficha antes de dispensar o checklist." };
  }
  if (!colaborador.motivoDesligamento) {
    return { ok: false, error: "Preencha o motivo do desligamento na ficha antes de dispensar o checklist." };
  }
  if (colaborador.checklistDispensado) {
    return { ok: false, error: "O checklist desta pessoa já está dispensado." };
  }
  if (colaborador._count.checklistDesligamento > 0) {
    return { ok: false, error: "Esta pessoa já tem checklist gerado — conclua os itens em vez de dispensar." };
  }

  await prisma.colaborador.update({
    where: { id: colaboradorId },
    data: {
      checklistDispensado: true,
      checklistDispensadoEm: new Date(),
      checklistDispensadoPorId: usuario?.id ?? null,
      checklistDispensadoPorNome: usuario?.name ?? null,
    },
  });

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "Colaborador",
    entidadeId: colaboradorId,
    resumo: `Checklist de desligamento de ${colaborador.nome} dispensado (desligamento antigo).`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/desligamentos`);
  return { ok: true };
}

/** Desfaz a dispensa — volta a exigir o checklist normal (gerar + concluir os itens). */
export async function reverterDispensaChecklist(
  empresaId: string,
  colaboradorId: string,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const colaborador = await prisma.colaborador.findFirst({
    where: { id: colaboradorId, empresaId },
    select: { id: true, nome: true, checklistDispensado: true },
  });
  if (!colaborador) return { ok: false, error: "Colaborador não encontrado nesta empresa." };
  if (!colaborador.checklistDispensado) return { ok: false, error: "O checklist desta pessoa não está dispensado." };

  await prisma.colaborador.update({
    where: { id: colaboradorId },
    data: {
      checklistDispensado: false,
      checklistDispensadoEm: null,
      checklistDispensadoPorId: null,
      checklistDispensadoPorNome: null,
    },
  });

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "Colaborador",
    entidadeId: colaboradorId,
    resumo: `Dispensa do checklist de desligamento de ${colaborador.nome} revertida.`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/desligamentos`);
  return { ok: true };
}

export async function adicionarItemChecklist(
  empresaId: string,
  colaboradorId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const colaborador = await prisma.colaborador.findFirst({
    where: { id: colaboradorId, empresaId },
    select: { id: true, nome: true },
  });
  if (!colaborador) return { ok: false, error: "Colaborador não encontrado nesta empresa." };

  const descricao = String(formData.get("descricao") ?? "").trim();
  if (!descricao) return { ok: false, error: "Descreva o item personalizado." };

  const item = await prisma.checklistDesligamento.create({
    data: { empresaId, colaboradorId, item: "OUTRO", descricao },
  });

  await registrarAuditoria({
    empresaId,
    acao: "CRIAR",
    entidade: "ChecklistDesligamento",
    entidadeId: item.id,
    resumo: `Item de checklist "${descricao}" adicionado para ${colaborador.nome}.`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  return { ok: true };
}

export async function alternarItemChecklist(
  empresaId: string,
  colaboradorId: string,
  id: string,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);

  const item = await prisma.checklistDesligamento.findFirst({
    where: { id, empresaId, colaboradorId },
    select: { id: true, item: true, concluido: true, colaborador: { select: { nome: true } } },
  });
  if (!item) return { ok: false, error: "Item não encontrado." };

  const novoValor = !item.concluido;
  await prisma.checklistDesligamento.update({
    where: { id },
    data: novoValor
      ? { concluido: true, concluidoEm: new Date(), concluidoPorId: usuario?.id ?? null, concluidoPorNome: usuario?.name ?? null }
      : { concluido: false, concluidoEm: null, concluidoPorId: null, concluidoPorNome: null },
  });

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "ChecklistDesligamento",
    entidadeId: id,
    resumo: `${itemOffboardingLabel(item.item)} de ${item.colaborador.nome} marcado como ${novoValor ? "concluído" : "pendente"}.`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/desligamentos`);
  return { ok: true };
}

export async function excluirItemChecklist(
  empresaId: string,
  colaboradorId: string,
  id: string,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const item = await prisma.checklistDesligamento.findFirst({
    where: { id, empresaId, colaboradorId },
    select: { id: true, item: true, colaborador: { select: { nome: true } } },
  });
  if (!item) return { ok: false, error: "Item não encontrado." };

  await prisma.checklistDesligamento.delete({ where: { id } });
  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "ChecklistDesligamento",
    entidadeId: id,
    resumo: `${itemOffboardingLabel(item.item)} removido do checklist de ${item.colaborador.nome}.`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/desligamentos`);
  return { ok: true };
}

export async function salvarEntrevistaDesligamento(
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

  const dataEntrevista = dataDoFormulario(formData.get("dataEntrevista"));
  if (!dataEntrevista) return { ok: false, error: "Informe a data da entrevista." };

  const satisfacaoTexto = String(formData.get("satisfacaoGeral") ?? "").trim();
  const satisfacaoGeral = satisfacaoTexto ? Number.parseInt(satisfacaoTexto, 10) : null;
  if (satisfacaoGeral !== null && (satisfacaoGeral < 1 || satisfacaoGeral > 5)) {
    return { ok: false, error: "Satisfação geral deve ser de 1 a 5." };
  }

  const recomendariaTexto = formData.get("recomendariaEmpresa");
  const recomendariaEmpresa = recomendariaTexto === "" || recomendariaTexto === null ? null : recomendariaTexto === "true";

  await prisma.entrevistaDesligamento.upsert({
    where: { colaboradorId },
    create: {
      empresaId,
      colaboradorId,
      dataEntrevista,
      motivoReal: String(formData.get("motivoReal") ?? "").trim() || null,
      recomendariaEmpresa,
      satisfacaoGeral,
      pontosPositivos: String(formData.get("pontosPositivos") ?? "").trim() || null,
      pontosMelhoria: String(formData.get("pontosMelhoria") ?? "").trim() || null,
      observacoes: String(formData.get("observacoes") ?? "").trim() || null,
      entrevistadoPorId: usuario?.id ?? null,
      entrevistadoPorNome: usuario?.name ?? null,
    },
    update: {
      dataEntrevista,
      motivoReal: String(formData.get("motivoReal") ?? "").trim() || null,
      recomendariaEmpresa,
      satisfacaoGeral,
      pontosPositivos: String(formData.get("pontosPositivos") ?? "").trim() || null,
      pontosMelhoria: String(formData.get("pontosMelhoria") ?? "").trim() || null,
      observacoes: String(formData.get("observacoes") ?? "").trim() || null,
    },
  });

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "EntrevistaDesligamento",
    entidadeId: colaboradorId,
    resumo: `Entrevista de desligamento de ${colaborador.nome} registrada (${formatarData(dataEntrevista)}).`,
    // Motivo real e comentários são dado sensível de opinião/saída — a trilha
    // registra que a entrevista foi feita, não o conteúdo.
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  return { ok: true };
}
