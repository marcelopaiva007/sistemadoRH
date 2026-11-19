"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireFrotaEmpresa } from "@/lib/processos-auth-guard";
import { empresasVisiveis } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { cifrar, decifrar, dicaDe } from "@/lib/cripto";
import type { ActionResult } from "@/lib/constants";
import { lerPlanilhaDeAcessos } from "@/lib/processos/mobility-planilha";

// Acessos dos motoristas ao app de recarga Mobility (v1.208.0).
//
// Regra que atravessa o arquivo inteiro: a senha só sai do banco por
// `revelarSenhaMobility`, e cada saída vira linha de auditoria. Nenhuma outra
// função devolve senha — nem a listagem, nem o salvar.

function caminho(empresaId: string) {
  return `/processos/${empresaId}/frota/mobility`;
}

const so = (s: string | null | undefined) => (s ?? "").trim();
const placaLimpa = (s: string | null | undefined) => {
  const p = so(s).toUpperCase().replace(/[^A-Z0-9]/g, "");
  // "A DEFINIR" e afins: quem ainda não tem carro fica sem placa.
  return p && p !== "ADEFINIR" ? p : null;
};
const textoOuNulo = (s: string | null | undefined) => {
  const t = so(s);
  return t && t.toUpperCase() !== "A DEFINIR" ? t : null;
};

async function veiculoDaPlaca(placa: string | null, visiveis: string[]) {
  if (!placa) return null;
  const v = await prisma.veiculo.findFirst({
    where: { placa, empresaId: { in: visiveis } },
    select: { id: true },
  });
  return v?.id ?? null;
}

/** Cadastra ou edita um acesso. Senha vazia na edição = mantém a atual. */
export async function salvarAcessoMobility(input: {
  id?: string | null;
  empresaId: string;
  nome: string;
  cpf?: string | null;
  email: string;
  senha?: string | null;
  placa?: string | null;
  modelo?: string | null;
  observacao?: string | null;
  ativo?: boolean;
}): Promise<ActionResult> {
  const usuario = await requireFrotaEmpresa(input.empresaId);
  const visiveis = await empresasVisiveis(usuario);

  const nome = so(input.nome).toUpperCase();
  const email = so(input.email).toLowerCase();
  if (!nome) return { ok: false, error: "Informe o nome do motorista." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "E-mail inválido." };

  const senha = input.senha ?? "";
  const placa = placaLimpa(input.placa);
  const dados = {
    nome,
    cpf: so(input.cpf).replace(/\D/g, "") || null,
    email,
    placa,
    modelo: textoOuNulo(input.modelo),
    veiculoId: await veiculoDaPlaca(placa, visiveis),
    observacao: so(input.observacao) || null,
    ativo: input.ativo ?? true,
    ...(senha ? { senhaCifrada: cifrar(senha), senhaDica: dicaDe(senha) } : {}),
  };

  if (input.id) {
    const atual = await prisma.acessoMobility.findFirst({
      where: { id: input.id, empresaId: { in: visiveis } },
      select: { id: true, empresaId: true },
    });
    if (!atual) return { ok: false, error: "Acesso não encontrado no seu acesso." };
    const repetido = await prisma.acessoMobility.findFirst({
      where: { empresaId: atual.empresaId, email, NOT: { id: atual.id } },
      select: { id: true },
    });
    if (repetido) return { ok: false, error: "Já existe um acesso com este e-mail." };
    await prisma.acessoMobility.update({ where: { id: atual.id }, data: dados });
  } else {
    const repetido = await prisma.acessoMobility.findUnique({
      where: { empresaId_email: { empresaId: input.empresaId, email } },
      select: { id: true },
    });
    if (repetido) return { ok: false, error: "Já existe um acesso com este e-mail." };
    await prisma.acessoMobility.create({ data: { ...dados, empresaId: input.empresaId } });
  }

  await registrarAuditoria({
    empresaId: input.empresaId,
    acao: input.id ? "ATUALIZAR" : "CRIAR",
    entidade: "AcessoMobility",
    entidadeId: input.id ?? email,
    resumo: `${input.id ? "Editou" : "Cadastrou"} o acesso Mobility de ${nome}${senha ? " (senha alterada)" : ""}`,
  });

  revalidatePath(caminho(input.empresaId));
  return { ok: true };
}

