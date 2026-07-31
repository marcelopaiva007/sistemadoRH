"use server";

import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireGestaoUsuarios } from "@/lib/auth-guard";
import { auth } from "@/auth";
import { sendEmail } from "@/lib/email";
import { registrarAuditoria, diffCampos } from "@/lib/audit";
import { escreverCookieEmpresaAtiva } from "@/lib/empresa-ativa";
import type { ActionResult } from "@/lib/constants";

const ROLES = ["ADMIN", "DIRETORIA", "RH_MANAGER", "GESTOR_SETOR"] as const;
type Role = (typeof ROLES)[number];

// Roles que precisam de vínculo a empresa — perfis de operação. ADMIN e
// DIRETORIA são perfis globais (sem pivô).
const ROLES_COM_EMPRESA = ["RH_MANAGER", "GESTOR_SETOR"] as const;
const ROLES_POR_EMPRESA = ROLES_COM_EMPRESA;

const emailSchema = z
  .string()
  .trim()
  .email("E-mail inválido")
  .optional()
  .or(z.literal("").transform(() => undefined));

const criarSchema = z
  .object({
    nome: z.string().trim().min(2, "Informe o nome"),
    username: z.string().trim().min(3, "Informe o usuário de login"),
    email: emailSchema,
    telefone: z.string().trim().optional(),
    role: z.enum(ROLES),
    empresaId: z.string().trim().optional(),
    setorId: z.string().trim().optional(),
  })
  .refine((d) => !ROLES_COM_EMPRESA.includes(d.role as (typeof ROLES_COM_EMPRESA)[number]) || !!d.empresaId, {
    message: "Selecione a empresa do usuário",
    path: ["empresaId"],
  })
  .refine((d) => d.role !== "GESTOR_SETOR" || !!d.setorId, {
    message: "Selecione o setor do gestor",
    path: ["setorId"],
  });

const editarSchema = z
  .object({
    nome: z.string().trim().min(2, "Informe o nome"),
    username: z.string().trim().min(3, "Informe o usuário de login"),
    email: emailSchema,
    telefone: z.string().trim().optional(),
    role: z.enum(ROLES),
    ativo: z.boolean(),
  });

const vincularSchema = z
  .object({
    userId: z.string().trim().min(1),
    empresaId: z.string().trim().min(1, "Selecione a empresa"),
    role: z.enum(ROLES_POR_EMPRESA),
    setorId: z.string().trim().optional(),
    papelPrincipal: z.boolean(),
  })
  .refine((d) => d.role !== "GESTOR_SETOR" || !!d.setorId, {
    message: "Selecione o setor do gestor",
    path: ["setorId"],
  });

const CONVITE_EXPIRA_EM_DIAS = 7;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createUsuario(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireGestaoUsuarios();

  const senha = String(formData.get("senha") ?? "");
  if (senha.length < 8) return { ok: false, error: "A senha deve ter pelo menos 8 caracteres." };

  const parsed = criarSchema.safeParse({
    nome: formData.get("nome"),
    username: formData.get("username"),
    email: formData.get("email") || undefined,
    telefone: formData.get("telefone") || undefined,
    role: formData.get("role"),
    empresaId: formData.get("empresaId") || undefined,
    setorId: formData.get("setorId") || undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const { nome, username, email, telefone, role, empresaId, setorId } = parsed.data;
  const passwordHash = await bcrypt.hash(senha, 10);

  try {
    // RH_MANAGER/GESTOR_SETOR precisam criar User + UserEmpresa no mesmo
    // `$transaction` — sem isso, um crash entre os dois `create` deixa o user
    // sem pivô e o login passa mas todo guard RH quebra.
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          nome,
          username,
          email: email ?? null,
          telefone: telefone ?? null,
          passwordHash,
          role,
          // Mantém colunas legadas em sincronia com a ativa inicial — o que
          // existia antes do pivô. Útil até a Fase 8 (limpeza).
          empresaId: empresaId ?? null,
          setorId: setorId ?? null,
        },
      });
      if (empresaId && ROLES_COM_EMPRESA.includes(role as (typeof ROLES_COM_EMPRESA)[number])) {
        await tx.userEmpresa.create({
          data: {
            userId: user.id,
            empresaId,
            role,
            setorId: setorId ?? null,
            papelPrincipal: true,
          },
        });
      }
      return user;
    });

    await registrarAuditoria({
      acao: "CRIAR",
      entidade: "User",
      entidadeId: result.id,
      resumo: `Criou usuário ${result.username} (${result.role})`,
      detalhes: { nome: result.nome, email: result.email, role: result.role, empresaId, setorId },
    });

    revalidatePath("/cadastros/usuarios");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unique constraint") && msg.includes("username")) {
      return { ok: false, error: "Já existe um usuário com esse login." };
    }
    if (msg.includes("Unique constraint") && msg.includes("email")) {
      return { ok: false, error: "Já existe um usuário com esse e-mail." };
    }
    return { ok: false, error: "Erro ao criar usuário." };
  }
}

