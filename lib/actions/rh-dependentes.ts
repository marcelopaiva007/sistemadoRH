"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { dataDoFormulario } from "@/lib/datas";
import type { ActionResult } from "@/lib/constants";

const dependenteSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do dependente"),
  parentesco: z.string().trim().min(1, "Selecione o parentesco"),
  cpf: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v === "" || v.length === 11, "CPF deve ter 11 dígitos"),
});

function lerFormulario(formData: FormData) {
  return {
    parsed: dependenteSchema.safeParse({
      nome: formData.get("nome") ?? "",
      parentesco: formData.get("parentesco") ?? "",
      cpf: formData.get("cpf") ?? "",
    }),
    dataNascimento: dataDoFormulario(formData.get("dataNascimento")),
    irrf: formData.get("irrf") === "true",
    salarioFamilia: formData.get("salarioFamilia") === "true",
    planoSaude: formData.get("planoSaude") === "true",
  };
}

// O colaborador precisa ser da empresa da rota — sem isso, um RH_MANAGER
// poderia pendurar um dependente em colaborador de outra empresa pelo id.
async function colaboradorDaEmpresa(empresaId: string, colaboradorId: string) {
  return prisma.colaborador.findFirst({
    where: { id: colaboradorId, empresaId },
    select: { id: true, nome: true },
  });
}

export async function criarDependente(
  empresaId: string,
  colaboradorId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  const colaborador = await colaboradorDaEmpresa(empresaId, colaboradorId);
  if (!colaborador) return { ok: false, error: "Colaborador não encontrado nesta empresa." };

  const { parsed, dataNascimento, irrf, salarioFamilia, planoSaude } = lerFormulario(formData);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const dependente = await prisma.dependente.create({
    data: {
      colaboradorId,
      nome: parsed.data.nome,
      parentesco: parsed.data.parentesco,
      cpf: parsed.data.cpf || null,
      dataNascimento,
      irrf,
      salarioFamilia,
      planoSaude,
    },
  });

  await registrarAuditoria({
    empresaId,
    acao: "CRIAR",
    entidade: "Dependente",
    entidadeId: dependente.id,
    resumo: `Dependente ${parsed.data.nome} adicionado a ${colaborador.nome}.`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  return { ok: true };
}

export async function atualizarDependente(
  empresaId: string,
  colaboradorId: string,
  id: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  const colaborador = await colaboradorDaEmpresa(empresaId, colaboradorId);
  if (!colaborador) return { ok: false, error: "Colaborador não encontrado nesta empresa." };

  const { parsed, dataNascimento, irrf, salarioFamilia, planoSaude } = lerFormulario(formData);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const { count } = await prisma.dependente.updateMany({
    where: { id, colaboradorId },
    data: {
      nome: parsed.data.nome,
      parentesco: parsed.data.parentesco,
      cpf: parsed.data.cpf || null,
      dataNascimento,
      irrf,
      salarioFamilia,
      planoSaude,
    },
  });
  if (count === 0) return { ok: false, error: "Dependente não encontrado." };

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "Dependente",
    entidadeId: id,
    resumo: `Dependente ${parsed.data.nome} de ${colaborador.nome} atualizado.`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  return { ok: true };
}

export async function excluirDependente(
  empresaId: string,
  colaboradorId: string,
  id: string,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  const colaborador = await colaboradorDaEmpresa(empresaId, colaboradorId);
  if (!colaborador) return { ok: false, error: "Colaborador não encontrado nesta empresa." };

  const dependente = await prisma.dependente.findFirst({ where: { id, colaboradorId } });
  if (!dependente) return { ok: false, error: "Dependente não encontrado." };

  await prisma.dependente.delete({ where: { id } });
  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "Dependente",
    entidadeId: id,
    resumo: `Dependente ${dependente.nome} de ${colaborador.nome} excluído.`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  return { ok: true };
}
