"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  requireEmpresaAccess,
  requireRHAccess,
  podeOperarEmpresaRH,
  empresasVisiveis,
} from "@/lib/rh-auth-guard";
import { violouUnique, registroNaoEncontrado } from "@/lib/prisma-erros";
import { registrarAuditoria } from "@/lib/audit";
import { validarFusao, carregarSetores } from "@/lib/actions/guarda-unificacao";
import { decidirLimpeza } from "@/lib/limpeza-catalogo";
import type { ActionResult } from "@/lib/constants";

const setorSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do setor"),
});

/**
 * Resolve o alvo de editar/ativar/excluir pela empresa DO SETOR, não a da URL.
 *
 * A tela de Setores lista o grupo INTEIRO, mas a rota fixa uma empresa só.
 * Validar e filtrar pela empresa da rota fazia o Prisma não achar setor de
 * outro CNPJ (P2025) — e o catch genérico traduzia isso para "nome duplicado",
 * mensagem falsa (aconteceu numa renomeação real em 26/08/2026). Mesma classe
 * do defeito da v1.105.0: escopo multi-empresa que erra sem dar erro.
 *
 * Setor fora do alcance responde igual a inexistente: um id chutado na chamada
 * não pode virar sonda de existência.
 *
 * O alcance é `podeOperarEmpresaRH` — a mesma pergunta de `requireEmpresaAccess`,
 * que guarda a tela e o `createSetor`. Até 25/11/2026 era `usuarioAlcancaEmpresa`,
 * que deixa passar o GESTOR_SETOR com vínculo no CNPJ: ele não abre a tela de
 * Setores, mas um POST direto na action renomeava, desativava ou excluía setor
 * da empresa inteira. Achado da auditoria de permissões de 25/11/2026.
 */
async function resolverSetorAlcancavel(
  id: string,
): Promise<{ ok: true; setorEmpresaId: string } | { ok: false; error: string }> {
  const usuario = await requireRHAccess();
  const setor = await prisma.setor.findUnique({ where: { id }, select: { empresaId: true } });
  if (!setor || !(await podeOperarEmpresaRH(usuario, setor.empresaId))) {
    return { ok: false, error: "Setor não encontrado." };
  }
  return { ok: true, setorEmpresaId: setor.empresaId };
}

// A lista que o usuário está vendo mora na rota da URL; o dado alterado mora na
// empresa do setor. Quando diferem, as duas páginas precisam sair do cache.
function revalidarSetores(empresaIdDaUrl: string, setorEmpresaId: string) {
  revalidatePath(`/rh/${empresaIdDaUrl}/setores`);
  if (setorEmpresaId !== empresaIdDaUrl) revalidatePath(`/rh/${setorEmpresaId}/setores`);
}

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
  } catch (e) {
    if (violouUnique(e)) return { ok: false, error: "Já existe um setor com esse nome nessa empresa." };
    throw e;
  }
  revalidarSetores(empresaIdDefault, targetEmpresaId);
  return { ok: true };
}

