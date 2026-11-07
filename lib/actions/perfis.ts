"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireGestaoUsuarios } from "@/lib/auth-guard";
import { ehMaster, grupoDoUsuario } from "@/lib/grupo";
import { registrarAuditoria } from "@/lib/audit";
import { SISTEMAS, todasAsPermissoes } from "@/lib/permissoes/catalogo";
import type { ActionResult } from "@/lib/constants";

// Ações do controle de acesso (Onda 2a): criar/editar/excluir Perfil e
// atribuir/remover perfil de usuário.
//
// Guarda: `requireGestaoUsuarios` — mexer em perfil é conceder acesso, então
// mora no mesmo lugar que criar usuário. Desde a v1.188.0 esse portão é SÓ do
// MASTER (área de admin, app/admin); até a v1.187.0 era ADMIN e DIRETORIA. NÃO usa o
// controle de acesso NOVO para se proteger: seria a cobra mordendo o rabo (uma
// permissão de "editar perfis" cuja edição se protege por ela mesma). Fica na
// guarda por papel enquanto a Onda 3 não migra o resto — e quando migrar, esta
// será uma das últimas, com cuidado.
//
// GRUPOS (v1.186.0): o perfil é um MOLDE compartilhado pelos dois grupos —
// editar um muda o acesso de gente do outro grupo. Por isso criar, editar e
// excluir perfil passou a ser só do MASTER. Dar e tirar perfil de uma conta
// também é só dele desde a v1.188.0 (até ali, ADMIN/DIRETORIA davam perfil às
// contas do PRÓPRIO grupo — o recorte abaixo ficou como defesa).

/** Quem administra alcança esta conta? MASTER alcança todas; os demais, só as do próprio grupo. */
async function alcancaConta(userId: string): Promise<boolean> {
  const quem = await requireGestaoUsuarios();
  if (ehMaster(quem)) return true;
  const [meu, dele] = await Promise.all([
    grupoDoUsuario(quem.id),
    grupoDoUsuario(userId),
  ]);
  return meu !== null && meu === dele;
}

const CAMINHO = "/admin/perfis";

/** Conjunto das permissões válidas, para recusar grant inventado. */
const PERMISSOES_VALIDAS = new Set(todasAsPermissoes());
const SLUGS_SISTEMA = new Set(SISTEMAS.map((s) => s.slug));

/**
 * Um grant é válido? Aceita:
 *   - `*` (tudo)
 *   - `<sistema>:*` (sistema inteiro, inclusive telas futuras)
 *   - uma permissão exata do catálogo
 *
 * `<sistema>:<area>:*` NÃO é aceito na gravação de propósito: a matriz da tela
 * concede ver/editar explicitamente, e um curinga de área esconderia da matriz
 * quais ações estão ligadas. Curinga só nos dois níveis que a tela oferece como
 * atalho ("acesso total" e "sistema inteiro").
 */
function grantValido(grant: string): boolean {
  if (grant === "*") return true;
  if (grant.endsWith(":*")) return SLUGS_SISTEMA.has(grant.slice(0, -2));
  return PERMISSOES_VALIDAS.has(grant);
}

function limparGrants(grants: string[]): { ok: true; csv: string } | { ok: false; error: string } {
  const limpos = [...new Set(grants.map((g) => g.trim()).filter(Boolean))];
  const invalido = limpos.find((g) => !grantValido(g));
  if (invalido) return { ok: false, error: `Permissão desconhecida: ${invalido}.` };
  if (limpos.length === 0) return { ok: false, error: "Um perfil precisa de ao menos uma permissão." };
  return { ok: true, csv: limpos.join(",") };
}

export async function salvarPerfil(input: {
  id?: string | null;
  /** v1.199.0: o cliente do perfil novo; null = modelo FASTMAI. Ignorado na edição. */
  grupoId?: string | null;
  nome: string;
  descricao?: string | null;
  grants: string[];
}): Promise<ActionResult & { id?: string }> {
  if (!ehMaster(await requireGestaoUsuarios()))
    return {
      ok: false,
      error:
        "Só o usuário master cria, edita ou exclui perfis.",
    };

  const nome = (input.nome ?? "").trim();
  if (!nome) return { ok: false, error: "Dê um nome ao perfil." };

  const grants = limparGrants(input.grants);
  if (!grants.ok) return grants;

  // Em qual cliente o perfil mora (v1.199.0). Na edição, o do próprio perfil —
  // não se muda perfil de cliente; no novo, o informado (null = modelo).
  let grupoId: string | null = input.grupoId ?? null;
  if (input.id) {
    const atual = await prisma.perfil.findUnique({ where: { id: input.id }, select: { grupoId: true } });
    if (!atual) return { ok: false, error: "Perfil não encontrado." };
    grupoId = atual.grupoId;
  } else if (grupoId) {
    const g = await prisma.grupo.findUnique({ where: { id: grupoId }, select: { id: true } });
    if (!g) return { ok: false, error: "Cliente não encontrado." };
  }

  // Nome único NO CLIENTE (ou entre os modelos) — checar antes dá a mensagem
  // que resolve; o unique do banco estoura um erro que ninguém entende.
  const homonimo = await prisma.perfil.findFirst({
    where: { nome: { equals: nome, mode: "insensitive" }, grupoId, NOT: input.id ? { id: input.id } : undefined },
    select: { id: true },
  });
  if (homonimo)
    return { ok: false, error: `Já existe um perfil chamado "${nome}" ${grupoId ? "neste cliente" : "entre os modelos"}.` };

  // Perfil-semente pode ser EDITADO (é o ponto: ajustar o acesso de hoje), mas
  // o `sistema=true` não se mexe daqui — é o que impede a tela de apagá-lo.
  const perfil = input.id
    ? await prisma.perfil.update({
        where: { id: input.id },
        data: { nome, descricao: (input.descricao ?? "").trim() || null, grants: grants.csv },
      })
    : await prisma.perfil.create({
        data: { nome, grupoId, descricao: (input.descricao ?? "").trim() || null, grants: grants.csv, sistema: false },
      });

  await registrarAuditoria({
    acao: input.id ? "ATUALIZAR" : "CRIAR",
    entidade: "Perfil",
    entidadeId: perfil.id,
    resumo: `${input.id ? "Editou" : "Criou"} o ${grupoId ? "perfil de acesso" : "modelo de perfil"} "${nome}"`,
    detalhes: { grants: grants.csv },
  });

  revalidatePath(CAMINHO);
  return { ok: true, id: perfil.id };
}

