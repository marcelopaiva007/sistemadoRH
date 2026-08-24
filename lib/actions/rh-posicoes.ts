"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess, empresasVisiveis } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { validarFusao, carregarPosicoes } from "@/lib/actions/guarda-unificacao";
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
  const usuario = await requireEmpresaAccess(empresaId);

  // Valida ALCANCE e COESÃO dos alvos — a rota sozinha nunca bastou, e o
  // filtro de "mesmo CNPJ" existia só no cliente. Ver guarda-unificacao.ts.
  const check = await validarFusao(await empresasVisiveis(usuario), [origemId], destinoId, carregarPosicoes, "cargo");
  if (!check.ok) return { ok: false, error: check.error };
  const { destino } = check;
  const origem = check.origens[0];

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

export async function unificarGrupoPosicoes(
  empresaId: string,
  origemIds: string[],
  destinoId: string,
  novoNome?: string,
): Promise<ActionResult> {
  if (origemIds.length === 0) {
    return { ok: false, error: "Nenhum cargo selecionado para unificação." };
  }
  const usuario = await requireEmpresaAccess(empresaId);

  // O painel "Semelhantes" agrupa por NOME numa tela CONSOLIDADA: sem esta
  // guarda, um clique migrava colaboradores entre CNPJs e apagava registros de
  // outras empresas. Ver guarda-unificacao.ts.
  const check = await validarFusao(await empresasVisiveis(usuario), origemIds, destinoId, carregarPosicoes, "cargo");
  if (!check.ok) return { ok: false, error: check.error };
  const { destino } = check;

  const idsParaMigrar = origemIds.filter((id) => id !== destinoId);

  await prisma.$transaction(async (tx) => {
    for (const id of idsParaMigrar) {
      await tx.colaborador.updateMany({
        where: { posicaoId: id },
        data: { posicaoId: destinoId },
      });
      await tx.requisitoNR.updateMany({
        where: { posicaoId: id },
        data: { posicaoId: destinoId },
      });
      await tx.vaga.updateMany({
        where: { posicaoId: id },
        data: { posicaoId: destinoId },
      });
      await tx.posicao.delete({ where: { id } });
    }

    if (novoNome && novoNome.trim() !== "" && novoNome.trim() !== destino.nome) {
      await tx.posicao.update({
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
    entidade: "Posicao",
    entidadeId: destino.id,
    resumo: `Unificou ${idsParaMigrar.length} cargo(s) em "${novoNome?.trim() || destino.nome}"`,
    detalhes: { absorvidos: check.origens.map((o) => ({ id: o.id, nome: o.nome })) },
  });

  revalidatePath(`/rh/${empresaId}/posicoes`);
  return { ok: true };
}

export async function removerPosicoesSemColaboradores(
  empresaId: string,
): Promise<{ ok: boolean; removidos: number; error?: string }> {
  await requireEmpresaAccess(empresaId);

  try {
    const posicoesSemColab = await prisma.posicao.findMany({
      where: {
        empresaId,
        colaboradores: { none: {} },
      },
      select: { id: true },
    });

    if (posicoesSemColab.length === 0) {
      return { ok: true, removidos: 0 };
    }

    const ids = posicoesSemColab.map((p) => p.id);

    await prisma.$transaction(async (tx) => {
      // Limpa requisitos NR e vagas vinculadas a cargos vagos sem colaboradores
      await tx.requisitoNR.deleteMany({ where: { posicaoId: { in: ids } } });
      await tx.vaga.deleteMany({ where: { posicaoId: { in: ids } } });
      await tx.posicao.deleteMany({ where: { id: { in: ids } } });
    });

    revalidatePath(`/rh/${empresaId}/posicoes`);
    return { ok: true, removidos: ids.length };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Erro ao remover cargos sem colaboradores.";
    return { ok: false, removidos: 0, error: errorMsg };
  }
}

