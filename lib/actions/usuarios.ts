"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "node:crypto";
import { sendEmail } from "@/lib/email";
import { urlBaseDoCliente } from "@/lib/endereco-cliente";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireGestaoUsuarios } from "@/lib/auth-guard";
import { empresasVisiveis, usuarioAlcancaEmpresa } from "@/lib/rh-auth-guard";
import { redirect } from "next/navigation";
import { ehMaster, grupoDoUsuario, PAPEIS_DE_RESTRICAO } from "@/lib/grupo";
import { auth } from "@/auth";
import { registrarAuditoria, diffCampos } from "@/lib/audit";
import { escreverCookieEmpresaAtiva } from "@/lib/empresa-ativa";
import type { ActionResult } from "@/lib/constants";
import { deixariaSistemaSemAdmin, promoveriaAGestorSemSetor } from "@/lib/usuarios-regras";
import { aplicarMarcasQueVe } from "@/lib/marcas-que-ve";
import { candidatosDeLogin, normalizarLogin, problemaNoLogin } from "@/lib/login-usuario";
import { loginJaUsado } from "@/lib/usuario-por-identificador";

const ROLES = ["ADMIN", "DIRETORIA", "RH_MANAGER", "GESTOR_SETOR"] as const;
type Role = (typeof ROLES)[number];

// Roles que precisam de vínculo a empresa — perfis de operação. ADMIN e
// DIRETORIA são perfis globais (sem pivô).
const ROLES_COM_EMPRESA = ["RH_MANAGER", "GESTOR_SETOR"] as const;
const ROLES_POR_EMPRESA = ROLES_COM_EMPRESA;

// E-mail é CONTATO desde a v1.191.0 (avisos e os links de "Esqueci minha
// senha"/"Esqueci meu usuário"), não identifica a conta: pode repetir entre os
// usuários da mesma pessoa — o "marcelo" e o "marcelo.lm" recebem no mesmo
// endereço.
const emailSchema = z
  .string()
  .trim()
  .email("E-mail inválido")
  .optional()
  .or(z.literal("").transform(() => undefined));

const criarSchema = z
  .object({
    // Opcional na criação (v1.193.0): para entrar bastam usuário e senha. Sem
    // nome, a pessoa aparece na lista pelo próprio usuário.
    nome: z.string().trim().optional(),
    // O formato (minúsculas, sem "@", sem espaço) e o "não repete" são
    // conferidos na action — lib/login-usuario.ts.
    username: z.string().trim().min(1, "Informe o usuário de login"),
    email: emailSchema,
    telefone: z.string().trim().optional(),
    role: z.enum(ROLES),
    // O acesso vem por UM dos dois: a marca inteira ou um CNPJ. Marca dá acesso
    // dinâmico (CNPJ novo entra sozinho); CNPJ é pontual e é o único que
    // comporta GESTOR_SETOR, já que setor pertence a um CNPJ específico.
    marcaId: z.string().trim().optional(),
    empresaId: z.string().trim().optional(),
    setorId: z.string().trim().optional(),
  })
  .refine(
    (d) =>
      !ROLES_COM_EMPRESA.includes(d.role as (typeof ROLES_COM_EMPRESA)[number]) ||
      !!d.empresaId ||
      !!d.marcaId,
    { message: "Selecione a marca ou o CNPJ do usuário", path: ["empresaId"] },
  )
  .refine((d) => !(d.marcaId && d.empresaId), {
    message: "Escolha marca ou CNPJ, não os dois",
    path: ["marcaId"],
  })
  .refine((d) => d.role !== "GESTOR_SETOR" || !d.marcaId, {
    message: "Gestor de setor precisa de um CNPJ — setor pertence a um CNPJ, não à marca",
    path: ["marcaId"],
  })
  .refine((d) => d.role !== "GESTOR_SETOR" || !!d.setorId, {
    message: "Selecione o setor do gestor",
    path: ["setorId"],
  });

const editarSchema = z
  .object({
    nome: z.string().trim().min(2, "Informe o nome"),
    // O formato (minúsculas, sem "@", sem espaço) e o "não repete" são
    // conferidos na action — lib/login-usuario.ts.
    username: z.string().trim().min(1, "Informe o usuário de login"),
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

// ── GRUPO (sociedade) na gestão de usuários — ver lib/grupo.ts ─────────────
//
// O MASTER administra as contas de TODOS os grupos e escolhe em qual grupo
// cada conta nova nasce. Desde a v1.188.0 ele é o ÚNICO que passa por
// `requireGestaoUsuarios` (a gestão de contas foi para a área de admin,
// app/admin). Os ramos abaixo para ADMIN e DIRETORIA — só as contas do PRÓPRIO
// grupo, ninguém do outro — ficaram como defesa caso o portão volte a abrir.
// Conta fora do alcance responde "Usuário não encontrado." — a mesma resposta
// de id que não existe, para a tela não virar oráculo de quem existe no outro
// grupo.

type EscopoGestao = {
  admin: Awaited<ReturnType<typeof requireGestaoUsuarios>>;
  master: boolean;
  grupoId: string | null;
};

async function escopoGestao(): Promise<EscopoGestao> {
  const admin = await requireGestaoUsuarios();
  const master = ehMaster(admin);
  const grupoId = master ? null : await grupoDoUsuario(admin.id);
  if (!master && !grupoId) redirect("/");
  return { admin, master, grupoId };
}

/** O grupo do usuário-alvo, se quem administra o alcança; `false` se não. */
async function grupoDoAlvo(
  esc: EscopoGestao,
  userId: string,
): Promise<string | null | false> {
  const alvo = await prisma.user.findUnique({
    where: { id: userId },
    select: { grupoId: true, role: true },
  });
  if (!alvo) return false;
  // Conta MASTER não é alvo destas ações nem para outro MASTER: a tela não a
  // lista, e rebaixá-la, desativá-la ou excluí-la por chamada montada à mão
  // deixaria o sistema sem ninguém que gere contas (desde a v1.188.0 só o
  // MASTER gere). Recuperar o acesso dela é pelo "Esqueci minha senha" ou
  // por scripts/recuperar-acesso-admin.ts.
  if (alvo.role === "MASTER") return false;
  if (esc.master) return alvo.grupoId;
  if (alvo.grupoId !== esc.grupoId) return false;
  return alvo.grupoId;
}

async function empresaNoGrupo(
  empresaId: string,
  grupoId: string | null,
): Promise<boolean> {
  if (!grupoId) return false;
  const e = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { marca: { select: { grupoId: true } } },
  });
  return e?.marca.grupoId === grupoId;
}