export async function excluirPerfil(input: {
  id: string;
}): Promise<ActionResult> {
  if (!ehMaster(await requireGestaoUsuarios()))
    return {
      ok: false,
      error:
        "Só o usuário master cria, edita ou exclui perfis.",
    };

  const perfil = await prisma.perfil.findUnique({
    where: { id: input.id },
    select: { id: true, nome: true, sistema: true, _count: { select: { usuarios: true } } },
  });
  if (!perfil) return { ok: false, error: "Perfil não encontrado." };

  // Os quatro perfis-semente são a rede de segurança do acesso de todo mundo:
  // apagá-los deixaria os usuários do papel correspondente órfãos.
  if (perfil.sistema) return { ok: false, error: "Os perfis padrão não podem ser excluídos, só editados." };

  // Não apagar perfil que alguém usa — sumiria acesso sem aviso. Tira de todo
  // mundo primeiro, depois exclui.
  if (perfil._count.usuarios > 0) {
    return {
      ok: false,
      error: `Este perfil está atribuído a ${perfil._count.usuarios} usuário(s). Tire de todos antes de excluir.`,
    };
  }

  await prisma.perfil.delete({ where: { id: perfil.id } });
  await registrarAuditoria({
    acao: "EXCLUIR",
    entidade: "Perfil",
    entidadeId: perfil.id,
    resumo: `Excluiu o perfil de acesso "${perfil.nome}"`,
  });

  revalidatePath(CAMINHO);
  return { ok: true };
}

/** Atribui um perfil a um usuário (idempotente pelo unique userId+perfilId). */
export async function atribuirPerfil(input: {
  userId: string;
  perfilId: string;
}): Promise<ActionResult> {
  if (!(await alcancaConta(input.userId)))
    return { ok: false, error: "Usuário não encontrado." };

  const [usuario, perfil] = await Promise.all([
    prisma.user.findUnique({ where: { id: input.userId }, select: { id: true, nome: true, grupoId: true } }),
    prisma.perfil.findUnique({ where: { id: input.perfilId }, select: { id: true, nome: true, grupoId: true } }),
  ]);
  if (!usuario) return { ok: false, error: "Usuário não encontrado." };
  if (!perfil) return { ok: false, error: "Perfil não encontrado." };
  // Perfil é do cliente (v1.199.0): conta só recebe perfil do cliente dela.
  // Modelo FASTMAI não se dá a ninguém de cliente — dá-se a cópia.
  if (perfil.grupoId !== usuario.grupoId)
    return { ok: false, error: "Este perfil é de outro cliente. Use um perfil do cliente da pessoa." };

  const jaTem = await prisma.userPerfil.findUnique({
    where: { userId_perfilId: { userId: usuario.id, perfilId: perfil.id } },
    select: { id: true },
  });
  if (jaTem) return { ok: true };

  await prisma.userPerfil.create({ data: { userId: usuario.id, perfilId: perfil.id } });
  await registrarAuditoria({
    acao: "VINCULAR",
    entidade: "UserPerfil",
    entidadeId: usuario.id,
    resumo: `Deu o perfil "${perfil.nome}" a ${usuario.nome}`,
  });

  revalidatePath("/admin/usuarios");
  revalidatePath(CAMINHO);
  return { ok: true };
}

export async function removerPerfilDoUsuario(input: {
  userId: string;
  perfilId: string;
}): Promise<ActionResult> {
  if (!(await alcancaConta(input.userId)))
    return { ok: false, error: "Usuário não encontrado." };

  const vinculo = await prisma.userPerfil.findUnique({
    where: { userId_perfilId: { userId: input.userId, perfilId: input.perfilId } },
    select: { id: true, user: { select: { nome: true } }, perfil: { select: { nome: true } } },
  });
  if (!vinculo) return { ok: true };

  await prisma.userPerfil.delete({ where: { id: vinculo.id } });
  await registrarAuditoria({
    acao: "DESVINCULAR",
    entidade: "UserPerfil",
    entidadeId: input.userId,
    resumo: `Tirou o perfil "${vinculo.perfil.nome}" de ${vinculo.user.nome}`,
  });

  revalidatePath("/admin/usuarios");
  revalidatePath(CAMINHO);
  return { ok: true };
}