export async function updateUsuario(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireGestaoUsuarios();

  const parsed = editarSchema.safeParse({
    nome: formData.get("nome"),
    username: formData.get("username"),
    email: formData.get("email") || undefined,
    telefone: formData.get("telefone") || undefined,
    role: formData.get("role"),
    ativo: formData.get("ativo") === "true" || formData.get("ativo") === "on",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const antes = await prisma.user.findUnique({
    where: { id },
    select: { nome: true, username: true, email: true, telefone: true, role: true, ativo: true },
  });
  if (!antes) return { ok: false, error: "Usuário não encontrado." };

  try {
    const depois = await prisma.user.update({
      where: { id },
      data: {
        nome: parsed.data.nome,
        username: parsed.data.username,
        email: parsed.data.email ?? null,
        telefone: parsed.data.telefone ?? null,
        role: parsed.data.role,
        ativo: parsed.data.ativo,
      },
    });

    await registrarAuditoria({
      acao: "ATUALIZAR",
      entidade: "User",
      entidadeId: id,
      resumo: `Editou usuário ${depois.username}`,
      detalhes: diffCampos(antes as Record<string, unknown>, {
        nome: depois.nome,
        username: depois.username,
        email: depois.email,
        telefone: depois.telefone,
        role: depois.role,
        ativo: depois.ativo,
      }),
    });

    revalidatePath("/cadastros/usuarios");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unique constraint") && msg.includes("username")) {
      return { ok: false, error: "Já existe um usuário com esse login." };
    }
    if (msg.includes("Unique constraint") && msg.includes("email")) {
      return { ok: false, error: "Já existe um usuário com esse e-mail." };
    }
    return { ok: false, error: "Erro ao atualizar usuário." };
  }
}

export async function resetSenhaUsuario(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireGestaoUsuarios();

  const senha = String(formData.get("senha") ?? "");
  if (senha.length < 8) return { ok: false, error: "A senha deve ter pelo menos 8 caracteres." };

  const passwordHash = await bcrypt.hash(senha, 10);
  const user = await prisma.user.update({
    where: { id },
    data: { passwordHash },
    select: { username: true },
  });

  await registrarAuditoria({
    acao: "RESET_SENHA",
    entidade: "User",
    entidadeId: id,
    resumo: `Redefiniu senha de ${user.username}`,
  });

  revalidatePath("/cadastros/usuarios");
  return { ok: true };
}

export async function deleteUsuario(id: string): Promise<ActionResult> {
  const admin = await requireGestaoUsuarios();
  if (admin.id === id) {
    return { ok: false, error: "Você não pode excluir seu próprio usuário." };
  }

  const alvo = await prisma.user.findUnique({
    where: { id },
    select: { role: true, ativo: true, username: true },
  });
  if (!alvo) return { ok: false, error: "Usuário não encontrado." };

  // Bloqueia último ADMIN ativo — sem isso, fica fácil trancar o sistema.
  if (alvo.role === "ADMIN" && alvo.ativo) {
    const outrosAdmins = await prisma.user.count({
      where: { role: "ADMIN", ativo: true, NOT: { id } },
    });
    if (outrosAdmins === 0) {
      return { ok: false, error: "Não é possível excluir/desativar o único ADMIN ativo do sistema." };
    }
  }

  try {
    await prisma.user.delete({ where: { id } });
    await registrarAuditoria({
      acao: "EXCLUIR",
      entidade: "User",
      entidadeId: id,
      resumo: `Excluiu usuário ${alvo.username}`,
    });
  } catch {
    // FK em Pesquisas/lotes de importação — soft delete preserva histórico.
    await prisma.user.update({ where: { id }, data: { ativo: false } });
    await registrarAuditoria({
      acao: "DESATIVAR",
      entidade: "User",
      entidadeId: id,
      resumo: `Desativou usuário ${alvo.username} (há registros vinculados)`,
    });
  }

  revalidatePath("/cadastros/usuarios");
  return { ok: true };
}

export async function vincularEmpresaUsuario(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireGestaoUsuarios();

  const parsed = vincularSchema.safeParse({
    userId: formData.get("userId"),
    empresaId: formData.get("empresaId"),
    role: formData.get("role"),
    setorId: formData.get("setorId") || undefined,
    papelPrincipal: formData.get("papelPrincipal") === "on" || formData.get("papelPrincipal") === "true",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const { userId, empresaId, role, setorId, papelPrincipal } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      // Se for marcada principal, rebaixa qualquer outra principal do mesmo user.
      if (papelPrincipal) {
        await tx.userEmpresa.updateMany({
          where: { userId, papelPrincipal: true },
          data: { papelPrincipal: false },
        });
      }

      // Upsert: se já existe (mesmo que inativa), reativa; senão cria.
      // O `@@unique([userId, empresaId])` garante uma linha por par.
      const existente = await tx.userEmpresa.findUnique({
        where: { userId_empresaId: { userId, empresaId } },
      });

      if (existente) {
        await tx.userEmpresa.update({
          where: { id: existente.id },
          data: {
            role,
            setorId: setorId ?? null,
            ativo: true,
            papelPrincipal,
          },
        });
      } else {
        await tx.userEmpresa.create({
          data: {
            userId,
            empresaId,
            role,
            setorId: setorId ?? null,
            papelPrincipal,
          },
        });
      }
    });

    await registrarAuditoria({
      acao: "VINCULAR",
      entidade: "UserEmpresa",
      entidadeId: `${userId}:${empresaId}`,
      empresaId,
      resumo: `Vinculou usuário ${userId} à empresa ${empresaId} como ${role}`,
      detalhes: { role, setorId, papelPrincipal },
    });

    revalidatePath("/cadastros/usuarios");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao vincular." };
  }
}

