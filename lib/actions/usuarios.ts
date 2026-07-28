"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import type { ActionResult } from "@/lib/constants";

const ROLES = ["ADMIN", "DIRETORIA", "RH_MANAGER", "GESTOR_SETOR"] as const;

const usuarioSchema = z
  .object({
    nome: z.string().trim().min(2, "Informe o nome"),
    username: z.string().trim().min(3, "Informe o usuário de login"),
    role: z.enum(ROLES),
    empresaId: z.string().trim().optional(),
    setorId: z.string().trim().optional(),
  })
  .refine((data) => data.role !== "RH_MANAGER" || !!data.empresaId, {
    message: "Selecione a empresa do gestor de RH",
    path: ["empresaId"],
  })
  .refine((data) => data.role !== "GESTOR_SETOR" || !!data.empresaId, {
    message: "Selecione a empresa do gestor de setor",
    path: ["empresaId"],
  })
  .refine((data) => data.role !== "GESTOR_SETOR" || !!data.setorId, {
    message: "Selecione o setor do gestor",
    path: ["setorId"],
  });

function escopoPorRole(data: z.infer<typeof usuarioSchema>) {
  if (data.role === "RH_MANAGER") return { empresaId: data.empresaId!, setorId: null };
  if (data.role === "GESTOR_SETOR") return { empresaId: data.empresaId!, setorId: data.setorId! };
  return { empresaId: null, setorId: null };
}

export async function createUsuario(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const senha = String(formData.get("senha") ?? "");
  if (senha.length < 8) return { ok: false, error: "A senha deve ter pelo menos 8 caracteres." };

  const parsed = usuarioSchema.safeParse({
    nome: formData.get("nome"),
    username: formData.get("username"),
    role: formData.get("role"),
    empresaId: formData.get("empresaId") || undefined,
    setorId: formData.get("setorId") || undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const passwordHash = await bcrypt.hash(senha, 10);
  try {
    await prisma.user.create({
      data: {
        nome: parsed.data.nome,
        username: parsed.data.username,
        role: parsed.data.role,
        passwordHash,
        ...escopoPorRole(parsed.data),
      },
    });
  } catch {
    return { ok: false, error: "Já existe um usuário com esse login." };
  }

  revalidatePath("/usuarios");
  return { ok: true };
}

export async function updateUsuario(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const parsed = usuarioSchema.safeParse({
    nome: formData.get("nome"),
    username: formData.get("username"),
    role: formData.get("role"),
    empresaId: formData.get("empresaId") || undefined,
    setorId: formData.get("setorId") || undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await prisma.user.update({
      where: { id },
      data: {
        nome: parsed.data.nome,
        username: parsed.data.username,
        role: parsed.data.role,
        ...escopoPorRole(parsed.data),
      },
    });
  } catch {
    return { ok: false, error: "Já existe um usuário com esse login." };
  }

  revalidatePath("/usuarios");
  return { ok: true };
}

export async function resetSenhaUsuario(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const senha = String(formData.get("senha") ?? "");
  if (senha.length < 8) return { ok: false, error: "A senha deve ter pelo menos 8 caracteres." };

  const passwordHash = await bcrypt.hash(senha, 10);
  await prisma.user.update({ where: { id }, data: { passwordHash } });

  revalidatePath("/usuarios");
  return { ok: true };
}

export async function deleteUsuario(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (admin.id === id) {
    return { ok: false, error: "Você não pode excluir seu próprio usuário." };
  }
  try {
    await prisma.user.delete({ where: { id } });
  } catch {
    return {
      ok: false,
      error: "Não é possível excluir: há lotes de importação ou outros registros vinculados a esse usuário.",
    };
  }
  revalidatePath("/usuarios");
  return { ok: true };
}
