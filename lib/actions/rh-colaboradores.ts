"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { proximaMatricula } from "@/lib/matricula";
import { registrarAuditoria } from "@/lib/audit";
import { criariCiclo } from "@/lib/organograma";
import { empresasDaMesmaMarca } from "@/lib/escopo-marca";
import { invalidarConvitesDeDesligados } from "@/lib/pesquisa-vinculo";
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
  supervisorId: z.string().trim().optional(),
  gerente: z.coerce.boolean().default(false),
  ativo: z.coerce.boolean().default(true),
});

/**
 * "Reporta a" — usada tanto na criação quanto na edição, com o `idExcluido`
 * só fazendo sentido na edição (ninguém pode liderar a si mesmo, mas na
 * criação o colaborador ainda nem tem id).
 *
 * O líder vale para a MARCA inteira, não para o CNPJ da URL: um supervisor da
 * RSM tem gente da BRNET embaixo, e o organograma já mostra os CNPJs irmãos na
 * mesma árvore. Validando por empresaId, o nome aparecia na lista mas o Salvar
 * respondia "Líder inválido para essa empresa" — a tela oferecia uma escolha
 * que o servidor recusava.
 */
async function validarSupervisor(
  empresaId: string,
  supervisorId: string,
  idExcluido?: string,
): Promise<string | null> {
  if (supervisorId === idExcluido) return "Alguém não pode liderar a si mesmo.";
  const supervisor = await prisma.colaborador.findFirst({
    where: { id: supervisorId, empresaId: { in: await empresasDaMesmaMarca(empresaId) }, ativo: true },
  });
  if (!supervisor) return "Líder inválido para essa marca.";
  // Na criação não há ciclo possível: um colaborador novo não lidera ninguém
  // ainda, então não pode aparecer na própria cadeia de liderança.
  if (idExcluido && (await criariCiclo(idExcluido, supervisorId))) {
    return "Essa escolha criaria um ciclo de liderança (A lidera B que lidera A).";
  }
  return null;
}

async function validarSetorEPosicaoDaEmpresa(empresaId: string, setorId: string, posicaoId: string) {
  const [setor, posicao] = await Promise.all([
    prisma.setor.findFirst({ where: { id: setorId, empresaId } }),
    prisma.posicao.findFirst({ where: { id: posicaoId, empresaId } }),
  ]);
  if (!setor) return "Setor inválido para essa empresa.";
  if (!posicao) return "Posição inválida para essa empresa.";
  return null;
}

/**
 * O chat_id do Telegram é digitado à mão aqui — o RH lê do retorno da API do
 * bot (getUpdates) e cola no campo. O bot (app/api/telegram/webhook) já
 * impede duas pessoas com o mesmo chat_id quando o vínculo nasce de um
 * /start, mas essa tela não tinha a mesma trava: nada impedia colar o mesmo
 * número em duas fichas por engano, e o erro só aparece semanas depois como
 * "Bad Request: chat not found" no envio — o dono de verdade recebe, o outro
 * nunca vai receber nada e ninguém sabe por quê.
 *
 * Não há `@@unique` no schema para isto: um índice único bloquearia o
 * `create`/`update` com um erro genérico do banco; aqui o nome de quem já
 * está com aquele número entra na mensagem, para o RH corrigir sem precisar
 * caçar.
 */