export async function desativarVinculoUsuario(userId: string, empresaId: string): Promise<ActionResult> {
  await requireGestaoUsuarios();

  const vinculo = await prisma.userEmpresa.findUnique({
    where: { userId_empresaId: { userId, empresaId } },
  });
  if (!vinculo) return { ok: false, error: "Vínculo não encontrado." };

  // Bloqueia desativar a única empresa ativa do user — equivaleria a "tirar
  // o login" sem passar pela tela de exclusão do User.
  const ativosRestantes = await prisma.userEmpresa.count({
    where: { userId, ativo: true, NOT: { id: vinculo.id } },
  });
  if (ativosRestantes === 0) {
    return { ok: false, error: "Não é possível desativar a única empresa ativa do usuário." };
  }

  await prisma.userEmpresa.update({
    where: { id: vinculo.id },
    data: { ativo: false },
  });

  await registrarAuditoria({
    acao: "DESVINCULAR",
    entidade: "UserEmpresa",
    entidadeId: vinculo.id,
    empresaId,
    resumo: `Desvinculou usuário ${userId} da empresa ${empresaId}`,
  });

  revalidatePath("/cadastros/usuarios");
  return { ok: true };
}

export async function reativarVinculoUsuario(userId: string, empresaId: string): Promise<ActionResult> {
  await requireGestaoUsuarios();

  const vinculo = await prisma.userEmpresa.findUnique({
    where: { userId_empresaId: { userId, empresaId } },
  });
  if (!vinculo) return { ok: false, error: "Vínculo não encontrado." };

  await prisma.userEmpresa.update({
    where: { id: vinculo.id },
    data: { ativo: true },
  });

  await registrarAuditoria({
    acao: "VINCULAR",
    entidade: "UserEmpresa",
    entidadeId: vinculo.id,
    empresaId,
    resumo: `Reativou vínculo do usuário ${userId} na empresa ${empresaId}`,
  });

  revalidatePath("/cadastros/usuarios");
  return { ok: true };
}