async function marcaNoGrupo(
  marcaId: string,
  grupoId: string | null,
): Promise<boolean> {
  if (!grupoId) return false;
  const m = await prisma.marca.findUnique({
    where: { id: marcaId },
    select: { grupoId: true },
  });
  return m?.grupoId === grupoId;
}

const ERRO_ALVO = { ok: false as const, error: "Usuário não encontrado." };

/**
 * Marca de ADMIN/DIRETORIA não é "vínculo de trabalho": é RESTRIÇÃO de acesso
 * (lib/grupo.ts, `direcaoRestrita`) — com marca marcada a pessoa deixa de ver o
 * grupo inteiro. Por isso só o admin (MASTER) mexe nelas: se a própria
 * Diretoria pudesse, ela se soltaria da restrição ou prenderia um colega.
 * Vínculo de RH e de gestor segue com quem já cuidava dele.
 */
async function marcasDaDirecaoSoComMaster(
  esc: EscopoGestao,
  userId: string,
  marcaId?: string,
): Promise<ActionResult | null> {
  if (esc.master) return null;
  const [alvo, vinculo] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
    marcaId
      ? prisma.userMarca.findUnique({
          where: { userId_marcaId: { userId, marcaId } },
          select: { role: true },
        })
      : null,
  ]);
  // O vínculo também conta, e não só o papel de hoje: rebaixar a pessoa a RH,
  // mexer na marca e promovê-la de volta seria o atalho para desfazer o que o
  // admin decidiu.
  const ehDirecao = alvo && PAPEIS_DE_RESTRICAO.includes(alvo.role);
  const ehRestricao = vinculo && PAPEIS_DE_RESTRICAO.includes(vinculo.role);
  if (ehDirecao || ehRestricao) {
    return {
      ok: false,
      error: "As marcas de Diretoria e Administrativo só o admin muda, na tela de admin.",
    };
  }
  return null;
}

/**
 * O usuário já existe (sem diferença de maiúsculas)? Devolve a mensagem para a
 * tela, `null` se o nome está livre.
 *
 * A mensagem depende de ONDE está a conta que já tem o nome (revisão da
 * v1.191.0):
 * - em OUTRO cliente, criando: é o caso de "um usuário por cliente" — sugere
 *   um nome livre para a mesma pessoa aqui ("marcelo" → "marcelo.lm");
 * - no MESMO cliente, criando: a pessoa provavelmente já tem acesso aqui —
 *   sugerir "marcelo.lm2" seria ensinar a criar conta duplicada;
 * - renomeando: só pede outro nome (com uma sugestão livre, se houver).
 * Sem cliente de destino conhecido, não há sufixo para sugerir.
 */
async function loginRepetido(
  login: string,
  grupoDestinoId: string | null,
  modo: "criar" | "renomear",
  excetoId?: string,
): Promise<string | null> {
  const existente = await loginJaUsado(login, excetoId, prisma, grupoDestinoId);
  if (!existente) return null;
  const onde = existente.grupoNome ? ` (cliente ${existente.grupoNome})` : "";
  const base = `Já existe o usuário “${existente.username}”${onde}. Usuário não se repete no mesmo cliente (nem com maiúsculas diferentes), nem entre clientes que entram pelo endereço comum.`;
  const mesmoCliente = existente.grupoId !== null && existente.grupoId === grupoDestinoId;
  if (modo === "criar" && mesmoCliente) {
    return `${base} Se é a mesma pessoa, ela já tem acesso neste cliente — use essa conta. Se é outra pessoa, escolha outro nome.`;
  }

  const grupoDestino = grupoDestinoId
    ? await prisma.grupo.findUnique({ where: { id: grupoDestinoId }, select: { nome: true } })
    : null;
  let sugestao: string | null = null;
  if (grupoDestino) {
    for (const candidato of candidatosDeLogin(login, grupoDestino.nome)) {
      if (!(await loginJaUsado(candidato, excetoId, prisma, grupoDestinoId))) {
        sugestao = candidato;
        break;
      }
    }
  }
  if (modo === "criar" && grupoDestino && sugestao) {
    return `${base} Se é a mesma pessoa no cliente ${grupoDestino.nome}, crie o usuário dela aqui com outro nome — por exemplo “${sugestao}” — e ela pode usar a mesma senha.`;
  }
  return `${base} Escolha outro nome${sugestao ? ` — por exemplo “${sugestao}”` : ""}.`;
}

