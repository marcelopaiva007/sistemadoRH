"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess, empresasVisiveis } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { validarFusao, carregarSetores } from "@/lib/actions/guarda-unificacao";
import type { ActionResult } from "@/lib/constants";

const setorSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do setor"),
});

export async function createSetor(
  empresaIdDefault: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const targetEmpresaId = (formData.get("empresaId") as string) || empresaIdDefault;
  await requireEmpresaAccess(targetEmpresaId);
  const parsed = setorSchema.safeParse({ nome: formData.get("nome") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await prisma.setor.create({ data: { empresaId: targetEmpresaId, nome: parsed.data.nome } });
  } catch {
    return { ok: false, error: "Já existe um setor com esse nome nessa empresa." };
  }
  revalidatePath(`/rh/${empresaIdDefault}/setores`);
  return { ok: true };
}

export async function updateSetor(
  empresaId: string,
  id: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  const parsed = setorSchema.safeParse({ nome: formData.get("nome") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await prisma.setor.update({ where: { id, empresaId }, data: { nome: parsed.data.nome } });
  } catch {
    return { ok: false, error: "Já existe um setor com esse nome nessa empresa." };
  }
  revalidatePath(`/rh/${empresaId}/setores`);
  return { ok: true };
}

export async function toggleSetorAtivo(empresaId: string, id: string, ativo: boolean): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  await prisma.setor.update({ where: { id, empresaId }, data: { ativo } });
  revalidatePath(`/rh/${empresaId}/setores`);
  return { ok: true };
}

export async function deleteSetor(empresaId: string, id: string): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  const emUso = await prisma.colaborador.count({ where: { setorId: id, empresaId } });
  if (emUso > 0) {
    return { ok: false, error: `Não é possível excluir: ${emUso} colaborador(es) vinculado(s) a esse setor.` };
  }
  await prisma.setor.delete({ where: { id, empresaId } });
  revalidatePath(`/rh/${empresaId}/setores`);
  return { ok: true };
}

export async function unificarSetores(
  empresaId: string,
  origemId: string,
  destinoId: string
): Promise<ActionResult> {
  if (origemId === destinoId) {
    return { ok: false, error: "O setor de origem e destino não podem ser os mesmos." };
  }
  const usuario = await requireEmpresaAccess(empresaId);

  // Valida ALCANCE e COESÃO dos alvos — a rota sozinha nunca bastou, e o
  // filtro de "mesmo CNPJ" existia só no cliente. Ver guarda-unificacao.ts.
  const check = await validarFusao(await empresasVisiveis(usuario), [origemId], destinoId, carregarSetores, "setor");
  if (!check.ok) return { ok: false, error: check.error };
  const { destino } = check;
  const origem = check.origens[0];

  await prisma.$transaction(async (tx) => {
    // 1. Reatribui colaboradores
    await tx.colaborador.updateMany({
      where: { setorId: origemId },
      data: { setorId: destinoId },
    });

    // 2. Reatribui metas
    await tx.meta.updateMany({
      where: { setorId: origemId },
      data: { setorId: destinoId },
    });

    // 3. Reatribui vagas
    await tx.vaga.updateMany({
      where: { setorId: origemId },
      data: { setorId: destinoId },
    });

    // 4. Reatribui userEmpresas
    await tx.userEmpresa.updateMany({
      where: { setorId: origemId },
      data: { setorId: destinoId },
    });

    // 5. Reatribui planos de ação
    await tx.planoAcao.updateMany({
      where: { setorId: origemId },
      data: { setorId: destinoId },
    });

    // 6. Remove o setor duplicado
    await tx.setor.delete({ where: { id: origemId } });
  });

  revalidatePath(`/rh/${empresaId}/setores`);
  return { ok: true };
}

