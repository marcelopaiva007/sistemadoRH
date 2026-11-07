"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMaster } from "@/lib/grupo-guard";
import { registrarAuditoria } from "@/lib/audit";
import { violouUnique } from "@/lib/prisma-erros";
import type { ActionResult } from "@/lib/constants";
import { apenasDigitosCnpj, cnpjValido } from "@/lib/cnpj";
import { loginJaUsado } from "@/lib/usuario-por-identificador";
import { copiarModelosParaCliente } from "@/lib/perfis-cliente";
import { dominioDigitado } from "@/lib/endereco-cliente";

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Valor em reais digitado como gente digita — "1.500,00", "R$ 1500", "1500.5"
 * — em centavos. Vazio = null; inválido = false.
 */
function centavosDigitados(bruto: string): number | null | false {
  let v = bruto.replace(/R\$|\s/gi, "");
  if (!v) return null;
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  else if (!/^\d+\.\d{1,2}$/.test(v)) v = v.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return false;
  const centavos = Math.round(Number(v) * 100);
  if (!Number.isSafeInteger(centavos) || centavos > 2_000_000_000) return false;
  return centavos;
}

type DadosCadastro = {
  razaoSocial: string | null;
  cnpj: string | null;
  responsavelNome: string | null;
  contatoEmail: string | null;
  contatoTelefone: string | null;
  plano: string | null;
  valorMensalCentavos: number | null;
  diaVencimento: number | null;
  limiteUsuarios: number | null;
  inicioContrato: Date | null;
  observacoes: string | null;
};

/**
 * Lê e valida os campos de cadastro do cliente — os mesmos ao criar e ao
 * salvar. Tudo opcional: campo vazio vira null.
 */
function lerCadastro(fd: FormData): { ok: true; dados: DadosCadastro } | { ok: false; error: string } {
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

  const valorMensalCentavos = centavosDigitados(texto(fd, "valorMensal"));
  if (valorMensalCentavos === false)
    return { ok: false, error: "Valor mensal inválido. Use, por exemplo, 1.500,00." };

  const diaBruto = texto(fd, "diaVencimento");
  let diaVencimento: number | null = null;
  if (diaBruto) {
    const n = Number(diaBruto);
    if (!Number.isInteger(n) || n < 1 || n > 31) return { ok: false, error: "Dia de vencimento precisa ser de 1 a 31." };
    diaVencimento = n;
  }

  const dataBruta = texto(fd, "inicioContrato");
  let inicioContrato: Date | null = null;
  if (dataBruta) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataBruta)) return { ok: false, error: "Data de início do contrato inválida." };
    inicioContrato = new Date(`${dataBruta}T00:00:00.000Z`);
    if (Number.isNaN(inicioContrato.getTime())) return { ok: false, error: "Data de início do contrato inválida." };
  }

  return {
    ok: true,
    dados: {
      razaoSocial: ouNulo("razaoSocial"),
      cnpj,
      responsavelNome: ouNulo("responsavelNome"),
      contatoEmail,
      contatoTelefone: ouNulo("contatoTelefone"),
      plano: ouNulo("plano"),
      valorMensalCentavos,
      diaVencimento,
      limiteUsuarios,
      inicioContrato,
      observacoes: ouNulo("observacoes"),
    },
  };
}