export async function createUsuario(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const esc = await escopoGestao();

  const senha = String(formData.get("senha") ?? "");
  if (senha.length < 8) return { ok: false, error: "A senha deve ter pelo menos 8 caracteres." };

  const parsed = criarSchema.safeParse({
    nome: formData.get("nome") || undefined,
    username: formData.get("username"),
    email: formData.get("email") || undefined,
    telefone: formData.get("telefone") || undefined,
    role: formData.get("role"),
    marcaId: formData.get("marcaId") || undefined,
    empresaId: formData.get("empresaId") || undefined,
    setorId: formData.get("setorId") || undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const { email, telefone, role, marcaId, empresaId, setorId } = parsed.data;

  // Usuário novo nasce no padrão: minúsculas, sem "@" e sem espaço.
  const username = normalizarLogin(parsed.data.username);
  const problemaLogin = problemaNoLogin(username);
  if (problemaLogin) return { ok: false, error: problemaLogin };
  const nome = parsed.data.nome || username;

  // Em que grupo a conta nasce: o MASTER escolhe; os demais criam no próprio.
  const grupoId = esc.master
    ? String(formData.get("grupoId") ?? "").trim() || null
    : esc.grupoId;
  if (
    !grupoId ||
    !(await prisma.grupo.findFirst({
      where: { id: grupoId, ativo: true },
      select: { id: true },
    }))
  ) {
    return { ok: false, error: "Escolha o cliente do usuário." };
  }
  if (marcaId && !(await marcaNoGrupo(marcaId, grupoId))) {
    return { ok: false, error: "A marca escolhida não é deste cliente." };
  }
  if (empresaId && !(await empresaNoGrupo(empresaId, grupoId))) {
    return { ok: false, error: "O CNPJ escolhido não é deste cliente." };
  }
  // Um usuário por grupo: quem trabalha nos dois tem dois usuários.
  const repetido = await loginRepetido(username, grupoId, "criar");
  if (repetido) return { ok: false, error: repetido };

  const passwordHash = await bcrypt.hash(senha, 10);

  // Perfis de acesso escolhidos no próprio formulário — é o que "conecta o
  // usuário ao perfil na hora de criar", em vez de criar e depois atribuir em
  // outra tela. Só ids que existem; um id inventado no POST é ignorado, não
  // derruba a criação.
  const perfilIds = [...new Set(formData.getAll("perfilId").map(String).filter(Boolean))];
  const perfisValidos =
    perfilIds.length > 0
      ? (
          // Só perfis do cliente da conta (v1.199.0).
          await prisma.perfil.findMany({ where: { id: { in: perfilIds }, grupoId }, select: { id: true } })
        ).map((p) => p.id)
      : [];

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
          grupoId,
          // Mantém colunas legadas em sincronia com a ativa inicial — o que
          // existia antes do pivô. Útil até a Fase 8 (limpeza).
          empresaId: empresaId ?? null,
          setorId: setorId ?? null,
        },
      });
      if (perfisValidos.length > 0) {
        await tx.userPerfil.createMany({
          data: perfisValidos.map((perfilId) => ({ userId: user.id, perfilId })),
        });
      }
      if (ROLES_COM_EMPRESA.includes(role as (typeof ROLES_COM_EMPRESA)[number])) {
        if (marcaId) {
          // Acesso à marca inteira: um vínculo só, e os CNPJs saem dele a cada
          // request. CNPJ novo na marca entra sozinho — ver UserMarca no schema.
          await tx.userMarca.create({ data: { userId: user.id, marcaId, role } });
        } else if (empresaId) {
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
      }
      return user;
    });

    await registrarAuditoria({
      acao: "CRIAR",
      entidade: "User",
      entidadeId: result.id,
      resumo: `Criou usuário ${result.username} (${result.role})`,
      detalhes: { nome: result.nome, email: result.email, role: result.role, marcaId, empresaId, setorId, perfis: perfisValidos },
    });

    revalidatePath("/admin/usuarios");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Corrida entre dois cadastros com o mesmo nome: o índice único barra.
    if (msg.includes("Unique constraint") && msg.includes("username")) {
      return { ok: false, error: "Já existe um usuário com esse login." };
    }
    return { ok: false, error: "Erro ao criar usuário." };
  }
}

