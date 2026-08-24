"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRHAccess } from "@/lib/rh-auth-guard";
import { requireAdmin } from "@/lib/auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { violouUnique } from "@/lib/prisma-erros";
import { apenasDigitosCnpj, cnpjValido, ufValida } from "@/lib/cnpj";
import { enviarLogoMarca } from "@/lib/blob";
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

// Teto generoso pra logo (a tela sugere PNG/SVG pequenos), mas abaixo do
// limite de 5 MB do corpo de server action (next.config.ts) — estourar lá
// vira erro genérico de rede; aqui vira mensagem que explica.
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_TIPOS = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];

/**
 * Logo da marca: arquivo enviado tem prioridade sobre a URL colada. Sem
 * arquivo, vale a URL (o caminho antigo continua funcionando — inclusive se o
 * Blob não estiver configurado, o erro sai daqui com explicação, e nada mais
 * do formulário é afetado).
 */
async function resolverLogo(
  fd: FormData,
  marcaId: string,
): Promise<{ ok: true; logoUrl: string | null } | { ok: false; error: string }> {
  const arquivo = fd.get("logoArquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: true, logoUrl: texto(fd, "logoUrl") };
  }

  if (!LOGO_TIPOS.includes(arquivo.type)) {
    return { ok: false, error: "O logo precisa ser uma imagem PNG, JPG, SVG ou WebP." };
  }
  if (arquivo.size > LOGO_MAX_BYTES) {
    return { ok: false, error: "O logo pode ter no máximo 2 MB." };
  }

  const envio = await enviarLogoMarca({
    marcaId,
    nome: arquivo.name || "logo",
    mimeType: arquivo.type,
    bytes: new Uint8Array(await arquivo.arrayBuffer()),
  });
  if (!envio.ok) return envio;
  return { ok: true, logoUrl: envio.url };
}

const HEX_COR = /^#[0-9a-fA-F]{6}$/;

/** null = campo vazio (usa o azul padrão do tema); string validada; erro se preenchido e inválido. */
function lerCorPrimaria(fd: FormData): { ok: true; cor: string | null } | { ok: false; error: string } {
  const bruto = texto(fd, "corPrimaria");
  if (!bruto) return { ok: true, cor: null };
  if (!HEX_COR.test(bruto)) {
    return { ok: false, error: "Cor inválida — use o seletor ou um hex tipo #2563EB." };
  }
  return { ok: true, cor: bruto.toUpperCase() };
}