async function validarTelegramChatIdLivre(
  empresaId: string,
  telegramChatId: string,
  idExcluido?: string,
): Promise<string | null> {
  const dono = await prisma.colaborador.findFirst({
    where: { empresaId, telegramChatId, ...(idExcluido ? { NOT: { id: idExcluido } } : {}) },
    select: { nome: true },
  });
  return dono ? `Este chat_id do Telegram já está no cadastro de ${dono.nome}.` : null;
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
    supervisorId: formData.get("supervisorId") || undefined,
    gerente: formData.get("gerente") === "on" || formData.get("gerente") === "true",
    ativo: formData.get("ativo") === "on" || formData.get("ativo") === "true",
  };
  const parsed = colaboradorSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const erroEscopo = await validarSetorEPosicaoDaEmpresa(empresaId, parsed.data.setorId, parsed.data.posicaoId);
  if (erroEscopo) return { ok: false, error: erroEscopo };

  if (parsed.data.telegramChatId) {
    const erroChatId = await validarTelegramChatIdLivre(empresaId, parsed.data.telegramChatId);
    if (erroChatId) return { ok: false, error: erroChatId };
  }

  if (parsed.data.supervisorId) {
    const erroSupervisor = await validarSupervisor(empresaId, parsed.data.supervisorId);
    if (erroSupervisor) return { ok: false, error: erroSupervisor };
  }

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
        supervisorId: parsed.data.supervisorId || null,
        gerente: parsed.data.gerente,
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
    supervisorId: formData.get("supervisorId") || undefined,
    gerente: formData.get("gerente") === "on" || formData.get("gerente") === "true",
    ativo: formData.get("ativo") === "on" || formData.get("ativo") === "true",
  };
  const parsed = colaboradorSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const erroEscopo = await validarSetorEPosicaoDaEmpresa(empresaId, parsed.data.setorId, parsed.data.posicaoId);
  if (erroEscopo) return { ok: false, error: erroEscopo };

  if (parsed.data.telegramChatId) {
    const erroChatId = await validarTelegramChatIdLivre(empresaId, parsed.data.telegramChatId, id);
    if (erroChatId) return { ok: false, error: erroChatId };
  }

  if (parsed.data.supervisorId) {
    const erroSupervisor = await validarSupervisor(empresaId, parsed.data.supervisorId, id);
    if (erroSupervisor) return { ok: false, error: erroSupervisor };
  }

  const atual = await prisma.colaborador.findFirst({ where: { id, empresaId }, select: { ativo: true } });
  if (!atual) return { ok: false, error: "Colaborador não encontrado." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.colaborador.update({
        where: { id, empresaId },
        data: {
          nome: parsed.data.nome,
          cpf: parsed.data.cpf || null,
          email: parsed.data.email || null,
          setorId: parsed.data.setorId,
          posicaoId: parsed.data.posicaoId,
          telegramChatId: parsed.data.telegramChatId || null,
          supervisorId: parsed.data.supervisorId || null,
          gerente: parsed.data.gerente,
          ativo: parsed.data.ativo,
        },
      });
      // RD-001: transição true→false é o momento do desligamento — expira os
      // convites de pesquisa em aberto (ver lib/pesquisa-vinculo.ts).
      if (atual.ativo && !parsed.data.ativo) {
        await invalidarConvitesDeDesligados(tx, id);
      }
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
    select: { nome: true, ativo: true },
  });
  if (!colaborador) return { ok: false, error: "Colaborador não encontrado." };

  await prisma.$transaction(async (tx) => {
    await tx.colaborador.update({ where: { id, empresaId }, data: { ativo } });
    // RD-001: mesma regra do formulário de edição — ver acima.
    if (colaborador.ativo && !ativo) {
      await invalidarConvitesDeDesligados(tx, id);
    }
  });

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
 * Só o "Reporta a" — para editar direto no Organograma sem abrir o formulário
 * inteiro do colaborador (que pede nome/setor/posição também). `supervisorId
 * null` remove o líder.
 *
 * Escopo de MARCA nos dois lados: o organograma desenha os CNPJs irmãos na
 * mesma árvore, então o lápis também aparece para quem é de outro CNPJ da
 * marca. Procurando por empresaId, esses cliques morriam em "Colaborador não
 * encontrado" — a pessoa estava na tela, só não na empresa da URL.
 */
export async function definirSupervisor(
  empresaId: string,
  id: string,
  supervisorId: string | null,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const colaborador = await prisma.colaborador.findFirst({
    where: { id, empresaId: { in: await empresasDaMesmaMarca(empresaId) } },
    select: { nome: true, supervisorId: true },
  });
  if (!colaborador) return { ok: false, error: "Colaborador não encontrado." };

  let nomeNovoLider: string | null = null;
  if (supervisorId) {
    const erro = await validarSupervisor(empresaId, supervisorId, id);
    if (erro) return { ok: false, error: erro };
    nomeNovoLider = (await prisma.colaborador.findUnique({ where: { id: supervisorId }, select: { nome: true } }))!
      .nome;
  }

  try {
    await prisma.colaborador.update({ where: { id }, data: { supervisorId } });
  } catch (e) {
    console.error("definirSupervisor:", e);
    return { ok: false, error: "Não foi possível salvar o líder. Tente de novo." };
  }

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "Colaborador",
    entidadeId: id,
    resumo: nomeNovoLider
      ? `${colaborador.nome} passou a reportar a ${nomeNovoLider}.`
      : `${colaborador.nome} ficou sem líder definido.`,
  });

  revalidatePath(`/rh/${empresaId}/organograma`);
  revalidatePath(`/rh/${empresaId}/colaboradores`);
  revalidatePath(`/rh/${empresaId}/colaboradores/${id}`);
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
