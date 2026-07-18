"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import type { ActionResult } from "@/lib/constants";

const baseSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do usuário"),
  username: z
    .string()
    .trim()
    .min(3, "O login deve ter pelo menos 3 caracteres")
    .regex(
      /^[a-zA-Z0-9._-]+$/,
      "Use apenas letras, números, ponto, hífen ou underline no login",
    ),
  role: z.enum(["ADMIN", "DIRETORIA"]),
});

const senhaObrigatoria = z
  .string()
  .min(8, "A senha deve ter pelo menos 8 caracteres");
// Na edição a senha é opcional (vazio = manter a atual).
const senhaOpcional = z
  .string()
  .refine((v) => v === "" || v.length >= 8, "A senha deve ter pelo menos 8 caracteres");

export async function createUsuario(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = baseSchema
    .extend({ senha: senhaObrigatoria })
    .safeParse({
      nome: formData.get("nome"),
      username: formData.get("username"),
      role: formData.get("role"),
      senha: formData.get("senha"),
    });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const jaExiste = await prisma.user.findUnique({
    where: { username: parsed.data.username },
  });
  if (jaExiste) return { ok: false, error: "Já existe um usuário com esse login." };

  await prisma.user.create({
    data: {
      nome: parsed.data.nome,
      username: parsed.data.username,
      role: parsed.data.role,
      passwordHash: await bcrypt.hash(parsed.data.senha, 10),
    },
  });

  revalidatePath("/cadastros/usuarios");
  return { ok: true };
}

export async function updateUsuario(
  id: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = baseSchema
    .extend({ senha: senhaOpcional })
    .safeParse({
      nome: formData.get("nome"),
      username: formData.get("username"),
      role: formData.get("role"),
      senha: formData.get("senha") ?? "",
    });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const alvo = await prisma.user.findUnique({ where: { id } });
  if (!alvo) return { ok: false, error: "Usuário não encontrado." };

  // Impede que o admin rebaixe a si mesmo e fique sem acesso administrativo.
  if (alvo.id === admin.id && parsed.data.role !== "ADMIN") {
    return {
      ok: false,
      error: "Você não pode remover o seu próprio acesso administrativo.",
    };
  }

  // Não pode sobrar o sistema sem nenhum administrador.
  if (alvo.role === "ADMIN" && parsed.data.role !== "ADMIN") {
    const totalAdmins = await prisma.user.count({ where: { role: "ADMIN" } });
    if (totalAdmins <= 1) {
      return {
        ok: false,
        error: "Este é o único administrador — não é possível mudar o papel dele.",
      };
    }
  }

  const conflito = await prisma.user.findUnique({
    where: { username: parsed.data.username },
  });
  if (conflito && conflito.id !== id) {
    return { ok: false, error: "Já existe outro usuário com esse login." };
  }

  await prisma.user.update({
    where: { id },
    data: {
      nome: parsed.data.nome,
      username: parsed.data.username,
      role: parsed.data.role,
      ...(parsed.data.senha
        ? { passwordHash: await bcrypt.hash(parsed.data.senha, 10) }
        : {}),
    },
  });

  revalidatePath("/cadastros/usuarios");
  return { ok: true };
}

export async function deleteUsuario(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  if (id === admin.id) {
    return { ok: false, error: "Você não pode excluir o seu próprio usuário." };
  }

  const alvo = await prisma.user.findUnique({ where: { id } });
  if (!alvo) return { ok: false, error: "Usuário não encontrado." };

  if (alvo.role === "ADMIN") {
    const totalAdmins = await prisma.user.count({ where: { role: "ADMIN" } });
    if (totalAdmins <= 1) {
      return { ok: false, error: "Não é possível excluir o único administrador." };
    }
  }

  // O usuário fica referenciado em lotes de importação e fechamentos que ele
  // criou/fechou — nesses casos, excluir violaria a integridade do histórico.
  const [importLotes, fechamentos] = await Promise.all([
    prisma.importLote.count({ where: { usuarioId: id } }),
    prisma.fechamentoMensal.count({ where: { fechadoPorId: id } }),
  ]);
  if (importLotes > 0 || fechamentos > 0) {
    return {
      ok: false,
      error:
        "Não é possível excluir: este usuário tem importações ou fechamentos no histórico. Altere o papel dele em vez de excluir.",
    };
  }

  await prisma.user.delete({ where: { id } });
  revalidatePath("/cadastros/usuarios");
  return { ok: true };
}