export async function updateUsuario(
  id: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const esc = await escopoGestao();
  const admin = esc.admin;
  const grupoAlvo = await grupoDoAlvo(esc, id);
  if (grupoAlvo === false) return ERRO_ALVO;

  const parsed = editarSchema.safeParse({
    nome: formData.get("nome"),
    username: formData.get("username"),
    email: formData.get("email") || undefined,
    telefone: formData.get("telefone") || undefined,
    role: formData.get("role"),
    ativo: formData.get("ativo") === "true" || formData.get("ativo") === "on",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  // "Nova senha (opcional)" do formulário de edição. Até a v1.191.0 o campo
  // existia na tela e a action nem o lia: o admin via "Usuário atualizado." e a
  // senha continuava a mesma (achado da revisão da v1.191.0). Em branco, a
  // senha fica como está.
  const novaSenha = String(formData.get("senha") ?? "");
  if (novaSenha && novaSenha.length < 8) {
    return { ok: false, error: "A senha nova deve ter pelo menos 8 caracteres." };
  }

  const antes = await prisma.user.findUnique({
    where: { id },
    select: {
      nome: true,
      username: true,
      email: true,
      telefone: true,
      role: true,
      ativo: true,
      empresas: { select: { ativo: true, setorId: true } },
    },
  });
  if (!antes) return { ok: false, error: "Usuário não encontrado." };

  // O nome de usuário só é cobrado no padrão novo quando MUDA: usuário antigo
  // fora do padrão (com maiúscula, por exemplo) continua como está ao editar
  // o nome ou o e-mail.
  const mudouLogin = parsed.data.username !== antes.username;
  const username = mudouLogin ? normalizarLogin(parsed.data.username) : antes.username;
  if (mudouLogin) {
    const problemaLogin = problemaNoLogin(username);
    if (problemaLogin) return { ok: false, error: problemaLogin };
    const repetido = await loginRepetido(username, grupoAlvo, "renomear", id);
    if (repetido) return { ok: false, error: repetido };
  }

  // Conta presa a algumas marcas pelo admin (lib/grupo.ts) só muda de papel
  // pelas mãos do admin: rebaixar a RH e promover de volta era o atalho para
  // desfazer a restrição sem passar por ele.
  if (!esc.master && antes.role !== parsed.data.role) {
    const restricoes = await prisma.userMarca.count({
      where: { userId: id, ativo: true, role: { in: PAPEIS_DE_RESTRICAO } },
    });
    if (restricoes > 0) {
      return {
        ok: false,
        error: "Esta conta tem marcas definidas pelo admin. Só o admin muda o papel dela.",
      };
    }
  }

  // Promover a gestor de setor por AQUI não conclui o cadastro: esta tela não
  // tem campo de setor, e gestor sem setor entra no sistema sem nada para ver.
  // A mensagem cita o tooltip real do botão ("Vincular empresa", o ícone de
  // corrente na linha do usuário) — e esse formulário aceita empresa já
  // vinculada justamente para este caso (atualiza o vínculo existente).
  if (promoveriaAGestorSemSetor(antes, parsed.data, antes.empresas)) {
    return {
      ok: false,
      error:
        "Gestor de setor precisa de um setor. Abra “Vincular empresa” neste usuário, salve o vínculo como Gestor(a) de Setor com o setor escolhido — e então mude o papel aqui.",
    };
  }

  // A MESMA TRAVA DO `deleteUsuario`, e por um motivo simples: editar leva ao
  // mesmo lugar que excluir. Desmarcar "ativo" ou trocar o papel do único
  // ADMIN tranca o sistema exatamente como apagá-lo — a porta é outra, o
  // resultado é o mesmo. Até 14/08/2026 só a exclusão era protegida.
  if (antes.role === "ADMIN" && antes.ativo) {
    // Cada grupo precisa de um ADMIN próprio — o do outro grupo não o alcança.
    const outrosAdmins = await prisma.user.count({
      where: { role: "ADMIN", ativo: true, grupoId: grupoAlvo, NOT: { id } },
    });
    if (deixariaSistemaSemAdmin(antes, parsed.data, outrosAdmins)) {
      return {
        ok: false,
        error:
          "Não é possível rebaixar ou desativar o único ADMIN ativo do cliente.",
      };
    }
  }

  // Desativar a si mesmo derruba o próprio acesso no próximo login, e quem faz
  // isso quase sempre queria desativar outra pessoa — a lista tem uma linha por
  // usuário e o engano é de um clique.
  if (admin.id === id && !parsed.data.ativo) {
    return { ok: false, error: "Você não pode desativar seu próprio usuário." };
  }

  // Perfis marcados no formulário — o mesmo campo da criação, agora também na
  // edição. Reconcilia: cria os que faltam, remove os que foram desmarcados.
  // Só ids que existem entram. Mostrar o campo e ignorá-lo seria um no-op
  // silencioso, o pior tipo de "salvei e não mudou nada".
  const perfilIds = [...new Set(formData.getAll("perfilId").map(String).filter(Boolean))];
  const perfisValidos = new Set(
    // Só perfis do cliente da conta (v1.199.0).
    (await prisma.perfil.findMany({ where: { id: { in: perfilIds }, grupoId: grupoAlvo }, select: { id: true } })).map(
      (p) => p.id,
    ),
  );

  const passwordHash = novaSenha ? await bcrypt.hash(novaSenha, 10) : null;

  try {
    const depois = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id },
        data: {
          nome: parsed.data.nome,
          username,
          email: parsed.data.email ?? null,
          telefone: parsed.data.telefone ?? null,
          role: parsed.data.role,
          ativo: parsed.data.ativo,
          ...(passwordHash ? { passwordHash } : {}),
        },
      });
      const atuais = new Set(
        (await tx.userPerfil.findMany({ where: { userId: id }, select: { perfilId: true } })).map((r) => r.perfilId),
      );
      const aRemover = [...atuais].filter((pid) => !perfisValidos.has(pid));
      const aAdicionar = [...perfisValidos].filter((pid) => !atuais.has(pid));
      if (aRemover.length > 0) {
        await tx.userPerfil.deleteMany({ where: { userId: id, perfilId: { in: aRemover } } });
      }
      if (aAdicionar.length > 0) {
        await tx.userPerfil.createMany({ data: aAdicionar.map((perfilId) => ({ userId: id, perfilId })) });
      }
      return u;
    });

    if (passwordHash) {
      await registrarAuditoria({
        acao: "RESET_SENHA",
        entidade: "User",
        entidadeId: id,
        resumo: `Redefiniu senha de ${depois.username} (na edição do usuário)`,
      });
    }
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

    revalidatePath("/admin/usuarios");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Corrida entre dois cadastros com o mesmo nome: o índice único barra.
    if (msg.includes("Unique constraint") && msg.includes("username")) {
      return { ok: false, error: "Já existe um usuário com esse login." };
    }
    return { ok: false, error: "Erro ao atualizar usuário." };
  }
}

