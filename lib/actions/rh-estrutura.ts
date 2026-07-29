"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRHAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { violouUnique } from "@/lib/prisma-erros";
import { apenasDigitosCnpj, cnpjValido, ufValida } from "@/lib/cnpj";
import type { ActionResult } from "@/lib/constants";

// Estrutura do grupo: marcas e as pessoas jurídicas (CNPJs) de cada uma.
//
// É configuração de grupo, não de empresa — por isso o guard é o de RH, e não
// o requireEmpresaAccess. Quem administra a estrutura administra todas as
// marcas; não faria sentido o gestor de uma empresa criar CNPJ em outra.

function texto(fd: FormData, campo: string): string | null {
  const v = fd.get(campo);
  if (typeof v !== "string") return null;
  const limpo = v.trim();
  return limpo === "" ? null : limpo;
}

// ---------------------------------------------------------------- MARCAS

export async function criarMarca(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireRHAccess();

  const nome = texto(fd, "nome");
  if (!nome) return { ok: false, error: "Informe o nome da marca." };

  try {
    const marca = await prisma.marca.create({
      data: { nome, logoUrl: texto(fd, "logoUrl") },
    });
    await registrarAuditoria({
      acao: "CRIAR",
      entidade: "Marca",
      entidadeId: marca.id,
      resumo: `Marca "${nome}" criada`,
    });
  } catch (e) {
    if (violouUnique(e, "Marca_nome_key")) {
      return { ok: false, error: `Já existe uma marca chamada "${nome}".` };
    }
    throw e;
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function editarMarca(
  marcaId: string,
  _prev: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  await requireRHAccess();

  const nome = texto(fd, "nome");
  if (!nome) return { ok: false, error: "Informe o nome da marca." };

  try {
    await prisma.marca.update({
      where: { id: marcaId },
      data: {
        nome,
        logoUrl: texto(fd, "logoUrl"),
        ativo: fd.get("ativo") === "true",
      },
    });
    await registrarAuditoria({
      acao: "ATUALIZAR",
      entidade: "Marca",
      entidadeId: marcaId,
      resumo: `Marca "${nome}" alterada`,
    });
  } catch (e) {
    if (violouUnique(e, "Marca_nome_key")) {
      return { ok: false, error: `Já existe uma marca chamada "${nome}".` };
    }
    throw e;
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------- CNPJs

/**
 * Confere e normaliza os campos da pessoa jurídica.
 *
 * O CNPJ é opcional aqui porque as empresas que já existiam foram criadas
 * antes desta fase — mas se vier preenchido, tem de ser um número real. Metade
 * de um CNPJ é pior que nenhum: passa a impressão de que o cadastro está
 * completo quando não está.
 */
function lerDadosDaEmpresa(fd: FormData):
  | { ok: false; erro: string }
  | { ok: true; dados: {
      nome: string; razaoSocial: string | null; nomeFantasia: string | null;
      cnpj: string | null; inscricaoEstadual: string | null;
      cidade: string | null; uf: string | null;
    } } {
  const nome = texto(fd, "nome");
  if (!nome) return { ok: false, erro: "Informe o nome de exibição da empresa." };

  const cnpjBruto = texto(fd, "cnpj");
  let cnpj: string | null = null;
  if (cnpjBruto) {
    if (!cnpjValido(cnpjBruto)) {
      return { ok: false, erro: "CNPJ inválido — confira os dígitos." };
    }
    cnpj = apenasDigitosCnpj(cnpjBruto);
  }

  const ufBruta = texto(fd, "uf");
  if (ufBruta && !ufValida(ufBruta)) {
    return { ok: false, erro: `UF "${ufBruta}" não existe.` };
  }

  return {
    ok: true,
    dados: {
      nome,
      razaoSocial: texto(fd, "razaoSocial"),
      nomeFantasia: texto(fd, "nomeFantasia"),
      cnpj,
      inscricaoEstadual: texto(fd, "inscricaoEstadual"),
      cidade: texto(fd, "cidade"),
      uf: ufBruta ? ufBruta.toUpperCase() : null,
    },
  };
}

function erroDeUnicidade(e: unknown, cnpj: string | null, nome: string): string | null {
  if (violouUnique(e, "Empresa_cnpj_key")) {
    return `O CNPJ ${cnpj} já está cadastrado em outra empresa.`;
  }
  if (violouUnique(e, "Empresa_nome_key")) {
    return `Já existe uma empresa chamada "${nome}".`;
  }
  return null;
}

export async function criarEmpresa(
  marcaId: string,
  _prev: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  await requireRHAccess();

  const lido = lerDadosDaEmpresa(fd);
  if (!lido.ok) return { ok: false, error: lido.erro };

  try {
    const empresa = await prisma.empresa.create({
      data: { ...lido.dados, marcaId },
    });
    await registrarAuditoria({
      acao: "CRIAR",
      entidade: "Empresa",
      entidadeId: empresa.id,
      resumo: `Empresa "${lido.dados.nome}" criada`,
    });
  } catch (e) {
    const msg = erroDeUnicidade(e, lido.dados.cnpj, lido.dados.nome);
    if (msg) return { ok: false, error: msg };
    throw e;
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function excluirEmpresa(empresaId: string): Promise<ActionResult> {
  await requireRHAccess();

  const count = await prisma.colaborador.count({ where: { empresaId } });
  if (count > 0) {
    return {
      ok: false,
      error: `Não é possível excluir: há ${count} colaborador${count === 1 ? "" : "es"} vinculado${count === 1 ? "" : "s"} a esse CNPJ.`,
    };
  }

  const empresa = await prisma.empresa.delete({ where: { id: empresaId } });
  await registrarAuditoria({
    acao: "EXCLUIR",
    entidade: "Empresa",
    entidadeId: empresaId,
    resumo: `CNPJ "${empresa.nome}" excluído`,
  });

  revalidatePath("/", "layout");
  return { ok: true };
}
  empresaId: string,
  _prev: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  await requireRHAccess();

  const lido = lerDadosDaEmpresa(fd);
  if (!lido.ok) return { ok: false, error: lido.erro };

  const marcaId = texto(fd, "marcaId");
  if (!marcaId) return { ok: false, error: "Informe a marca." };

  try {
    await prisma.empresa.update({
      where: { id: empresaId },
      data: { ...lido.dados, marcaId, ativo: fd.get("ativo") === "true" },
    });
    await registrarAuditoria({
      acao: "ATUALIZAR",
      entidade: "Empresa",
      entidadeId: empresaId,
      resumo: `Empresa "${lido.dados.nome}" alterada`,
    });
  } catch (e) {
    const msg = erroDeUnicidade(e, lido.dados.cnpj, lido.dados.nome);
    if (msg) return { ok: false, error: msg };
    throw e;
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
