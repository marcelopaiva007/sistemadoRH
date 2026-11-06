"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMaster } from "@/lib/grupo-guard";
import { registrarAuditoria } from "@/lib/audit";
import { violouUnique } from "@/lib/prisma-erros";
import type { ActionResult } from "@/lib/constants";
import { apenasDigitosCnpj, cnpjValido } from "@/lib/cnpj";

// Ações do MASTER sobre os GRUPOS de sociedade (lib/grupo.ts) — os CLIENTES
// da FASTMAI na Gestão (v1.192.0): cada grupo é um cliente, com as suas marcas
// e os seus usuários. As mensagens falam "cliente"; o banco segue "Grupo".
//
// Só o MASTER chega aqui (`requireMaster`). Ele cria e renomeia grupos, decide
// em que grupo cada marca mora e em que grupo cada conta trabalha — e é só
// isso: nenhuma destas ações lê dado de RH, folha ou processo.

const CAMINHO = "/admin/clientes";

function texto(fd: FormData, campo: string): string {
  const v = fd.get(campo);
  return typeof v === "string" ? v.trim() : "";
}

export async function criarGrupo(
  _prev: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  await requireMaster();
  const nome = texto(fd, "nome");
  if (nome.length < 2) return { ok: false, error: "Informe o nome do cliente." };
  try {
    const grupo = await prisma.grupo.create({ data: { nome } });
    await registrarAuditoria({
      acao: "CRIAR",
      entidade: "Grupo",
      entidadeId: grupo.id,
      resumo: `Criou o cliente "${nome}"`,
    });
  } catch (e) {
    if (violouUnique(e, "Grupo_nome_key"))
      return { ok: false, error: `Já existe um cliente chamado "${nome}".` };
    throw e;
  }
  revalidatePath(CAMINHO);
  return { ok: true };
}

export async function renomearGrupo(
  grupoId: string,
  _prev: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  await requireMaster();
  const nome = texto(fd, "nome");
  if (nome.length < 2) return { ok: false, error: "Informe o nome do cliente." };
  try {
    const antes = await prisma.grupo.findUnique({
      where: { id: grupoId },
      select: { nome: true },
    });
    if (!antes) return { ok: false, error: "Cliente não encontrado." };
    await prisma.grupo.update({ where: { id: grupoId }, data: { nome } });
    await registrarAuditoria({
      acao: "ATUALIZAR",
      entidade: "Grupo",
      entidadeId: grupoId,
      resumo: `Renomeou o cliente "${antes.nome}" para "${nome}"`,
    });
  } catch (e) {
    if (violouUnique(e, "Grupo_nome_key"))
      return { ok: false, error: `Já existe um cliente chamado "${nome}".` };
    throw e;
  }
  revalidatePath(CAMINHO);
  revalidatePath("/admin/usuarios");
  return { ok: true };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Dados cadastrais do cliente (v1.197.0, Fase 1): documento, responsável e
 * contrato. Grava só o que veio no formulário; campo vazio vira null — o
 * cliente pode ficar sem um dado, e a tela marca o que falta.
 */
export async function salvarDadosCliente(
  grupoId: string,
  _prev: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  await requireMaster();
  const antes = await prisma.grupo.findUnique({ where: { id: grupoId }, select: { nome: true } });
  if (!antes) return { ok: false, error: "Cliente não encontrado." };

  const ouNulo = (campo: string) => texto(fd, campo) || null;

  const cnpjBruto = texto(fd, "cnpj");
  const cnpj = cnpjBruto ? apenasDigitosCnpj(cnpjBruto) : null;
  if (cnpj && !cnpjValido(cnpj)) return { ok: false, error: "CNPJ inválido. Confira os números." };

  const contatoEmail = ouNulo("contatoEmail")?.toLowerCase() ?? null;
  if (contatoEmail && !EMAIL_RE.test(contatoEmail)) return { ok: false, error: "E-mail de contato inválido." };

  const limiteBruto = texto(fd, "limiteUsuarios");
  let limiteUsuarios: number | null = null;
  if (limiteBruto) {
    const n = Number(limiteBruto);
    if (!Number.isInteger(n) || n < 1 || n > 100000)
      return { ok: false, error: "Limite de usuários precisa ser um número inteiro a partir de 1 (ou vazio para sem limite)." };
    limiteUsuarios = n;
  }

  const dataBruta = texto(fd, "inicioContrato");
  let inicioContrato: Date | null = null;
  if (dataBruta) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataBruta)) return { ok: false, error: "Data de início do contrato inválida." };
    inicioContrato = new Date(`${dataBruta}T00:00:00.000Z`);
    if (Number.isNaN(inicioContrato.getTime())) return { ok: false, error: "Data de início do contrato inválida." };
  }

  await prisma.grupo.update({
    where: { id: grupoId },
    data: {
      razaoSocial: ouNulo("razaoSocial"),
      cnpj,
      responsavelNome: ouNulo("responsavelNome"),
      contatoEmail,
      contatoTelefone: ouNulo("contatoTelefone"),
      plano: ouNulo("plano"),
      limiteUsuarios,
      inicioContrato,
      observacoes: ouNulo("observacoes"),
    },
  });
  await registrarAuditoria({
    acao: "ATUALIZAR",
    entidade: "Grupo",
    entidadeId: grupoId,
    resumo: `Atualizou os dados cadastrais do cliente "${antes.nome}"`,
  });
  revalidatePath(CAMINHO);
  return { ok: true };
}

