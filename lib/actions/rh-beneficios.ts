"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { dataDoFormulario, formatarData, hojeUTC } from "@/lib/datas";
import { TIPOS_BENEFICIO, lerValorMonetario, tipoBeneficioLabel } from "@/lib/constants-beneficios";
import type { ActionResult } from "@/lib/constants";

const TIPOS_FIXOS = new Set<string>(TIPOS_BENEFICIO.map((t) => t.value));

/**
 * Válido = está no catálogo fixo OU é um TipoBeneficio ativo desta empresa
 * (lib/actions/rh-tipos-beneficio.ts — catálogo aditivo). Consulta ao banco
 * em vez de confiar no que o cliente mandou: um `<select>` reflete o que
 * existe no momento em que a página carregou, e a tela podia estar aberta
 * há horas quando alguém desativou o tipo.
 */
async function tipoValido(empresaId: string, tipo: string): Promise<boolean> {
  if (TIPOS_FIXOS.has(tipo)) return true;
  const custom = await prisma.tipoBeneficio.findFirst({
    where: { empresaId, nome: tipo, ativo: true },
    select: { id: true },
  });
  return custom !== null;
}

export async function concederBeneficio(
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
  if (!tipo || !(await tipoValido(empresaId, tipo))) {
    return { ok: false, error: "Selecione o tipo do benefício." };
  }

  const dataInicio = dataDoFormulario(formData.get("dataInicio"));
  if (!dataInicio) return { ok: false, error: "Informe a data de início." };
  const dataFim = dataDoFormulario(formData.get("dataFim"));
  if (dataFim && dataFim < dataInicio) {
    return { ok: false, error: "O encerramento não pode ser anterior ao início." };
  }

  // Dois registros vigentes do mesmo benefício para a mesma pessoa é sempre
  // erro de digitação — e dobraria o custo no total da empresa.
  const jaTem = await prisma.beneficioColaborador.findFirst({
    where: {
      colaboradorId,
      tipo,
      OR: [{ dataFim: null }, { dataFim: { gte: dataInicio } }],
    },
    select: { dataInicio: true, dataFim: true },
  });
  if (jaTem) {
    return {
      ok: false,
      error: `Este colaborador já tem ${tipoBeneficioLabel(tipo)} desde ${formatarData(jaTem.dataInicio)}${jaTem.dataFim ? ` até ${formatarData(jaTem.dataFim)}` : ""}. Encerre o atual antes de conceder outro.`,
    };
  }

  const valorEmpresa = lerValorMonetario(formData.get("valorEmpresa"));
  const valorColaborador = lerValorMonetario(formData.get("valorColaborador"));

  const beneficio = await prisma.beneficioColaborador.create({
    data: {
      empresaId,
      colaboradorId,
      tipo,
      operadora: String(formData.get("operadora") ?? "").trim() || null,
      plano: String(formData.get("plano") ?? "").trim() || null,
      valorEmpresa,
      valorColaborador,
      dataInicio,
      dataFim,
      observacoes: String(formData.get("observacoes") ?? "").trim() || null,
      criadoPorId: usuario?.id ?? null,
      criadoPorNome: usuario?.name ?? null,
    },
  });

  await registrarAuditoria({
    empresaId,
    acao: "CRIAR",
    entidade: "BeneficioColaborador",
    entidadeId: beneficio.id,
    // Valor é dado sensível de remuneração: a trilha registra a concessão, não
    // quanto custa (mesma regra do salário na ficha).
    resumo: `${tipoBeneficioLabel(tipo)} concedido a ${colaborador.nome} a partir de ${formatarData(dataInicio)}.`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/beneficios`);
  return { ok: true };
}

export async function encerrarBeneficio(
  empresaId: string,
  colaboradorId: string,
  id: string,
  dataFimTexto?: string,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const beneficio = await prisma.beneficioColaborador.findFirst({
    where: { id, empresaId, colaboradorId },
    select: { id: true, tipo: true, dataInicio: true, dataFim: true, colaborador: { select: { nome: true } } },
  });
  if (!beneficio) return { ok: false, error: "Benefício não encontrado." };
  if (beneficio.dataFim) return { ok: false, error: "Este benefício já foi encerrado." };

  const dataFim = dataFimTexto ? dataDoFormulario(dataFimTexto) : hojeUTC();
  if (!dataFim) return { ok: false, error: "Data de encerramento inválida." };
  if (dataFim < beneficio.dataInicio) {
    return { ok: false, error: "O encerramento não pode ser anterior ao início." };
  }

  await prisma.beneficioColaborador.update({ where: { id }, data: { dataFim } });
  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "BeneficioColaborador",
    entidadeId: id,
    resumo: `${tipoBeneficioLabel(beneficio.tipo)} de ${beneficio.colaborador.nome} encerrado em ${formatarData(dataFim)}.`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/beneficios`);
  return { ok: true };
}

export async function excluirBeneficio(
  empresaId: string,
  colaboradorId: string,
  id: string,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const beneficio = await prisma.beneficioColaborador.findFirst({
    where: { id, empresaId, colaboradorId },
    select: { id: true, tipo: true, colaborador: { select: { nome: true } } },
  });
  if (!beneficio) return { ok: false, error: "Benefício não encontrado." };

  // Excluir é para corrigir lançamento errado. Benefício que a pessoa REALMENTE
  // teve deve ser encerrado, não apagado — senão o custo histórico some.
  await prisma.beneficioColaborador.delete({ where: { id } });
  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "BeneficioColaborador",
    entidadeId: id,
    resumo: `${tipoBeneficioLabel(beneficio.tipo)} de ${beneficio.colaborador.nome} excluído do cadastro.`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/beneficios`);
  return { ok: true };
}