// Marca é a MÃE de Empresa e mora na mesma tela: deixá-la em `requireRHAccess`
// (que aceita os quatro papéis, GESTOR_SETOR incluso) manteria aberto o mesmo
// buraco que fechamos no CNPJ — renomear marca, trocar cor e logo do grupo
// inteiro, e criar a marca para onde puxar um CNPJ depois.
export async function criarMarca(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireAdmin();

  const nome = texto(fd, "nome");
  if (!nome) return { ok: false, error: "Informe o nome da marca." };

  const cor = lerCorPrimaria(fd);
  if (!cor.ok) return cor;

  try {
    // Cria primeiro sem logo pra ter o id (o caminho no Blob é por marca);
    // o upload preenche em seguida. Se o upload falhar, a marca fica criada
    // sem logo e o erro aparece — melhor que perder o cadastro inteiro.
    const marca = await prisma.marca.create({
      data: { nome, logoUrl: texto(fd, "logoUrl"), corPrimaria: cor.cor },
    });

    const logo = await resolverLogo(fd, marca.id);
    if (!logo.ok) return { ok: false, error: `Marca criada, mas o logo não subiu: ${logo.error}` };
    if (logo.logoUrl !== marca.logoUrl) {
      await prisma.marca.update({ where: { id: marca.id }, data: { logoUrl: logo.logoUrl } });
    }

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
  await requireAdmin();

  const nome = texto(fd, "nome");
  if (!nome) return { ok: false, error: "Informe o nome da marca." };

  const logo = await resolverLogo(fd, marcaId);
  if (!logo.ok) return logo;

  const cor = lerCorPrimaria(fd);
  if (!cor.ok) return cor;

  try {
    await prisma.marca.update({
      where: { id: marcaId },
      data: {
        nome,
        logoUrl: logo.logoUrl,
        corPrimaria: cor.cor,
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

// CNPJ é do ADMIN, e só. `requireRHAccess()` aceitava os QUATRO papéis
// (inclusive GESTOR_SETOR, o mais restrito) e não conferia alcance nenhum — as
// mesmas operações em lib/actions/rh-empresas.ts sempre exigiram `requireAdmin`,
// e a tela de Papéis documenta ADMIN como "único papel que cria/exclui Empresa
// (CNPJ)". Esta segunda implementação furava o invariante: um RH_MANAGER de uma
// marca podia mover o CNPJ de OUTRA marca para a sua com `editarEmpresa` e, no
// request seguinte, `empresasDasMarcasDoUsuario` (que resolve no banco a cada
// request) passava a devolver aquele CNPJ — leitura e escrita sobre fichas,
// folha e disciplinar de uma empresa inteira, sem ninguém ter concedido nada.
export async function criarEmpresa(
  marcaId: string,
  _prev: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const lido = lerDadosDaEmpresa(fd);
  if (!lido.ok) return { ok: false, error: lido.erro };

  try {
    const empresa = await prisma.empresa.create({
      data: { ...lido.dados, marcaId },
    });
    await registrarAuditoria({
      empresaId: empresa.id,
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
  await requireAdmin();

  const count = await prisma.colaborador.count({ where: { empresaId } });
  if (count > 0) {
    return {
      ok: false,
      error: `Não é possível excluir: há ${count} colaborador${count === 1 ? "" : "es"} vinculado${count === 1 ? "" : "s"} a esse CNPJ.`,
    };
  }

  const empresa = await prisma.empresa.delete({ where: { id: empresaId } });
  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "Empresa",
    entidadeId: empresaId,
    resumo: `CNPJ "${empresa.nome}" excluído`,
  });

  revalidatePath("/", "layout");
  return { ok: true };
}
export async function editarEmpresa(
  empresaId: string,
  _prev: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const lido = lerDadosDaEmpresa(fd);
  if (!lido.ok) return { ok: false, error: lido.erro };

  const marcaId = texto(fd, "marcaId");
  if (!marcaId) return { ok: false, error: "Informe a marca." };

  // O estado ANTERIOR, para a trilha registrar as duas mudanças que não se veem
  // no nome: trocar o CNPJ de marca (o caminho da escalada de acesso) e
  // desativá-lo (some das telas consolidadas sem erro nenhum). O resumo antigo
  // era só `Empresa "<nome>" alterada` — dizia que algo mudou, nunca o quê.
  const antes = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { marcaId: true, ativo: true },
  });
  const ativo = fd.get("ativo") === "true";

  try {
    await prisma.empresa.update({
      where: { id: empresaId },
      data: { ...lido.dados, marcaId, ativo },
    });
    const mudouMarca = antes && antes.marcaId !== marcaId;
    const mudouAtivo = antes && antes.ativo !== ativo;
    await registrarAuditoria({
      // COM empresaId: a tela de Auditoria filtra por ele, e sem o campo o
      // registro nascia com `null` e não aparecia em lugar nenhum — trilha que
      // ninguém vê é o mesmo que trilha nenhuma.
      empresaId,
      acao: "ATUALIZAR",
      entidade: "Empresa",
      entidadeId: empresaId,
      resumo:
        `Empresa "${lido.dados.nome}" alterada` +
        (mudouMarca ? " — TROCOU DE MARCA" : "") +
        (mudouAtivo ? (ativo ? " — REATIVADA" : " — DESATIVADA") : ""),
      detalhes: {
        ...(mudouMarca ? { marcaAnterior: antes.marcaId, marcaNova: marcaId } : {}),
        ...(mudouAtivo ? { ativoAnterior: antes.ativo, ativoNovo: ativo } : {}),
      },
    });
  } catch (e) {
    const msg = erroDeUnicidade(e, lido.dados.cnpj, lido.dados.nome);
    if (msg) return { ok: false, error: msg };
    throw e;
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
