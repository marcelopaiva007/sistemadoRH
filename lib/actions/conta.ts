"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guard";
import type { ActionResult } from "@/lib/constants";

const senhaSchema = z
  .object({
    senhaAtual: z.string().min(1, "Informe sua senha atual"),
    novaSenha: z.string().min(8, "A nova senha deve ter pelo menos 8 caracteres"),
    confirmarSenha: z.string().min(1, "Confirme a nova senha"),
  })
  .refine((data) => data.novaSenha === data.confirmarSenha, {
    message: "As senhas não coincidem",
    path: ["confirmarSenha"],
  });

export async function alterarSenha(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = senhaSchema.safeParse({
    senhaAtual: formData.get("senhaAtual"),
    novaSenha: formData.get("novaSenha"),
    confirmarSenha: formData.get("confirmarSenha"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const registro = await prisma.user.findUnique({ where: { id: user.id } });
  if (!registro) return { ok: false, error: "Usuário não encontrado." };

  const senhaValida = await bcrypt.compare(parsed.data.senhaAtual, registro.passwordHash);
  if (!senhaValida) return { ok: false, error: "Senha atual incorreta." };

  const novoHash = await bcrypt.hash(parsed.data.novaSenha, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: novoHash } });

  return { ok: true };
}
