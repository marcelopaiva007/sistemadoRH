"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import type { ActionResult } from "@/lib/constants";

const posicaoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da posição"),
});

export async function createPosicao(
  empresaIdDefault: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const targetEmpresaId = (formData.get("empresaId") as string) || empresaIdDefault;
  await requireEmpresaAccess(targetEmpresaId);
  const parsed = posicaoSchema.safeParse({ nome: formData.get("nome") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await prisma.posicao.create({ data: { empresaId: targetEmpresaId, nome: parsed.data.nome } });
  } catch {
    return { ok: false, error: "Já existe uma posição com esse nome nessa empresa." };
  }
  revalidatePath(`/rh/${empresaIdDefault}/posicoes`);
  return { ok: true };
}

export async function updatePosicao(
  empresaId: string,
  id: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  const parsed = posicaoSchema.safeParse({ nome: formData.get("nome") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await prisma.posicao.update({ where: { id, empresaId }, data: { nome: parsed.data.nome } });
  } catch {
    return { ok: false, error: "Já existe uma posição com esse nome nessa empresa." };
  }
  revalidatePath(`/rh/${empresaId}/posicoes`);
  return { ok: true };
}

export async function togglePosicaoAtiva(empresaId: string, id: string, ativo: boolean): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  await prisma.posicao.update({ where: { id, empresaId }, data: { ativo } });
  revalidatePath(`/rh/${empresaId}/posicoes`);
  return { ok: true };
}

export async function deletePosicao(empresaId: string, id: string): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  const emUso = await prisma.colaborador.count({ where: { posicaoId: id, empresaId } });
  if (emUso > 0) {
    return { ok: false, error: `Não é possível excluir: ${emUso} colaborador(es) vinculado(s) a essa posição.` };
  }
  await prisma.posicao.delete({ where: { id, empresaId } });
  revalidatePath(`/rh/${empresaId}/posicoes`);
  return { ok: true };
}

export async function unificarPosicoes(
  empresaId: string,
  origemId: string,
  destinoId: string
): Promise<ActionResult> {
  if (origemId === destinoId) {
    return { ok: false, error: "O cargo de origem e destino não podem ser os mesmos." };
  }
  await requireEmpresaAccess(empresaId);

  const [origem, destino] = await Promise.all([
    prisma.posicao.findUnique({ where: { id: origemId } }),
    prisma.posicao.findUnique({ where: { id: destinoId } }),
  ]);

  if (!origem || !destino) {
    return { ok: false, error: "Cargo de origem ou destino não encontrado." };
  }

  await prisma.$transaction(async (tx) => {
    // 1. Reatribui colaboradores
    await tx.colaborador.updateMany({
      where: { posicaoId: origemId },
      data: { posicaoId: destinoId },
    });

    // 2. Reatribui requisitos NR
    await tx.requisitoNR.updateMany({
      where: { posicaoId: origemId },
      data: { posicaoId: destinoId },
    });

    // 3. Reatribui vagas
    await tx.vaga.updateMany({
      where: { posicaoId: origemId },
      data: { posicaoId: destinoId },
    });

    // 4. Remove a posição duplicada
    await tx.posicao.delete({ where: { id: origemId } });
  });

  revalidatePath(`/rh/${empresaId}/posicoes`);
  return { ok: true };
}

export async function limparDuplicatasPosicoesAuto(empresaId: string): Promise<{ ok: boolean; removidos: number; error?: string }> {
  await requireEmpresaAccess(empresaId);

  const posicoes = await prisma.posicao.findMany({
    where: { empresaId },
    include: {
      _count: { select: { colaboradores: true, vagas: true, requisitosNR: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const porNome = new Map<string, typeof posicoes>();
  for (const p of posicoes) {
    const chave = p.nome.trim().toLowerCase();
    const list = porNome.get(chave) ?? [];
    list.push(p);
    porNome.set(chave, list);
  }

  let removidos = 0;

  for (const list of porNome.values()) {
    if (list.length <= 1) continue;

    // Escolhe o item principal: com mais colaboradores ou ativo mais antigo
    const ordenados = [...list].sort((a, b) => {
      const diffColabs = (b._count?.colaboradores ?? 0) - (a._count?.colaboradores ?? 0);
      if (diffColabs !== 0) return diffColabs;
      if (a.ativo !== b.ativo) return a.ativo ? -1 : 1;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    const mestre = ordenados[0];
    const duplicadas = ordenados.slice(1);

    for (const dup of duplicadas) {
      await prisma.$transaction(async (tx) => {
        await tx.colaborador.updateMany({
          where: { posicaoId: dup.id },
          data: { posicaoId: mestre.id },
        });
        await tx.requisitoNR.updateMany({
          where: { posicaoId: dup.id },
          data: { posicaoId: mestre.id },
        });
        await tx.vaga.updateMany({
          where: { posicaoId: dup.id },
          data: { posicaoId: mestre.id },
        });
        await tx.posicao.delete({ where: { id: dup.id } });
      });
      removidos++;
    }

    // Normaliza nome do mestre caso tenha espaço sobrando
    if (mestre.nome !== mestre.nome.trim()) {
      await prisma.posicao.update({
        where: { id: mestre.id },
        data: { nome: mestre.nome.trim() },
      });
    }
  }

  revalidatePath(`/rh/${empresaId}/posicoes`);
  return { ok: true, removidos };
}
