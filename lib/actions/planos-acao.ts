"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { dataDoFormulario, formatarData } from "@/lib/datas";
import { STATUS_PLANO_ACAO } from "@/lib/constants-rh";
import type { ActionResult } from "@/lib/constants";

const VALORES_STATUS = STATUS_PLANO_ACAO.map((s) => s.value);

const planoSchema = z.object({
  titulo: z.string().trim().min(3, "Descreva a ação"),
  descricao: z.string().trim().optional(),
  responsavelNome: z.string().trim().optional(),
  setorId: z.string().trim().optional(),
  pesquisaId: z.string().trim().optional(),
  dimensaoCodigo: z.string().trim().optional(),
});

export async function criarPlanoAcao(empresaId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);
  const raw = {
    titulo: formData.get("titulo"),
    descricao: formData.get("descricao") || undefined,
    responsavelNome: formData.get("responsavelNome") || undefined,
    setorId: formData.get("setorId") || undefined,
    pesquisaId: formData.get("pesquisaId") || undefined,
    dimensaoCodigo: formData.get("dimensaoCodigo") || undefined,
  };
  const parsed = planoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const prazo = dataDoFormulario(formData.get("prazo"));
  if (!prazo) return { ok: false, error: "Informe um prazo válido." };

  if (parsed.data.setorId) {
    const setor = await prisma.setor.findFirst({ where: { id: parsed.data.setorId, empresaId } });
    if (!setor) return { ok: false, error: "Setor não encontrado nesta empresa." };
  }
  if (parsed.data.pesquisaId) {
    const pesquisa = await prisma.pesquisa.findFirst({ where: { id: parsed.data.pesquisaId, empresaId } });
    if (!pesquisa) return { ok: false, error: "Pesquisa não encontrada nesta empresa." };
  }

  const plano = await prisma.planoAcao.create({
    data: {
      empresaId,
      titulo: parsed.data.titulo,
      descricao: parsed.data.descricao || null,
      responsavelNome: parsed.data.responsavelNome || null,
      setorId: parsed.data.setorId || null,
      pesquisaId: parsed.data.pesquisaId || null,
      dimensaoCodigo: parsed.data.dimensaoCodigo || null,
      prazo,
      criadoPorId: usuario?.id ?? null,
      criadoPorNome: usuario?.name ?? null,
    },
  });

  await registrarAuditoria({
    empresaId,
    acao: "CRIAR",
    entidade: "PlanoAcao",
    entidadeId: plano.id,
    resumo: `Plano de ação "${plano.titulo}" criado, prazo ${formatarData(prazo)}.`,
  });

  revalidatePath(`/rh/${empresaId}/planos-acao`);
  return { ok: true };
}

export async function atualizarStatusPlanoAcao(
  empresaId: string,
  id: string,
  status: string,
  motivo?: string,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  if (!VALORES_STATUS.includes(status as (typeof VALORES_STATUS)[number])) {
    return { ok: false, error: "Status inválido." };
  }

  const plano = await prisma.planoAcao.findFirst({ where: { id, empresaId }, select: { titulo: true } });
  if (!plano) return { ok: false, error: "Plano de ação não encontrado." };

  await prisma.planoAcao.update({
    where: { id },
    data: {
      status,
      concluidoEm: status === "CONCLUIDO" ? new Date() : null,
      motivoDecisao: status === "CANCELADO" ? motivo?.trim().slice(0, 200) || null : null,
    },
  });

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "PlanoAcao",
    entidadeId: id,
    resumo: `Plano de ação "${plano.titulo}" marcado como ${status}.`,
  });

  revalidatePath(`/rh/${empresaId}/planos-acao`);
  return { ok: true };
}
