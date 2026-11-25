"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signIn } from "@/auth";
import { requireUser } from "@/lib/auth-guard";
import { registrarAuditoria } from "@/lib/audit";
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

  // Trocar a senha derruba as OUTRAS sessões desta conta (25/11/2026): o
  // celular esquecido logado, o computador de quem viu a senha. Até então a
  // senha nova não tirava ninguém — o JWT valia 30 dias sem reler o banco.
  const novoHash = await bcrypt.hash(parsed.data.novaSenha, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: novoHash, sessoesValidasDesde: new Date() },
  });

  await registrarAuditoria({
    acao: "RESET_SENHA",
    entidade: "User",
    entidadeId: user.id,
    resumo: `${registro.username} alterou a própria senha.`,
  });

  // ...mas não a de quem acabou de trocar: entra de novo, aqui mesmo, com a
  // senha nova. O login grava `entrouEm` agora, depois do marcador, e o cookie
  // novo sai nesta resposta (server action pode gravar cookie). Se o login
  // falhar por qualquer motivo (ex.: balde de tentativas cheio), a troca da
  // senha já valeu — a pessoa só precisa entrar de novo.
  await signIn("credentials", {
    username: registro.username,
    password: parsed.data.novaSenha,
    redirect: false,
  }).catch(() => {});

  return { ok: true };
}