export async function resetSenhaUsuario(
  id: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const esc = await escopoGestao();
  if ((await grupoDoAlvo(esc, id)) === false) return ERRO_ALVO;

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

  revalidatePath("/admin/usuarios");
  return { ok: true };
}

// Link mandado pelo administrador vale mais que o do "Esqueci minha senha"
// (1 h): a pessoa não está esperando o e-mail na frente do computador.
const LINK_ADMIN_EXPIRA_EM_HORAS = 24;

function escaparHtmlEmail(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * "Enviar nova senha por e-mail" (v1.193.0, pedido do CEO em 06/11/2026): o
 * administrador manda para o e-mail CADASTRADO na conta um link para a pessoa
 * criar a senha nova — o mesmo link de /redefinir-senha do "Esqueci minha
 * senha", só que disparado daqui e válido por 24 h. A senha atual não aparece
 * em lugar nenhum: o banco guarda só o hash dela.
 *
 * Diferente do "Esqueci minha senha", aqui a resposta pode ser honesta (sem
 * e-mail, envio falhou): quem pergunta é o administrador, que já vê a conta.
 */
export async function enviarLinkSenhaPorEmail(id: string): Promise<ActionResult> {
  const esc = await escopoGestao();
  if ((await grupoDoAlvo(esc, id)) === false) return ERRO_ALVO;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      nome: true,
      username: true,
      email: true,
      ativo: true,
      grupoId: true,
      recuperacaoSenhaTokenHash: true,
      recuperacaoSenhaExpiraEm: true,
    },
  });
  if (!user) return ERRO_ALVO;
  if (!user.ativo) return { ok: false, error: "A conta está desativada. Reative antes de mandar a senha." };
  if (!user.email?.trim()) {
    return { ok: false, error: "Este usuário não tem e-mail cadastrado. Clique em Editar e coloque o e-mail." };
  }

  const grupo = user.grupoId
    ? await prisma.grupo.findUnique({ where: { id: user.grupoId }, select: { nome: true } })
    : null;

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiraEm = new Date(Date.now() + LINK_ADMIN_EXPIRA_EM_HORAS * 60 * 60 * 1000);

  await prisma.user.update({
    where: { id },
    data: { recuperacaoSenhaTokenHash: tokenHash, recuperacaoSenhaExpiraEm: expiraEm },
  });

  // O link volta pelo endereço próprio do cliente, se ele tiver (v1.198.0).
  const baseUrl = await urlBaseDoCliente(user.grupoId);
  const link = `${baseUrl}/redefinir-senha/${token}`;
  const nome = escaparHtmlEmail(user.nome);
  const usuario = escaparHtmlEmail(user.username);
  const deQualConta = grupo ? ` (${escaparHtmlEmail(grupo.nome)})` : "";

  const html = `
      <p>Olá, ${nome},</p>
      <p>O administrador do sistema de RH pediu para você criar uma senha nova.</p>
      <p>Seu usuário de login é <b>${usuario}</b>${deQualConta} — no login, digite o usuário, não o e-mail.</p>
      <p>Para criar a senha, clique abaixo. O link vale por ${LINK_ADMIN_EXPIRA_EM_HORAS} horas.</p>
      <p style="margin:24px 0">
        <a href="${link}" style="background:#0f172a;color:white;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">Criar nova senha</a>
      </p>
      <p>Ou cole este link no navegador:</p>
      <p style="word-break:break-all;color:#475569">${link}</p>
    `.trim();

  const envio = await sendEmail({
    to: user.email,
    subject: `Crie sua nova senha — usuário ${user.username} — Sistema de RH`,
    html,
    text: `O administrador do sistema de RH pediu para você criar uma senha nova. Seu usuário de login é ${user.username}${
      grupo ? ` (${grupo.nome})` : ""
    }. Acesse ${link} para criar a senha. O link vale por ${LINK_ADMIN_EXPIRA_EM_HORAS} horas.`,
    chave: `senha-admin:${tokenHash}`,
  });

  if (!envio.ok) {
    // Não deixa a pessoa sem o link que talvez já tivesse.
    await prisma.user.update({
      where: { id },
      data: {
        recuperacaoSenhaTokenHash: user.recuperacaoSenhaTokenHash,
        recuperacaoSenhaExpiraEm: user.recuperacaoSenhaExpiraEm,
      },
    });
    return { ok: false, error: `Não foi possível enviar o e-mail: ${envio.error}` };
  }

  await registrarAuditoria({
    acao: "RESET_SENHA",
    entidade: "User",
    entidadeId: id,
    resumo: `Enviou link de nova senha para ${user.username} (${user.email})`,
  });

  return { ok: true };
}

export async function deleteUsuario(id: string): Promise<ActionResult> {
  const esc = await escopoGestao();
  const admin = esc.admin;
  const grupoAlvo = await grupoDoAlvo(esc, id);
  if (grupoAlvo === false) return ERRO_ALVO;
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
      where: { role: "ADMIN", ativo: true, grupoId: grupoAlvo, NOT: { id } },
    });
    if (outrosAdmins === 0) {
      return {
        ok: false,
        error: "Não é possível excluir/desativar o único ADMIN ativo do cliente.",
      };
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

  revalidatePath("/admin/usuarios");
  return { ok: true };
}