export async function limparDuplicatasSetoresAuto(empresaId: string): Promise<{ ok: boolean; removidos: number; error?: string }> {
  await requireEmpresaAccess(empresaId);

  const setores = await prisma.setor.findMany({
    where: { empresaId },
    include: {
      _count: { select: { colaboradores: true, vagas: true, metas: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const porNome = new Map<string, typeof setores>();
  for (const s of setores) {
    const chave = s.nome.trim().toLowerCase();
    const list = porNome.get(chave) ?? [];
    list.push(s);
    porNome.set(chave, list);
  }

  let removidos = 0;

  for (const list of porNome.values()) {
    if (list.length <= 1) continue;

    // Escolhe o mestre: com mais colaboradores ou ativo mais antigo
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
          where: { setorId: dup.id },
          data: { setorId: mestre.id },
        });
        await tx.meta.updateMany({
          where: { setorId: dup.id },
          data: { setorId: mestre.id },
        });
        await tx.vaga.updateMany({
          where: { setorId: dup.id },
          data: { setorId: mestre.id },
        });
        await tx.userEmpresa.updateMany({
          where: { setorId: dup.id },
          data: { setorId: mestre.id },
        });
        await tx.planoAcao.updateMany({
          where: { setorId: dup.id },
          data: { setorId: mestre.id },
        });
        await tx.setor.delete({ where: { id: dup.id } });
      });
      removidos++;
    }

    if (mestre.nome !== mestre.nome.trim()) {
      await prisma.setor.update({
        where: { id: mestre.id },
        data: { nome: mestre.nome.trim() },
      });
    }
  }

  revalidatePath(`/rh/${empresaId}/setores`);
  return { ok: true, removidos };
}

export async function unificarGrupoSetores(
  empresaId: string,
  origemIds: string[],
  destinoId: string,
  novoNome?: string,
): Promise<ActionResult> {
  if (origemIds.length === 0) {
    return { ok: false, error: "Nenhum setor selecionado para unificação." };
  }
  const usuario = await requireEmpresaAccess(empresaId);

  // O painel "Semelhantes" agrupa por NOME numa tela CONSOLIDADA: sem esta
  // guarda, um clique migrava colaboradores entre CNPJs e apagava registros de
  // outras empresas. Ver guarda-unificacao.ts.
  const check = await validarFusao(await empresasVisiveis(usuario), origemIds, destinoId, carregarSetores, "setor");
  if (!check.ok) return { ok: false, error: check.error };
  const { destino } = check;

  const idsParaMigrar = origemIds.filter((id) => id !== destinoId);

  await prisma.$transaction(async (tx) => {
    for (const id of idsParaMigrar) {
      await tx.colaborador.updateMany({
        where: { setorId: id },
        data: { setorId: destinoId },
      });
      await tx.meta.updateMany({
        where: { setorId: id },
        data: { setorId: destinoId },
      });
      await tx.vaga.updateMany({
        where: { setorId: id },
        data: { setorId: destinoId },
      });
      await tx.userEmpresa.updateMany({
        where: { setorId: id },
        data: { setorId: destinoId },
      });
      await tx.planoAcao.updateMany({
        where: { setorId: id },
        data: { setorId: destinoId },
      });
      await tx.setor.delete({ where: { id } });
    }

    if (novoNome && novoNome.trim() !== "" && novoNome.trim() !== destino.nome) {
      await tx.setor.update({
        where: { id: destinoId },
        data: { nome: novoNome.trim() },
      });
    }
  });

  // Fusão APAGA registros e move gente: sem trilha não há como saber o que
  // existia, nem desfazer. Era a única operação destrutiva do módulo sem
  // auditoria nenhuma.
  await registrarAuditoria({
    empresaId: destino.empresaId,
    acao: "ATUALIZAR",
    entidade: "Setor",
    entidadeId: destino.id,
    resumo: `Unificou ${idsParaMigrar.length} setor(s) em "${novoNome?.trim() || destino.nome}"`,
    detalhes: { absorvidos: check.origens.map((o) => ({ id: o.id, nome: o.nome })) },
  });

  revalidatePath(`/rh/${empresaId}/setores`);
  return { ok: true };
}

export async function removerSetoresSemColaboradores(
  empresaId: string,
): Promise<{ ok: boolean; removidos: number; error?: string }> {
  await requireEmpresaAccess(empresaId);

  try {
    const setoresSemColab = await prisma.setor.findMany({
      where: {
        empresaId,
        colaboradores: { none: {} },
      },
      select: { id: true },
    });

    if (setoresSemColab.length === 0) {
      return { ok: true, removidos: 0 };
    }

    const ids = setoresSemColab.map((s) => s.id);

    await prisma.$transaction(async (tx) => {
      await tx.meta.deleteMany({ where: { setorId: { in: ids } } });
      await tx.vaga.deleteMany({ where: { setorId: { in: ids } } });
      await tx.planoAcao.deleteMany({ where: { setorId: { in: ids } } });
      await tx.userEmpresa.updateMany({ where: { setorId: { in: ids } }, data: { setorId: null } });
      await tx.setor.deleteMany({ where: { id: { in: ids } } });
    });

    revalidatePath(`/rh/${empresaId}/setores`);
    return { ok: true, removidos: ids.length };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Erro ao remover setores sem colaboradores.";
    return { ok: false, removidos: 0, error: errorMsg };
  }
}