export async function trocarEmpresaAtiva(empresaId: string, setorId?: string | null): Promise<ActionResult> {
  const session = await auth();
  const user = session?.user;
  if (!user) return { ok: false, error: "Não autenticado." };

  // ADMIN/DIRETORIA não têm pivô — cookie é irrelevante, mas aceitamos setar
  // para ficar consistente com a Fase 7.
  if (user.role !== "ADMIN" && user.role !== "DIRETORIA") {
    const temAcesso = user.empresas.some((e) => e.empresaId === empresaId && e.ativo);
    if (!temAcesso) return { ok: false, error: "Sem acesso a esta empresa." };
  }

  await escreverCookieEmpresaAtiva(empresaId);
  revalidatePath("/", "layout");
  return { ok: true };
}

const conviteSchema = z.object({
  email: z.string().trim().email("E-mail inválido"),
  nome: z.string().trim().min(2, "Informe o nome"),
  role: z.enum(ROLES_COM_EMPRESA),
  empresaId: z.string().trim().min(1, "Selecione a empresa"),
  setorId: z.string().trim().optional(),
});

export async function criarConviteUsuario(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireGestaoUsuarios();

  const parsed = conviteSchema.safeParse({
    email: formData.get("email"),
    nome: formData.get("nome"),
    role: formData.get("role"),
    empresaId: formData.get("empresaId"),
    setorId: formData.get("setorId") || undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const { email, nome, role, empresaId, setorId } = parsed.data;

  // Se o e-mail já bate com um user existente, vincula direto — não manda
  // convite (não faria sentido o user "aceitar" um convite pra si mesmo).
  const userExistente = await prisma.user.findUnique({ where: { email } });
  if (userExistente) {
    try {
      await prisma.userEmpresa.upsert({
        where: { userId_empresaId: { userId: userExistente.id, empresaId } },
        update: { role, setorId: setorId ?? null, ativo: true },
        create: { userId: userExistente.id, empresaId, role, setorId: setorId ?? null, papelPrincipal: false },
      });
      await registrarAuditoria({
        acao: "VINCULAR",
        entidade: "UserEmpresa",
        entidadeId: `${userExistente.id}:${empresaId}`,
        empresaId,
        resumo: `Vinculou usuário existente ${userExistente.username} (${email}) como ${role}`,
        detalhes: { via: "convite", role, setorId },
      });
      revalidatePath("/cadastros/usuarios");
      return { ok: true };
    } catch {
      return { ok: false, error: "Erro ao vincular usuário existente." };
    }
  }

  // Senão, cria User inativo + gera token + manda e-mail.
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiraEm = new Date(Date.now() + CONVITE_EXPIRA_EM_DIAS * 24 * 60 * 60 * 1000);

  // Username derivado do e-mail — único no sistema. Conflito cai em fallback.
  const usernameBase = email.split("@")[0].replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 24) || "user";
  let username = usernameBase;
  let tentativa = 0;
  while (await prisma.user.findUnique({ where: { username } })) {
    tentativa += 1;
    username = `${usernameBase}${tentativa}`;
    if (tentativa > 50) return { ok: false, error: "Não foi possível gerar username único." };
  }

  // Senha placeholder — nunca vai ser usada: o `aceitarConviteUsuario`
  // sobrescreve antes do user logar pela primeira vez. Manter como hash
  // garante que mesmo se o user for ativado por outro caminho, a senha
  // placeholder não valide nada.
  const placeholder = await bcrypt.hash(randomBytes(32).toString("hex"), 10);

  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          nome,
          username,
          email,
          passwordHash: placeholder,
          role,
          ativo: false,
          conviteExpiraEm: expiraEm,
          conviteTokenHash: tokenHash,
          empresaId: empresaId,
          setorId: setorId ?? null,
        },
      });
      await tx.userEmpresa.create({
        data: {
          userId: user.id,
          empresaId,
          role,
          setorId: setorId ?? null,
          papelPrincipal: true,
        },
      });
    });

    const baseUrl = process.env.NEXTAUTH_URL ?? process.env.APP_URL ?? "http://localhost:3000";
    const link = `${baseUrl}/conta/aceitar-convite?token=${encodeURIComponent(token)}`;

    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { nome: true },
    });

    const html = `
      <p>Olá, ${nome},</p>
      <p>Você foi convidado(a) a acessar o RH do grupo como <strong>${role === "RH_MANAGER" ? "gestor(a) de RH" : "gestor(a) de setor"}</strong>${empresa ? ` em <strong>${empresa.nome}</strong>` : ""}.</p>
      <p>Para ativar seu acesso, defina sua senha clicando abaixo. O link expira em ${CONVITE_EXPIRA_EM_DIAS} dias.</p>
      <p style="margin:24px 0">
        <a href="${link}" style="background:#0f172a;color:white;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">Definir senha e entrar</a>
      </p>
      <p>Ou cole este link no navegador:</p>
      <p style="word-break:break-all;color:#475569">${link}</p>
    `.trim();

    const envio = await sendEmail({
      to: email,
      subject: "Convite para acessar o sistema de RH",
      html,
      text: `Acesse ${link} para definir sua senha. O link expira em ${CONVITE_EXPIRA_EM_DIAS} dias.`,
    });
    if (!envio.ok) {
      return { ok: false, error: `Convite criado, mas e-mail falhou: ${envio.error}` };
    }

    await registrarAuditoria({
      acao: "ENVIAR_CONVITE",
      entidade: "User",
      entidadeId: email,
      empresaId,
      resumo: `Convidou ${email} como ${role} em ${empresa?.nome ?? empresaId}`,
      detalhes: { role, setorId, expiraEm },
    });

    revalidatePath("/cadastros/usuarios");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unique constraint") && msg.includes("email")) {
      return { ok: false, error: "Já existe um usuário com esse e-mail." };
    }
    return { ok: false, error: "Erro ao criar convite." };
  }
}