export async function toggleStatusUsuario(id: string): Promise<ActionResult> {
  const esc = await escopoGestao();
  const admin = esc.admin;
  const grupoAlvo = await grupoDoAlvo(esc, id);
  if (grupoAlvo === false) return ERRO_ALVO;
  if (admin.id === id) {
    return { ok: false, error: "Você não pode desativar seu próprio usuário." };
  }

  const usuario = await prisma.user.findUnique({
    where: { id },
    select: { role: true, ativo: true, username: true },
  });
  if (!usuario) return { ok: false, error: "Usuário não encontrado." };

  // Bloqueia desativação do último ADMIN ativo
  if (usuario.role === "ADMIN" && usuario.ativo) {
    const outrosAdmins = await prisma.user.count({
      where: { role: "ADMIN", ativo: true, grupoId: grupoAlvo, NOT: { id } },
    });
    if (outrosAdmins === 0) {
      return {
        ok: false,
        error: "Não é possível desativar o único ADMIN ativo do cliente.",
      };
    }
  }

  try {
    const novoStatus = !usuario.ativo;
    await prisma.user.update({
      where: { id },
      data: { ativo: novoStatus },
    });

    await registrarAuditoria({
      acao: novoStatus ? "REATIVAR" : "DESATIVAR",
      entidade: "User",
      entidadeId: id,
      resumo: `${novoStatus ? "Ativou" : "Desativou"} usuário ${usuario.username}`,
    });

    revalidatePath("/admin/usuarios");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "Erro ao atualizar status do usuário." };
  }
}