/**
 * Muda a marca (com TODOS os CNPJs dela) de grupo. É mudar a empresa de
 * sociedade: a partir do próximo clique, quem é do grupo antigo deixa de
 * enxergá-la — inclusive quem tinha vínculo direto com os CNPJs dela, porque
 * a parede de grupo vem antes do vínculo (lib/rh-auth-guard.ts). Os vínculos
 * antigos são DESATIVADOS aqui, para a tela de Usuários não mostrar acesso que
 * não vale mais.
 */
export async function moverMarcaDeGrupo(
  _prev: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  await requireMaster();
  const marcaId = texto(fd, "marcaId");
  const grupoId = texto(fd, "grupoId");
  const [marca, grupo] = await Promise.all([
    prisma.marca.findUnique({
      where: { id: marcaId },
      select: {
        id: true,
        nome: true,
        grupoId: true,
        grupo: { select: { nome: true } },
      },
    }),
    prisma.grupo.findUnique({
      where: { id: grupoId },
      select: { id: true, nome: true, ativo: true },
    }),
  ]);
  if (!marca) return { ok: false, error: "Marca não encontrada." };
  if (!grupo || !grupo.ativo)
    return { ok: false, error: "Cliente não encontrado." };
  if (marca.grupoId === grupo.id) return { ok: true };

  await prisma.$transaction([
    prisma.marca.update({
      where: { id: marca.id },
      data: { grupoId: grupo.id },
    }),
    prisma.userMarca.updateMany({
      where: { marcaId: marca.id, ativo: true },
      data: { ativo: false },
    }),
    prisma.userEmpresa.updateMany({
      where: { empresa: { marcaId: marca.id }, ativo: true },
      data: { ativo: false },
    }),
  ]);
  await registrarAuditoria({
    acao: "ATUALIZAR",
    entidade: "Marca",
    entidadeId: marca.id,
    resumo: `Moveu a marca "${marca.nome}" do cliente "${marca.grupo.nome}" para "${grupo.nome}" (vínculos de acesso antigos desativados)`,
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Muda uma CONTA de grupo. Os vínculos de acesso que ela tinha (CNPJ e marca)
 * ficam todos do grupo antigo, então são desativados: a conta chega ao grupo
 * novo sem acesso a CNPJ nenhum, e o MASTER concede o que for preciso (desde
 * a v1.188.0 só ele gere contas). Conta de portal não aparece aqui — ela segue
 * a ficha.
 */
export async function moverUsuarioDeGrupo(
  _prev: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  await requireMaster();
  const userId = texto(fd, "userId");
  const grupoId = texto(fd, "grupoId");
  const [user, grupo] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nome: true,
        role: true,
        grupoId: true,
        grupo: { select: { nome: true } },
      },
    }),
    prisma.grupo.findUnique({
      where: { id: grupoId },
      select: { id: true, nome: true, ativo: true },
    }),
  ]);
  if (!user || user.role === "MASTER")
    return { ok: false, error: "Usuário não encontrado." };
  if (!grupo || !grupo.ativo)
    return { ok: false, error: "Cliente não encontrado." };
  if (user.grupoId === grupo.id) return { ok: true };

  // Não deixa o grupo de origem sem ADMIN ativo — ninguém lá conseguiria mais
  // administrar contas nem CNPJs (o MASTER ainda conseguiria, mas a trava é a
  // mesma das telas de usuário).
  if (user.role === "ADMIN" && user.grupoId) {
    const outros = await prisma.user.count({
      where: {
        role: "ADMIN",
        ativo: true,
        grupoId: user.grupoId,
        NOT: { id: user.id },
      },
    });
    if (outros === 0)
      return {
        ok: false,
        error: `${user.nome} é o único ADMIN ativo de "${user.grupo?.nome}".`,
      };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { grupoId: grupo.id, empresaId: null, setorId: null },
    }),
    prisma.userEmpresa.updateMany({
      where: { userId: user.id, ativo: true },
      data: { ativo: false, papelPrincipal: false },
    }),
    prisma.userMarca.updateMany({
      where: { userId: user.id, ativo: true },
      data: { ativo: false },
    }),
  ]);
  await registrarAuditoria({
    acao: "ATUALIZAR",
    entidade: "User",
    entidadeId: user.id,
    resumo: `Moveu ${user.nome} do cliente "${user.grupo?.nome ?? "—"}" para "${grupo.nome}" (vínculos de acesso antigos desativados)`,
  });
  revalidatePath(CAMINHO);
  revalidatePath("/admin/usuarios");
  return { ok: true };
}