export async function criarGrupo(
  _prev: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  await requireMaster();
  const nome = texto(fd, "nome");
  if (nome.length < 2) return { ok: false, error: "Informe o nome do cliente." };
  // Cadastro completo já na criação (v1.201.0) — todos os campos opcionais.
  const cadastro = lerCadastro(fd);
  if (!cadastro.ok) return cadastro;
  try {
    // Cliente novo nasce com uma cópia de cada modelo de perfil FASTMAI
    // (v1.199.0) — sem isso, ninguém dele teria perfil para receber.
    const grupo = await prisma.$transaction(async (tx) => {
      const g = await tx.grupo.create({ data: { nome, ...cadastro.dados } });
      await copiarModelosParaCliente(g.id, tx);
      return g;
    });
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

  const cadastro = lerCadastro(fd);
  if (!cadastro.ok) return cadastro;

  // Endereço próprio (v1.198.0). Tirar o endereço de um cliente devolve os
  // usuários dele ao endereço comum: só pode se nenhum login lá repetir.
  const dominio = dominioDigitado(texto(fd, "dominio"));
  if (dominio === false)
    return { ok: false, error: "Endereço inválido. Use só o endereço, ex.: rh.cliente.com.br" };
  const atual = await prisma.grupo.findUnique({ where: { id: grupoId }, select: { dominio: true } });
  if (atual?.dominio && !dominio) {
    const repetidos = await prisma.$queryRaw<{ username: string }[]>`
      SELECT u.username FROM "rh"."User" u
      WHERE u."grupoId" = ${grupoId}
        AND EXISTS (
          SELECT 1 FROM "rh"."User" o
          LEFT JOIN "rh"."Grupo" og ON og.id = o."grupoId"
          WHERE lower(o.username) = lower(u.username)
            AND o."grupoId" IS DISTINCT FROM ${grupoId}
            AND (o."grupoId" IS NULL OR og.dominio IS NULL)
        )
      LIMIT 5`;
    if (repetidos.length > 0)
      return {
        ok: false,
        error: `Não dá para tirar o endereço: estes logins já existem no endereço comum — ${repetidos.map((r) => r.username).join(", ")}.`,
      };
  }

  try {
    await prisma.grupo.update({
      where: { id: grupoId },
      data: {
        dominio,
        ...cadastro.dados,
      },
    });
  } catch (e) {
    if (violouUnique(e, "Grupo_dominio_key"))
      return { ok: false, error: `O endereço ${dominio} já é de outro cliente.` };
    throw e;
  }
  await registrarAuditoria({
    acao: "ATUALIZAR",
    entidade: "Grupo",
    entidadeId: grupoId,
    resumo: `Atualizou os dados cadastrais do cliente "${antes.nome}"${dominio ? ` (endereço ${dominio})` : ""}`,
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
        username: true,
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

  // Login é único por cliente (v1.198.0): no cliente de destino o nome não
  // pode estar em uso — nem, se ele entra pelo endereço comum, entre os
  // outros clientes que também entram por lá.
  const conflito = await loginJaUsado(user.username, user.id, prisma, grupo.id);
  if (conflito)
    return {
      ok: false,
      error: `Já existe o usuário “${conflito.username}”${conflito.grupoNome ? ` no cliente ${conflito.grupoNome}` : ""}. Renomeie o login de ${user.nome} antes de mudá-lo de cliente.`,
    };

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

/**
 * Liga ou desliga o CONTRATO do cliente (v1.201.0). Situação comercial: o
 * cliente inativo sai da receita mensal e aparece como inativo na Gestão. Por
 * ora NÃO bloqueia login — cortar o acesso de quem está inativo é decisão à
 * parte, que mexe em permissão.
 */
export async function definirContratoAtivo(grupoId: string, ativo: boolean): Promise<ActionResult> {
  await requireMaster();
  const antes = await prisma.grupo.findUnique({
    where: { id: grupoId },
    select: { nome: true, contratoAtivo: true },
  });
  if (!antes) return { ok: false, error: "Cliente não encontrado." };
  if (antes.contratoAtivo === ativo) return { ok: true };
  await prisma.grupo.update({ where: { id: grupoId }, data: { contratoAtivo: ativo } });
  await registrarAuditoria({
    acao: "ATUALIZAR",
    entidade: "Grupo",
    entidadeId: grupoId,
    resumo: `${ativo ? "Reativou" : "Inativou"} o contrato do cliente "${antes.nome}"`,
  });
  revalidatePath(CAMINHO);
  return { ok: true };
}