export async function vincularEmpresaUsuario(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const esc = await escopoGestao();

  const parsed = vincularSchema.safeParse({
    userId: formData.get("userId"),
    empresaId: formData.get("empresaId"),
    role: formData.get("role"),
    setorId: formData.get("setorId") || undefined,
    papelPrincipal: formData.get("papelPrincipal") === "on" || formData.get("papelPrincipal") === "true",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const { userId, empresaId, role, setorId, papelPrincipal } = parsed.data;
  const grupoAlvo = await grupoDoAlvo(esc, userId);
  if (grupoAlvo === false) return ERRO_ALVO;
  if (!(await empresaNoGrupo(empresaId, grupoAlvo))) {
    return { ok: false, error: "Este CNPJ não é do cliente do usuário." };
  }

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

    revalidatePath("/admin/usuarios");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao vincular." };
  }
}

export async function desativarVinculoUsuario(
  userId: string,
  empresaId: string,
): Promise<ActionResult> {
  const esc = await escopoGestao();
  if ((await grupoDoAlvo(esc, userId)) === false) return ERRO_ALVO;

  const vinculo = await prisma.userEmpresa.findUnique({
    where: { userId_empresaId: { userId, empresaId } },
  });
  if (!vinculo) return { ok: false, error: "Vínculo não encontrado." };

  // Bloqueia desativar a única empresa ativa do user — equivaleria a "tirar
  // o login" sem passar pela tela de exclusão do User. Vínculo por marca conta
  // como acesso: quem tem a marca não fica sem nada ao perder um CNPJ solto.
  const [empresasRestantes, marcasRestantes] = await Promise.all([
    prisma.userEmpresa.count({ where: { userId, ativo: true, NOT: { id: vinculo.id } } }),
    prisma.userMarca.count({ where: { userId, ativo: true } }),
  ]);
  if (empresasRestantes + marcasRestantes === 0) {
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

  revalidatePath("/admin/usuarios");
  return { ok: true };
}

export async function reativarVinculoUsuario(
  userId: string,
  empresaId: string,
): Promise<ActionResult> {
  const esc = await escopoGestao();
  const grupoAlvo = await grupoDoAlvo(esc, userId);
  if (grupoAlvo === false) return ERRO_ALVO;
  if (!(await empresaNoGrupo(empresaId, grupoAlvo))) {
    return { ok: false, error: "Este CNPJ não é do cliente do usuário." };
  }

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

  revalidatePath("/admin/usuarios");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Vínculo por MARCA — dá acesso a todos os CNPJs dela, inclusive os que vierem
// depois. Só RH_MANAGER: GESTOR_SETOR precisa de um CNPJ, porque setor pertence
// a um CNPJ e não à marca.
// ---------------------------------------------------------------------------

const vincularMarcaSchema = z.object({
  userId: z.string().trim().min(1),
  marcaId: z.string().trim().min(1, "Selecione a marca"),
  role: z.literal("RH_MANAGER"),
});

export async function vincularMarcaUsuario(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const esc = await escopoGestao();

  const parsed = vincularMarcaSchema.safeParse({
    userId: formData.get("userId"),
    marcaId: formData.get("marcaId"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const { userId, marcaId, role } = parsed.data;
  const grupoAlvo = await grupoDoAlvo(esc, userId);
  if (grupoAlvo === false) return ERRO_ALVO;
  const soMaster = await marcasDaDirecaoSoComMaster(esc, userId, marcaId);
  if (soMaster) return soMaster;
  if (!(await marcaNoGrupo(marcaId, grupoAlvo)))
    return { ok: false, error: "Esta marca não é do cliente do usuário." };

  try {
    // upsert e não create: revincular uma marca que já foi desativada deve
    // reativar a linha, não estourar na unicidade (userId, marcaId).
    const vinculo = await prisma.userMarca.upsert({
      where: { userId_marcaId: { userId, marcaId } },
      create: { userId, marcaId, role },
      update: { ativo: true, role },
    });

    const marca = await prisma.marca.findUnique({ where: { id: marcaId }, select: { nome: true } });

    await registrarAuditoria({
      acao: "VINCULAR",
      entidade: "UserMarca",
      entidadeId: vinculo.id,
      resumo: `Vinculou usuário ${userId} à marca ${marca?.nome ?? marcaId} (todos os CNPJs)`,
    });

    revalidatePath("/admin/usuarios");
    return { ok: true };
  } catch {
    return { ok: false, error: "Erro ao vincular a marca." };
  }
}

export async function desativarVinculoMarca(
  userId: string,
  marcaId: string,
): Promise<ActionResult> {
  const esc = await escopoGestao();
  if ((await grupoDoAlvo(esc, userId)) === false) return ERRO_ALVO;
  const soMaster = await marcasDaDirecaoSoComMaster(esc, userId, marcaId);
  if (soMaster) return soMaster;

  const vinculo = await prisma.userMarca.findUnique({
    where: { userId_marcaId: { userId, marcaId } },
    include: { user: { select: { role: true } } },
  });
  if (!vinculo) return { ok: false, error: "Vínculo não encontrado." };

  // Mesma trava do vínculo por empresa: ninguém fica sem acesso nenhum por aqui.
  // Não vale para ADMIN/DIRETORIA: para eles a marca é restrição, e tirar a
  // última devolve o grupo inteiro (lib/grupo.ts, `direcaoRestrita`).
  const ehDirecao = vinculo.user.role === "ADMIN" || vinculo.user.role === "DIRETORIA";
  const [empresasAtivas, marcasRestantes] = await Promise.all([
    prisma.userEmpresa.count({ where: { userId, ativo: true } }),
    prisma.userMarca.count({ where: { userId, ativo: true, NOT: { id: vinculo.id } } }),
  ]);
  if (!ehDirecao && empresasAtivas + marcasRestantes === 0) {
    return { ok: false, error: "Não é possível remover o único acesso ativo do usuário." };
  }

  await prisma.userMarca.update({ where: { id: vinculo.id }, data: { ativo: false } });

  await registrarAuditoria({
    acao: "DESVINCULAR",
    entidade: "UserMarca",
    entidadeId: vinculo.id,
    resumo: `Desvinculou usuário ${userId} da marca ${marcaId}`,
  });

  revalidatePath("/admin/usuarios");
  return { ok: true };
}

export async function reativarVinculoMarca(
  userId: string,
  marcaId: string,
): Promise<ActionResult> {
  const esc = await escopoGestao();
  const grupoAlvo = await grupoDoAlvo(esc, userId);
  if (grupoAlvo === false) return ERRO_ALVO;
  const soMaster = await marcasDaDirecaoSoComMaster(esc, userId, marcaId);
  if (soMaster) return soMaster;
  if (!(await marcaNoGrupo(marcaId, grupoAlvo)))
    return { ok: false, error: "Esta marca não é do cliente do usuário." };

  const vinculo = await prisma.userMarca.findUnique({
    where: { userId_marcaId: { userId, marcaId } },
  });
  if (!vinculo) return { ok: false, error: "Vínculo não encontrado." };

  await prisma.userMarca.update({ where: { id: vinculo.id }, data: { ativo: true } });

  await registrarAuditoria({
    acao: "VINCULAR",
    entidade: "UserMarca",
    entidadeId: vinculo.id,
    resumo: `Reativou vínculo do usuário ${userId} na marca ${marcaId}`,
  });

  revalidatePath("/admin/usuarios");
  return { ok: true };
}

/** Quantas fichas a busca do diálogo devolve. Lista longa não se lê. */
const LIMITE_BUSCA_FICHAS = 20;

// Fichas que PODEM virar o login deste usuário: ativas, dentro do alcance de
// empresas dele e ainda sem login próprio. A busca é por nome ou CPF porque é
// o que o RH tem em mãos — matrícula nem sempre está preenchida.
export async function buscarColaboradoresParaVincular(
  userId: string,
  termo: string,
): Promise<
  { id: string; nome: string; empresaNome: string; setorNome: string }[]
> {
  const esc = await escopoGestao();
  if ((await grupoDoAlvo(esc, userId)) === false) return [];

  const busca = termo.trim();
  if (busca.length < 2) return [];

  const alvo = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, empresas: { select: { empresaId: true, ativo: true } } },
  });
  if (!alvo) return [];

  const alcance = await empresasVisiveis(alvo);
  if (alcance.length === 0) return [];

  // Só entra a cláusula de CPF se o termo tiver dígito: `contains: ""` casa com
  // qualquer CPF preenchido e devolveria a base inteira para quem digitou letra.
  const digitos = busca.replace(/\D/g, "");
  const porNomeOuCpf = [
    { nome: { contains: busca, mode: "insensitive" as const } },
    ...(digitos.length >= 2 ? [{ cpf: { contains: digitos } }] : []),
  ];

  const achados = await prisma.colaborador.findMany({
    where: {
      empresaId: { in: alcance },
      ativo: true,
      // `usuario: null` some com quem já tem login — vincular por cima daria
      // erro de unique só depois do clique, sem explicar o motivo.
      usuario: { is: null },
      OR: porNomeOuCpf,
    },
    select: {
      id: true,
      nome: true,
      empresa: { select: { nome: true } },
      setor: { select: { nome: true } },
    },
    orderBy: { nome: "asc" },
    take: LIMITE_BUSCA_FICHAS,
  });

  return achados.map((c) => ({
    id: c.id,
    nome: c.nome,
    empresaNome: c.empresa.nome,
    setorNome: c.setor.nome,
  }));
}

// Aponta qual ficha de colaborador é este login.
//
// POR QUE ISTO EXISTE. `User` e `Colaborador` nasceram como dois cadastros sem
// ponte. Consequência prática: um gestor logado no sistema não tinha como o
// servidor descobrir quem ele é, e por isso nenhuma tela com login conseguia
// mostrar "meu time" — que sai de `Colaborador.supervisorId`. O time só
// aparecia no portal, que entra por Telegram e não usa `User`.
//
// O vínculo é apontado à mão, um a um, e não adivinhado: `username` não tem
// relação nenhuma com o nome da ficha, e errar aqui mostra o time errado para
// a pessoa errada.
export async function vincularColaboradorAoUsuario(
  userId: string,
  colaboradorId: string,
): Promise<ActionResult> {
  const esc = await escopoGestao();
  if ((await grupoDoAlvo(esc, userId)) === false) return ERRO_ALVO;

  const [alvo, colaborador] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        nome: true,
        colaboradorId: true,
        empresas: { select: { empresaId: true, ativo: true } },
      },
    }),
    prisma.colaborador.findUnique({
      where: { id: colaboradorId },
      select: { id: true, nome: true, empresaId: true, ativo: true },
    }),
  ]);
  if (!alvo) return { ok: false, error: "Usuário não encontrado." };
  if (!colaborador) return { ok: false, error: "Colaborador não encontrado." };

  // A checagem que sustenta o resto: a ficha precisa estar numa empresa que o
  // PRÓPRIO usuário alcança. Sem isto, vincular um gestor da empresa A a uma
  // ficha da empresa B faria "meu time" mostrar gente de outro CNPJ — um
  // vazamento entre empresas aberto pela tela de cadastro, não por invasão.
  const alcance = await empresasVisiveis(alvo);
  if (!alcance.includes(colaborador.empresaId)) {
    return {
      ok: false,
      error: "Este colaborador está numa empresa que o usuário não acessa.",
    };
  }

  // O @unique do banco já barraria, mas o erro que ele devolve é ilegível para
  // quem está na tela. Aqui dá para dizer de quem é a ficha.
  const jaUsada = await prisma.user.findUnique({
    where: { colaboradorId },
    select: { id: true, nome: true },
  });
  if (jaUsada && jaUsada.id !== userId) {
    return { ok: false, error: `Esta ficha já é o login de ${jaUsada.nome}.` };
  }

  await prisma.user.update({ where: { id: userId }, data: { colaboradorId } });

  await registrarAuditoria({
    acao: "VINCULAR",
    entidade: "User",
    entidadeId: userId,
    empresaId: colaborador.empresaId,
    resumo: `Vinculou o login ${alvo.nome} à ficha de ${colaborador.nome}`,
  });

  revalidatePath("/admin/usuarios");
  revalidatePath("/rh/meu-setor");
  return { ok: true };
}