/** Ativa ou desativa — desativar não apaga: o histórico de quem teve acesso fica. */
export async function alternarAcessoMobility(input: {
  empresaId: string;
  id: string;
  ativo: boolean;
}): Promise<ActionResult> {
  const usuario = await requireFrotaEmpresa(input.empresaId);
  const visiveis = await empresasVisiveis(usuario);
  const atual = await prisma.acessoMobility.findFirst({
    where: { id: input.id, empresaId: { in: visiveis } },
    select: { id: true, nome: true, empresaId: true },
  });
  if (!atual) return { ok: false, error: "Acesso não encontrado no seu acesso." };
  await prisma.acessoMobility.update({ where: { id: atual.id }, data: { ativo: input.ativo } });
  await registrarAuditoria({
    empresaId: atual.empresaId,
    acao: "ATUALIZAR",
    entidade: "AcessoMobility",
    entidadeId: atual.id,
    resumo: `${input.ativo ? "Reativou" : "Desativou"} o acesso Mobility de ${atual.nome}`,
  });
  revalidatePath(caminho(input.empresaId));
  return { ok: true };
}

/** A única porta de saída da senha. Cada chamada fica registrada. */
export async function revelarSenhaMobility(input: {
  empresaId: string;
  id: string;
}): Promise<{ ok: true; senha: string } | { ok: false; error: string }> {
  const usuario = await requireFrotaEmpresa(input.empresaId);
  const visiveis = await empresasVisiveis(usuario);
  const a = await prisma.acessoMobility.findFirst({
    where: { id: input.id, empresaId: { in: visiveis } },
    select: { id: true, nome: true, empresaId: true, senhaCifrada: true },
  });
  if (!a) return { ok: false, error: "Acesso não encontrado no seu acesso." };
  if (!a.senhaCifrada) return { ok: false, error: "Este acesso está sem senha gravada." };
  const senha = decifrar(a.senhaCifrada);
  if (senha === null) {
    return { ok: false, error: "Não foi possível abrir a senha gravada. Cadastre-a de novo em Editar." };
  }
  await registrarAuditoria({
    empresaId: a.empresaId,
    acao: "ATUALIZAR",
    entidade: "AcessoMobility",
    entidadeId: a.id,
    resumo: `Visualizou a senha do acesso Mobility de ${a.nome}`,
  });
  return { ok: true, senha };
}

/**
 * Importa a planilha (CSV exportado do Google Sheets, ou colado direto dela).
 * Colunas esperadas: Nome, CPF, E-mail, Senha, Placa, Modelo. O e-mail é a
 * chave: linha com e-mail que já existe ATUALIZA o acesso, não duplica.
 */
export async function importarAcessosMobility(input: {
  empresaId: string;
  texto: string;
}): Promise<
  { ok: true; criados: number; atualizados: number; ignorados: string[] } | { ok: false; error: string }
> {
  const usuario = await requireFrotaEmpresa(input.empresaId);
  const visiveis = await empresasVisiveis(usuario);

  const lidas = lerPlanilhaDeAcessos(input.texto);
  if (!lidas.ok) return lidas;

  let criados = 0;
  let atualizados = 0;
  const ignorados: string[] = [];

  for (const [i, l] of lidas.linhas.entries()) {
    const email = l.email.toLowerCase();
    if (!l.nome || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      ignorados.push(`linha ${i + 2}: ${l.nome || "sem nome"} — nome ou e-mail inválido`);
      continue;
    }
    const placa = placaLimpa(l.placa);
    const dados = {
      nome: l.nome.toUpperCase(),
      cpf: l.cpf.replace(/\D/g, "") || null,
      placa,
      modelo: textoOuNulo(l.modelo),
      veiculoId: await veiculoDaPlaca(placa, visiveis),
      ...(l.senha ? { senhaCifrada: cifrar(l.senha), senhaDica: dicaDe(l.senha) } : {}),
    };
    const existente = await prisma.acessoMobility.findUnique({
      where: { empresaId_email: { empresaId: input.empresaId, email } },
      select: { id: true },
    });
    if (existente) {
      await prisma.acessoMobility.update({ where: { id: existente.id }, data: dados });
      atualizados++;
    } else {
      await prisma.acessoMobility.create({ data: { ...dados, email, empresaId: input.empresaId } });
      criados++;
    }
  }

  await registrarAuditoria({
    empresaId: input.empresaId,
    acao: "CRIAR",
    entidade: "AcessoMobility",
    entidadeId: null,
    resumo: `Importou a planilha de acessos Mobility: ${criados} novo(s), ${atualizados} atualizado(s), ${ignorados.length} ignorado(s)`,
  });

  revalidatePath(caminho(input.empresaId));
  return { ok: true, criados, atualizados, ignorados };
}
