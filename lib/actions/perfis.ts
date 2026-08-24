"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireGestaoUsuarios } from "@/lib/auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { SISTEMAS, todasAsPermissoes } from "@/lib/permissoes/catalogo";
import type { ActionResult } from "@/lib/constants";

// Ações do controle de acesso (Onda 2a): criar/editar/excluir Perfil e
// atribuir/remover perfil de usuário.
//
// Guarda: `requireGestaoUsuarios` (ADMIN e DIRETORIA) — mexer em perfil é
// conceder acesso, então mora no mesmo lugar que criar usuário. NÃO usa o
// controle de acesso NOVO para se proteger: seria a cobra mordendo o rabo (uma
// permissão de "editar perfis" cuja edição se protege por ela mesma). Fica na
// guarda por papel enquanto a Onda 3 não migra o resto — e quando migrar, esta
// será uma das últimas, com cuidado.

const CAMINHO = "/cadastros/perfis";

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
  nome: string;
  descricao?: string | null;
  grants: string[];
}): Promise<ActionResult & { id?: string }> {
  await requireGestaoUsuarios();

  const nome = (input.nome ?? "").trim();
  if (!nome) return { ok: false, error: "Dê um nome ao perfil." };

  const grants = limparGrants(input.grants);
  if (!grants.ok) return grants;

  // Nome único — checar antes dá a mensagem que resolve; o unique do banco
  // estoura um erro que ninguém entende.
  const homonimo = await prisma.perfil.findFirst({
    where: { nome, NOT: input.id ? { id: input.id } : undefined },
    select: { id: true },
  });
  if (homonimo) return { ok: false, error: `Já existe um perfil chamado "${nome}".` };

  // Perfil-semente pode ser EDITADO (é o ponto: ajustar o acesso de hoje), mas
  // o `sistema=true` não se mexe daqui — é o que impede a tela de apagá-lo.
  const perfil = input.id
    ? await prisma.perfil.update({
        where: { id: input.id },
        data: { nome, descricao: (input.descricao ?? "").trim() || null, grants: grants.csv },
      })
    : await prisma.perfil.create({
        data: { nome, descricao: (input.descricao ?? "").trim() || null, grants: grants.csv, sistema: false },
      });

  await registrarAuditoria({
    acao: input.id ? "ATUALIZAR" : "CRIAR",
    entidade: "Perfil",
    entidadeId: perfil.id,
    resumo: `${input.id ? "Editou" : "Criou"} o perfil de acesso "${nome}"`,
    detalhes: { grants: grants.csv },
  });

  revalidatePath(CAMINHO);
  return { ok: true, id: perfil.id };
}

export async function excluirPerfil(input: { id: string }): Promise<ActionResult> {
  await requireGestaoUsuarios();

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
export async function atribuirPerfil(input: { userId: string; perfilId: string }): Promise<ActionResult> {
  await requireGestaoUsuarios();

  const [usuario, perfil] = await Promise.all([
    prisma.user.findUnique({ where: { id: input.userId }, select: { id: true, nome: true } }),
    prisma.perfil.findUnique({ where: { id: input.perfilId }, select: { id: true, nome: true } }),
  ]);
  if (!usuario) return { ok: false, error: "Usuário não encontrado." };
  if (!perfil) return { ok: false, error: "Perfil não encontrado." };

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

  revalidatePath("/cadastros/usuarios");
  revalidatePath(CAMINHO);
  return { ok: true };
}

export async function removerPerfilDoUsuario(input: { userId: string; perfilId: string }): Promise<ActionResult> {
  await requireGestaoUsuarios();

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

  revalidatePath("/cadastros/usuarios");
  revalidatePath(CAMINHO);
  return { ok: true };
}