export async function desvincularColaboradorDoUsuario(
  userId: string,
): Promise<ActionResult> {
  const esc = await escopoGestao();
  if ((await grupoDoAlvo(esc, userId)) === false) return ERRO_ALVO;

  const alvo = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, nome: true, colaborador: { select: { nome: true, empresaId: true } } },
  });
  if (!alvo) return { ok: false, error: "Usuário não encontrado." };
  if (!alvo.colaborador) return { ok: false, error: "Este usuário não tem ficha vinculada." };

  await prisma.user.update({ where: { id: userId }, data: { colaboradorId: null } });

  await registrarAuditoria({
    acao: "DESVINCULAR",
    entidade: "User",
    entidadeId: userId,
    empresaId: alvo.colaborador.empresaId,
    resumo: `Desvinculou o login ${alvo.nome} da ficha de ${alvo.colaborador.nome}`,
  });

  revalidatePath("/admin/usuarios");
  revalidatePath("/rh/meu-setor");
  return { ok: true };
}

export async function trocarEmpresaAtiva(empresaId: string, setorId?: string | null): Promise<ActionResult> {
  const session = await auth();
  const user = session?.user;
  if (!user) return { ok: false, error: "Não autenticado." };

  // A mesma pergunta de toda tela: alcança este CNPJ? (papel, vínculo, marca
  // e — antes de tudo — o GRUPO; ver lib/grupo.ts). O GESTOR_SETOR continua
  // exigindo o vínculo direto com o CNPJ, como antes.
  const temAcesso =
    (user.role === "ADMIN" ||
      user.role === "DIRETORIA" ||
      user.empresas.some((e) => e.empresaId === empresaId && e.ativo)) &&
    (await usuarioAlcancaEmpresa(user, empresaId));
  if (!temAcesso) return { ok: false, error: "Sem acesso a esta empresa." };

  await escreverCookieEmpresaAtiva(empresaId);
  revalidatePath("/", "layout");
  return { ok: true };
}

const marcasQueVeSchema = z.object({
  userId: z.string().min(1),
  grupoId: z.string().min(1),
  marcaIds: z.array(z.string().min(1)).max(200),
});

/**
 * TELA DE ADMIN — "quais marcas esta conta vê" (só o MASTER). A regra mora em
 * lib/marcas-que-ve.ts (`aplicarMarcasQueVe`), fora deste arquivo de actions
 * para poder ser testada direto no banco (scripts/smoke-marcas-direcao.ts).
 */
export async function definirMarcasQueVe(
  userId: string,
  grupoId: string,
  marcaIds: string[],
): Promise<ActionResult> {
  const esc = await escopoGestao();
  if (!esc.master) {
    return { ok: false, error: "Só o admin define as marcas que cada conta vê." };
  }
  const parsed = marcasQueVeSchema.safeParse({ userId, grupoId, marcaIds });
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };

  const r = await aplicarMarcasQueVe(parsed.data);
  if (!r.ok) return r;

  await registrarAuditoria({
    acao: "ATUALIZAR",
    entidade: "User",
    entidadeId: parsed.data.userId,
    resumo: r.resumo,
  });

  revalidatePath("/admin/usuarios");
  revalidatePath("/admin/clientes");
  return { ok: true };
}
