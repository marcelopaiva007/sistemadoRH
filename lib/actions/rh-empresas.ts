"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  empresaDoGrupo,
  marcaDoGrupo,
  requireAdminDoGrupo,
} from "@/lib/grupo-guard";
import type { ActionResult } from "@/lib/constants";

const empresaSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da empresa"),
});

const empresaCreateSchema = empresaSchema.extend({
  marcaId: z.string().trim().min(1, "Informe a marca"),
});

export async function createEmpresa(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { grupoId } = await requireAdminDoGrupo();
  const parsed = empresaCreateSchema.safeParse({
    nome: formData.get("nome"),
    marcaId: formData.get("marcaId"),
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  if (!(await marcaDoGrupo(parsed.data.marcaId, grupoId)))
    return { ok: false, error: "Marca não encontrada." };

  try {
    const newEmpresa = await prisma.empresa.create({ data: parsed.data });

    // Replicate setors and positions from the default company (RSM TELECOM LTDA)
    // Só copia se o modelo for do MESMO grupo (sociedade — lib/grupo.ts):
    // nem a estrutura de um grupo vaza para o outro.
    const defaultCompanyId = "cms6u3mln0003si10dsp1fey5";
    const modeloNoGrupo = await empresaDoGrupo(defaultCompanyId, grupoId);
    const [setoresDefault, posicoesFefault] = await Promise.all([
      modeloNoGrupo
        ? prisma.setor.findMany({ where: { empresaId: defaultCompanyId } })
        : [],
      modeloNoGrupo
        ? prisma.posicao.findMany({ where: { empresaId: defaultCompanyId } })
        : [],
    ]);

    if (setoresDefault.length > 0 || posicoesFefault.length > 0) {
      await Promise.all([
        ...(setoresDefault.length > 0
          ? [
              prisma.setor.createMany({
                data: setoresDefault.map((s) => ({
                  empresaId: newEmpresa.id,
                  nome: s.nome,
                  ativo: s.ativo,
                })),
              }),
            ]
          : []),
        ...(posicoesFefault.length > 0
          ? [
              prisma.posicao.createMany({
                data: posicoesFefault.map((p) => ({
                  empresaId: newEmpresa.id,
                  nome: p.nome,
                  ativo: p.ativo,
                })),
              }),
            ]
          : []),
      ]);
    }
  } catch {
    return { ok: false, error: "Já existe uma empresa com esse nome." };
  }
  revalidatePath("/rh/empresas");
  return { ok: true };
}

export async function updateEmpresa(
  id: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { grupoId } = await requireAdminDoGrupo();
  if (!(await empresaDoGrupo(id, grupoId)))
    return { ok: false, error: "Empresa não encontrada." };
  const parsed = empresaSchema.safeParse({ nome: formData.get("nome") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await prisma.empresa.update({ where: { id }, data: parsed.data });
  } catch {
    return { ok: false, error: "Já existe uma empresa com esse nome." };
  }
  revalidatePath("/rh/empresas");
  return { ok: true };
}

export async function toggleEmpresaAtiva(
  id: string,
  ativo: boolean,
): Promise<ActionResult> {
  const { grupoId } = await requireAdminDoGrupo();
  if (!(await empresaDoGrupo(id, grupoId)))
    return { ok: false, error: "Empresa não encontrada." };
  await prisma.empresa.update({ where: { id }, data: { ativo } });
  revalidatePath("/rh/empresas");
  return { ok: true };
}

export async function deleteEmpresa(id: string): Promise<ActionResult> {
  const { grupoId } = await requireAdminDoGrupo();
  if (!(await empresaDoGrupo(id, grupoId)))
    return { ok: false, error: "Empresa não encontrada." };
  const [setores, colaboradores, pesquisas] = await Promise.all([
    prisma.setor.count({ where: { empresaId: id } }),
    prisma.colaborador.count({ where: { empresaId: id } }),
    prisma.pesquisa.count({ where: { empresaId: id } }),
  ]);
  if (setores > 0 || colaboradores > 0 || pesquisas > 0) {
    return {
      ok: false,
      error: "Não é possível excluir: há setores, colaboradores ou pesquisas vinculados a essa empresa.",
    };
  }
  await prisma.empresa.delete({ where: { id } });
  revalidatePath("/rh/empresas");
  return { ok: true };
}
