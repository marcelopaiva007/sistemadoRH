"use server";

// Marcar (e desfazer) "enviado ao escritório" de um evento do eSocial —
// 26/11/2026. A marcação é o que tira o prazo da tela de Pendências (ver
// lib/esocial.ts); o sistema não transmite nada ao eSocial.
//
// GUARDA EM DUAS CAMADAS, como pede o escopo multi-empresa (AGENTS.md):
//   1. `requireEmpresaAccess` no CNPJ da rota — quem não opera o RH desta
//      empresa nem chega aqui;
//   2. o evento é RECALCULADO a partir do banco dentro dos CNPJs que o usuário
//      enxerga (empresasVisiveis). Um `referenciaId` de outro grupo, digitado
//      num POST à mão, não aparece nessa lista e é recusado — e o `empresaId`
//      gravado é o do FATO, nunca um valor vindo do formulário.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { empresasVisiveis, requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { eventoAtual } from "@/lib/esocial";
import { ehTipoEventoEsocial, rotuloEventoEsocial } from "@/lib/prazos-legais";
import { violouUnique } from "@/lib/prisma-erros";
import type { ActionResult } from "@/lib/constants";

export async function marcarEventoEsocialEnviado(
  empresaId: string,
  tipo: string,
  referenciaId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);
  if (!ehTipoEventoEsocial(tipo)) return { ok: false, error: "Tipo de evento inválido." };

  const visiveis = await empresasVisiveis(usuario);
  const evento = await eventoAtual(visiveis, tipo, referenciaId);
  if (!evento) {
    return {
      ok: false,
      error: "Evento não encontrado — a data pode ter sido corrigida na ficha. Recarregue a tela.",
    };
  }
  if (evento.envio) return { ok: false, error: "Este evento já está marcado como enviado." };

  const observacao = String(formData.get("observacao") ?? "").trim().slice(0, 500) || null;

  try {
    await prisma.eventoEsocialEnvio.create({
      data: {
        empresaId: evento.empresaId,
        colaboradorId: evento.colaboradorId,
        tipo,
        referenciaId,
        enviadoPorId: usuario.id ?? null,
        enviadoPorNome: usuario.name ?? null,
        observacao,
      },
    });
  } catch (e) {
    // Duas abas marcando ao mesmo tempo: o único [tipo, referenciaId] segura.
    if (violouUnique(e)) return { ok: false, error: "Este evento já está marcado como enviado." };
    throw e;
  }

  await registrarAuditoria({
    empresaId: evento.empresaId,
    acao: "ATUALIZAR",
    entidade: "EventoEsocialEnvio",
    entidadeId: referenciaId,
    resumo: `${rotuloEventoEsocial(tipo)} de ${evento.colaboradorNome} marcado como enviado ao escritório.`,
  });

  revalidatePath(`/rh/${empresaId}/esocial`);
  revalidatePath(`/rh/${empresaId}`);
  return { ok: true };
}

export async function desfazerEnvioEsocial(
  empresaId: string,
  tipo: string,
  referenciaId: string,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);
  if (!ehTipoEventoEsocial(tipo)) return { ok: false, error: "Tipo de evento inválido." };

  const visiveis = await empresasVisiveis(usuario);
  const envio = await prisma.eventoEsocialEnvio.findUnique({
    where: { tipo_referenciaId: { tipo, referenciaId } },
    select: { id: true, empresaId: true, colaboradorId: true },
  });
  // CNPJ fora do que a pessoa enxerga responde igual a "não existe": não
  // confirma a quem pergunta que o registro existe em outro grupo.
  if (!envio || !visiveis.includes(envio.empresaId)) return { ok: false, error: "Marcação não encontrada." };

  await prisma.eventoEsocialEnvio.delete({ where: { id: envio.id } });

  const colaborador = await prisma.colaborador.findUnique({
    where: { id: envio.colaboradorId },
    select: { nome: true },
  });
  await registrarAuditoria({
    empresaId: envio.empresaId,
    acao: "EXCLUIR",
    entidade: "EventoEsocialEnvio",
    entidadeId: referenciaId,
    resumo: `Desfeita a marcação de envio ao escritório: ${rotuloEventoEsocial(tipo)} de ${colaborador?.nome ?? "colaborador"}.`,
  });

  revalidatePath(`/rh/${empresaId}/esocial`);
  revalidatePath(`/rh/${empresaId}`);
  return { ok: true };
}