export async function updateSetor(
  empresaId: string,
  id: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const alvo = await resolverSetorAlcancavel(id);
  if (!alvo.ok) return alvo;
  const parsed = setorSchema.safeParse({ nome: formData.get("nome") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await prisma.setor.update({
      where: { id, empresaId: alvo.setorEmpresaId },
      data: { nome: parsed.data.nome },
    });
  } catch (e) {
    if (violouUnique(e)) return { ok: false, error: "Já existe um setor com esse nome nessa empresa." };
    if (registroNaoEncontrado(e)) return { ok: false, error: "Setor não encontrado." };
    throw e;
  }
  revalidarSetores(empresaId, alvo.setorEmpresaId);
  return { ok: true };
}

export async function toggleSetorAtivo(empresaId: string, id: string, ativo: boolean): Promise<ActionResult> {
  const alvo = await resolverSetorAlcancavel(id);
  if (!alvo.ok) return alvo;
  try {
    await prisma.setor.update({ where: { id, empresaId: alvo.setorEmpresaId }, data: { ativo } });
  } catch (e) {
    if (registroNaoEncontrado(e)) return { ok: false, error: "Setor não encontrado." };
    throw e;
  }
  revalidarSetores(empresaId, alvo.setorEmpresaId);
  return { ok: true };
}

export async function deleteSetor(empresaId: string, id: string): Promise<ActionResult> {
  const alvo = await resolverSetorAlcancavel(id);
  if (!alvo.ok) return alvo;
  // Sem filtro de empresa: o vínculo colaborador→setor é que conta. Contar pela
  // empresa da URL respondia 0 para setor de outro CNPJ e deixava a exclusão
  // seguir até o P2025.
  const emUso = await prisma.colaborador.count({ where: { setorId: id } });
  if (emUso > 0) {
    return { ok: false, error: `Não é possível excluir: ${emUso} colaborador(es) vinculado(s) a esse setor.` };
  }
  try {
    await prisma.setor.delete({ where: { id, empresaId: alvo.setorEmpresaId } });
  } catch (e) {
    if (registroNaoEncontrado(e)) return { ok: false, error: "Setor não encontrado." };
    throw e;
  }
  revalidarSetores(empresaId, alvo.setorEmpresaId);
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

  // Mesma trilha da fusão em grupo. Este caminho — o botão "Unificar" da LINHA
  // — é o mais usado, e apagava registro e movia gente sem deixar rastro.
  await registrarAuditoria({
    empresaId: destino.empresaId,
    acao: "ATUALIZAR",
    entidade: "Setor",
    entidadeId: destino.id,
    resumo: `Unificou o setor "${origem.nome}" em "${destino.nome}"`,
    detalhes: { absorvido: { id: origem.id, nome: origem.nome, empresaId: origem.empresaId } },
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

/**
 * "Remover N sem funcionários": apaga os setores do CNPJ que NÃO têm nada vivo
 * pendurado. Até 26/11/2026 apagava junto metas, vagas e planos de ação do
 * setor para conseguir removê-lo — agora setor com vaga aberta, meta, plano de
 * ação aberto ou gestor vinculado FICA, e a resposta diz quantos e por quê.
 * A regra está em lib/limpeza-catalogo.ts (testada sem banco).
 */
export async function removerSetoresSemColaboradores(
  empresaId: string,
): Promise<{ ok: boolean; removidos: number; mantidos?: number; motivoMantidos?: string; error?: string }> {
  await requireEmpresaAccess(empresaId);

  try {
    const candidatos = await prisma.setor.findMany({
      where: {
        empresaId,
        colaboradores: { none: {} },
      },
      select: {
        id: true,
        _count: {
          select: {
            colaboradores: true,
            metas: true,
            userEmpresas: true,
            vagas: { where: { status: { in: ["ABERTA", "PAUSADA"] } } },
            planosAcao: { where: { status: { in: ["ABERTO", "EM_ANDAMENTO"] } } },
          },
        },
      },
    });

    const decisao = decidirLimpeza(
      candidatos.map((s) => ({
        id: s.id,
        uso: {
          colaboradores: s._count.colaboradores,
          vagasAbertas: s._count.vagas,
          metas: s._count.metas,
          planosAbertos: s._count.planosAcao,
          requisitosNR: 0,
          gestoresVinculados: s._count.userEmpresas,
        },
      })),
    );

    if (decisao.remover.length > 0) {
      // Só o setor sai. Vaga encerrada e plano concluído/cancelado continuam
      // existindo — o FK é SetNull, eles só perdem o vínculo. A régua repetida
      // no `where` fecha a janela entre a decisão e o delete: se alguém abriu
      // uma vaga no meio, o setor não sai.
      await prisma.setor.deleteMany({
        where: {
          id: { in: decisao.remover },
          empresaId,
          colaboradores: { none: {} },
          metas: { none: {} },
          userEmpresas: { none: {} },
          vagas: { none: { status: { in: ["ABERTA", "PAUSADA"] } } },
          planosAcao: { none: { status: { in: ["ABERTO", "EM_ANDAMENTO"] } } },
        },
      });
      await registrarAuditoria({
        empresaId,
        acao: "EXCLUIR",
        entidade: "Setor",
        resumo:
          `Limpeza: ${decisao.remover.length} setor(es) sem colaboradores removido(s)` +
          (decisao.mantidos > 0 ? `; ${decisao.mantidos} mantido(s) (${decisao.motivoMantidos})` : ""),
      });
    }

    revalidatePath(`/rh/${empresaId}/setores`);
    return {
      ok: true,
      removidos: decisao.remover.length,
      mantidos: decisao.mantidos,
      motivoMantidos: decisao.motivoMantidos,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Erro ao remover setores sem colaboradores.";
    return { ok: false, removidos: 0, error: errorMsg };
  }
}
