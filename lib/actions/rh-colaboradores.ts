"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { proximaMatricula } from "@/lib/matricula";
import { registrarAuditoria } from "@/lib/audit";
import type { ActionResult } from "@/lib/constants";

const colaboradorSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do colaborador"),
  cpf: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v === "" || v.length === 11, "CPF deve ter 11 dígitos")
    .optional(),
  email: z.string().trim().email("E-mail inválido").optional().or(z.literal("")),
  setorId: z.string().trim().min(1, "Selecione o setor"),
  posicaoId: z.string().trim().min(1, "Selecione a posição"),
  telegramChatId: z.string().trim().optional(),
  ativo: z.coerce.boolean().default(true),
});

async function validarSetorEPosicaoDaEmpresa(empresaId: string, setorId: string, posicaoId: string) {
  const [setor, posicao] = await Promise.all([
    prisma.setor.findFirst({ where: { id: setorId, empresaId } }),
    prisma.posicao.findFirst({ where: { id: posicaoId, empresaId } }),
  ]);
  if (!setor) return "Setor inválido para essa empresa.";
  if (!posicao) return "Posição inválida para essa empresa.";
  return null;
}

export async function createColaborador(
  empresaId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  const raw = {
    nome: formData.get("nome"),
    cpf: formData.get("cpf") || undefined,
    email: formData.get("email") || undefined,
    setorId: formData.get("setorId"),
    posicaoId: formData.get("posicaoId"),
    telegramChatId: formData.get("telegramChatId") || undefined,
    ativo: formData.get("ativo") === "on" || formData.get("ativo") === "true",
  };
  const parsed = colaboradorSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const erroEscopo = await validarSetorEPosicaoDaEmpresa(empresaId, parsed.data.setorId, parsed.data.posicaoId);
  if (erroEscopo) return { ok: false, error: erroEscopo };

  try {
    await prisma.colaborador.create({
      data: {
        empresaId,
        matricula: await proximaMatricula(),
        nome: parsed.data.nome,
        cpf: parsed.data.cpf || null,
        email: parsed.data.email || null,
        setorId: parsed.data.setorId,
        posicaoId: parsed.data.posicaoId,
        telegramChatId: parsed.data.telegramChatId || null,
        ativo: parsed.data.ativo,
      },
    });
  } catch {
    return { ok: false, error: "Já existe um colaborador com esse CPF ou chat_id do Telegram." };
  }
  revalidatePath(`/rh/${empresaId}/colaboradores`);
  return { ok: true };
}

export async function updateColaborador(
  empresaId: string,
  id: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  const raw = {
    nome: formData.get("nome"),
    cpf: formData.get("cpf") || undefined,
    email: formData.get("email") || undefined,
    setorId: formData.get("setorId"),
    posicaoId: formData.get("posicaoId"),
    telegramChatId: formData.get("telegramChatId") || undefined,
    ativo: formData.get("ativo") === "on" || formData.get("ativo") === "true",
  };
  const parsed = colaboradorSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const erroEscopo = await validarSetorEPosicaoDaEmpresa(empresaId, parsed.data.setorId, parsed.data.posicaoId);
  if (erroEscopo) return { ok: false, error: erroEscopo };

  try {
    await prisma.colaborador.update({
      where: { id, empresaId },
      data: {
        nome: parsed.data.nome,
        cpf: parsed.data.cpf || null,
        email: parsed.data.email || null,
        setorId: parsed.data.setorId,
        posicaoId: parsed.data.posicaoId,
        telegramChatId: parsed.data.telegramChatId || null,
        ativo: parsed.data.ativo,
      },
    });
  } catch {
    return { ok: false, error: "Já existe um colaborador com esse CPF ou chat_id do Telegram." };
  }
  revalidatePath(`/rh/${empresaId}/colaboradores`);
  return { ok: true };
}

export async function toggleColaboradorAtivo(empresaId: string, id: string, ativo: boolean): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const colaborador = await prisma.colaborador.findFirst({
    where: { id, empresaId },
    select: { nome: true },
  });
  if (!colaborador) return { ok: false, error: "Colaborador não encontrado." };

  await prisma.colaborador.update({ where: { id, empresaId }, data: { ativo } });

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "Colaborador",
    entidadeId: id,
    resumo: `${colaborador.nome} foi ${ativo ? "reativado(a)" : "desativado(a)"}.`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores`);
  revalidatePath(`/rh/${empresaId}/colaboradores/${id}`);
  // Headcount da empresa e do grupo.
  revalidatePath(`/rh/${empresaId}`, "layout");
  revalidatePath("/");
  return { ok: true };
}

/**
 * Apaga a ficha inteira.
 *
 * Quem PARTICIPOU de pesquisa não pode ser apagado: a resposta é anônima
 * (Resposta.colaboradorId fica null em pesquisa anônima), então o único
 * registro de que aquela pessoa respondeu é o convite com status RESPONDED —
 * apagar a ficha apagaria essa prova sem tirar a resposta do resultado.
 *
 * Convite não respondido não é motivo para segurar a exclusão, e era: como a
 * NR-01 gerou convite para a base inteira, a checagem antiga ("tem token?")
 * recusava praticamente todo mundo, e o botão de excluir só dava erro. O
 * convite pendente vai junto com a ficha.
 *
 * O resto da ficha (documentos, férias, dependentes, EPIs...) cai por cascade
 * declarado no schema. O catch existe porque uma relação nova pode entrar sem
 * cascade e derrubar a exclusão: aí o RH lê o motivo em vez de uma tela de
 * erro do servidor.
 */
export async function deleteColaborador(empresaId: string, id: string): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const colaborador = await prisma.colaborador.findFirst({
    where: { id, empresaId },
    select: { nome: true },
  });
  if (!colaborador) return { ok: false, error: "Colaborador não encontrado." };

  const [respondidos, respostas] = await Promise.all([
    prisma.surveyToken.count({ where: { colaboradorId: id, status: "RESPONDED" } }),
    prisma.resposta.count({ where: { colaboradorId: id } }),
  ]);
  if (respondidos > 0 || respostas > 0) {
    return {
      ok: false,
      error:
        "Não é possível excluir: esta pessoa respondeu a uma pesquisa e a resposta é anônima — apagar a ficha não a tira do resultado. Desative o colaborador em vez de excluir.",
    };
  }

  try {
    await prisma.$transaction([
      prisma.surveyToken.deleteMany({ where: { colaboradorId: id } }),
      prisma.colaborador.delete({ where: { id, empresaId } }),
    ]);
  } catch {
    return {
      ok: false,
      error:
        "Não foi possível excluir: existem registros vinculados a esta ficha. Desative o colaborador em vez de excluir.",
    };
  }

  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "Colaborador",
    entidadeId: id,
    resumo: `Ficha de ${colaborador.nome} foi excluída.`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores`);
  revalidatePath(`/rh/${empresaId}`, "layout");
  revalidatePath("/");
  return { ok: true };
}