const aceitarSchema = z.object({
  token: z.string().trim().min(10),
  senha: z.string().min(8, "A senha deve ter pelo menos 8 caracteres."),
});

export async function aceitarConviteUsuario(token: string, senha: string): Promise<ActionResult> {
  const parsed = aceitarSchema.safeParse({ token, senha });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const tokenHash = hashToken(parsed.data.token);

  const user = await prisma.user.findFirst({
    where: {
      conviteTokenHash: tokenHash,
      ativo: false,
    },
    select: { id: true, email: true, nome: true, conviteExpiraEm: true },
  });
  if (!user) return { ok: false, error: "Convite inválido ou já utilizado." };
  if (!user.conviteExpiraEm || user.conviteExpiraEm < new Date()) {
    return { ok: false, error: "Convite expirado." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.senha, 10);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        ativo: true,
        passwordHash,
        conviteTokenHash: null,
        conviteExpiraEm: null,
      },
    });
    await tx.userEmpresa.updateMany({
      where: { userId: user.id },
      data: { ativo: true },
    });
  });

  await registrarAuditoria({
    acao: "ACEITAR_CONVITE",
    entidade: "User",
    entidadeId: user.id,
    resumo: `${user.nome} (${user.email}) aceitou o convite`,
  });

  return { ok: true };
}