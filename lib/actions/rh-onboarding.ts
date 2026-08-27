"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess, requireAcessoAoColaborador } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { dataDoFormulario, somarDiasUTC } from "@/lib/datas";
import { DIAS_DO_MARCO, ITENS_ONBOARDING, itemOnboardingLabel } from "@/lib/constants-onboarding";
import type { ActionResult } from "@/lib/constants";

const ITENS_CATALOGO = ITENS_ONBOARDING.filter((i) => i.value !== "OUTRO");

/** Cria uma linha por item do catálogo que ainda não existe para esta pessoa. */
export async function gerarTrilhaPadrao(
  empresaId: string,
  colaboradorId: string,
): Promise<ActionResult> {
  // Alcançável pelo GESTOR_SETOR pela tela "Meu time" (o botão "Gerar trilha
  // padrão" de um recém-chegado). Por isso a guarda é por COLABORADOR, não por
  // empresa: o gestor passa se o alvo for subordinado dele; os demais papéis
  // seguem a regra de empresa de sempre. O findFirst abaixo ainda amarra o
  // colaborador ao empresaId.
  await requireAcessoAoColaborador(empresaId, colaboradorId);

  const colaborador = await prisma.colaborador.findFirst({
    where: { id: colaboradorId, empresaId },
    // dataAdmissao entra para dar prazo aos marcos de conversa (30/60/90 dias
    // após a admissão) — é só uma data, não segue para lugar nenhum.
    select: { id: true, nome: true, dataAdmissao: true },
  });
  if (!colaborador) return { ok: false, error: "Colaborador não encontrado nesta empresa." };

  const existentes = await prisma.checklistIntegracao.findMany({
    where: { colaboradorId, item: { in: ITENS_CATALOGO.map((i) => i.value) } },
    select: { item: true },
  });
  const jaTem = new Set(existentes.map((e) => e.item));
  const faltando = ITENS_CATALOGO.filter((i) => !jaTem.has(i.value));
  if (faltando.length === 0) {
    return { ok: false, error: "A trilha padrão já foi gerada para esta pessoa." };
  }

  const diasDoMarco = (item: string): number | undefined => DIAS_DO_MARCO[item];
  await prisma.checklistIntegracao.createMany({
    data: faltando.map((i) => {
      const dias = diasDoMarco(i.value);
      return {
        empresaId,
        colaboradorId,
        item: i.value,
        responsavel: i.responsavelPadrao,
        // Marco de conversa nasce com prazo contado da admissão. Sem data de
        // admissão o prazo fica nulo — melhor um marco sem data (a tela mostra
        // "sem prazo") que um prazo inventado a partir de hoje.
        prazo:
          dias !== undefined && colaborador.dataAdmissao
            ? somarDiasUTC(colaborador.dataAdmissao, dias)
            : null,
      };
    }),
  });

  await registrarAuditoria({
    empresaId,
    acao: "CRIAR",
    entidade: "ChecklistIntegracao",
    entidadeId: colaboradorId,
    resumo: `Trilha de integração gerada para ${colaborador.nome} (${faltando.length} item(ns)).`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/integracoes`);
  // A tela "Meu time" mostra o progresso da trilha dos recém-chegados e tem o
  // botão de gerar trilha — precisa refletir a mudança sem F5.
  revalidatePath(`/rh/${empresaId}/time`);
  return { ok: true };
}

export async function adicionarItemIntegracao(
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
  if (!descricao) return { ok: false, error: "Descreva o item da trilha." };

  const item = await prisma.checklistIntegracao.create({
    data: {
      empresaId,
      colaboradorId,
      item: "OUTRO",
      descricao,
      responsavel: String(formData.get("responsavel") ?? "").trim() || null,
      prazo: dataDoFormulario(formData.get("prazo")),
    },
  });

  await registrarAuditoria({
    empresaId,
    acao: "CRIAR",
    entidade: "ChecklistIntegracao",
    entidadeId: item.id,
    resumo: `Item de integração "${descricao}" adicionado para ${colaborador.nome}.`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/integracoes`);
  // A tela "Meu time" mostra o progresso da trilha dos recém-chegados e tem o
  // botão de gerar trilha — precisa refletir a mudança sem F5.
  revalidatePath(`/rh/${empresaId}/time`);
  return { ok: true };
}

export async function alternarItemIntegracao(
  empresaId: string,
  colaboradorId: string,
  id: string,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);

  const item = await prisma.checklistIntegracao.findFirst({
    where: { id, empresaId, colaboradorId },
    select: { id: true, item: true, concluido: true, colaborador: { select: { nome: true } } },
  });
  if (!item) return { ok: false, error: "Item não encontrado." };

  const novoValor = !item.concluido;
  await prisma.checklistIntegracao.update({
    where: { id },
    data: novoValor
      ? { concluido: true, concluidoEm: new Date(), concluidoPorId: usuario?.id ?? null, concluidoPorNome: usuario?.name ?? null }
      : { concluido: false, concluidoEm: null, concluidoPorId: null, concluidoPorNome: null },
  });

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "ChecklistIntegracao",
    entidadeId: id,
    resumo: `${itemOnboardingLabel(item.item)} de ${item.colaborador.nome} marcado como ${novoValor ? "concluído" : "pendente"}.`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/integracoes`);
  // A tela "Meu time" mostra o progresso da trilha dos recém-chegados e tem o
  // botão de gerar trilha — precisa refletir a mudança sem F5.
  revalidatePath(`/rh/${empresaId}/time`);
  return { ok: true };
}

export async function excluirItemIntegracao(
  empresaId: string,
  colaboradorId: string,
  id: string,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const item = await prisma.checklistIntegracao.findFirst({
    where: { id, empresaId, colaboradorId },
    select: { id: true, item: true, colaborador: { select: { nome: true } } },
  });
  if (!item) return { ok: false, error: "Item não encontrado." };

  await prisma.checklistIntegracao.delete({ where: { id } });
  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "ChecklistIntegracao",
    entidadeId: id,
    resumo: `${itemOnboardingLabel(item.item)} removido da trilha de ${item.colaborador.nome}.`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/integracoes`);
  // A tela "Meu time" mostra o progresso da trilha dos recém-chegados e tem o
  // botão de gerar trilha — precisa refletir a mudança sem F5.
  revalidatePath(`/rh/${empresaId}/time`);
  return { ok: true };
}
