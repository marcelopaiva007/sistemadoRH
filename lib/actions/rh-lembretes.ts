"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { ehChaveLembrete, LEMBRETES_CONFIGURAVEIS, type ChaveLembrete } from "@/lib/cron-horario";
import { PAPEIS_QUE_CONFIGURAM } from "@/lib/segredos";
import type { ActionResult } from "@/lib/constants";

/**
 * Horário dos crons de comunicação é configuração global do sistema, não por
 * empresa — mesmo raciocínio e mesmos dois papéis de
 * lib/actions/rh-segredos.ts: ADMIN e DIRETORIA, não RH_MANAGER/GESTOR_SETOR,
 * que são escopados a uma empresa.
 */
async function exigirPapel(): Promise<
  { ok: true; user: { id: string; nome?: string | null } } | { ok: false; error: string }
> {
  const user = await requireUser();
  if (!PAPEIS_QUE_CONFIGURAM.includes(user.role as string)) {
    return { ok: false, error: "Só a administração ou a diretoria pode alterar horário de lembrete." };
  }
  return { ok: true, user };
}

const FORMATO_HORARIO = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function normalizarHorario(valor: string): string | null {
  const v = valor.trim();
  if (!FORMATO_HORARIO.test(v)) return null;
  const [h, m] = v.split(":");
  return `${h.padStart(2, "0")}:${m}`;
}

export async function adicionarHorarioLembrete(
  empresaId: string,
  chave: string,
  horario: string,
): Promise<ActionResult> {
  const permissao = await exigirPapel();
  if (!permissao.ok) return permissao;
  if (!ehChaveLembrete(chave)) return { ok: false, error: "Lembrete desconhecido." };

  const hhmm = normalizarHorario(horario);
  if (!hhmm) return { ok: false, error: "Horário inválido — use HH:mm, ex.: 09:30." };

  const existente = await prisma.configuracaoLembrete.findUnique({
    where: { chave_horario: { chave, horario: hhmm } },
  });
  if (existente) return { ok: false, error: `Já existe um horário ${hhmm} cadastrado para este lembrete.` };

  await prisma.configuracaoLembrete.create({
    data: { chave, horario: hhmm, atualizadoPor: permissao.user.nome ?? permissao.user.id },
  });

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "ConfiguracaoLembrete",
    entidadeId: chave,
    resumo: `Horário ${hhmm} adicionado a "${LEMBRETES_CONFIGURAVEIS[chave as ChaveLembrete].label}".`,
  });

  revalidatePath(`/rh/${empresaId}/lembretes`);
  return { ok: true };
}

export async function removerHorarioLembrete(empresaId: string, id: string): Promise<ActionResult> {
  const permissao = await exigirPapel();
  if (!permissao.ok) return permissao;

  const existente = await prisma.configuracaoLembrete.findUnique({ where: { id } });
  if (!existente) return { ok: false, error: "Horário não encontrado." };

  await prisma.configuracaoLembrete.delete({ where: { id } });

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "ConfiguracaoLembrete",
    entidadeId: existente.chave,
    resumo: `Horário ${existente.horario} removido de "${
      ehChaveLembrete(existente.chave) ? LEMBRETES_CONFIGURAVEIS[existente.chave].label : existente.chave
    }".`,
  });

  revalidatePath(`/rh/${empresaId}/lembretes`);
  return { ok: true };
}

export async function alternarHorarioLembrete(
  empresaId: string,
  id: string,
  ativo: boolean,
): Promise<ActionResult> {
  const permissao = await exigirPapel();
  if (!permissao.ok) return permissao;

  const existente = await prisma.configuracaoLembrete.findUnique({ where: { id } });
  if (!existente) return { ok: false, error: "Horário não encontrado." };

  await prisma.configuracaoLembrete.update({
    where: { id },
    data: { ativo, atualizadoPor: permissao.user.nome ?? permissao.user.id },
  });

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "ConfiguracaoLembrete",
    entidadeId: existente.chave,
    resumo: `Horário ${existente.horario} de "${
      ehChaveLembrete(existente.chave) ? LEMBRETES_CONFIGURAVEIS[existente.chave].label : existente.chave
    }" ${ativo ? "reativado" : "pausado"}.`,
  });

  revalidatePath(`/rh/${empresaId}/lembretes`);
  return { ok: true };
}
