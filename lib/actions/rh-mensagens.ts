"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { empresasVisiveis, requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import type { ActionResult } from "@/lib/constants";

const MAXIMO_RESPOSTA = 2000;

export async function responderMensagemPortal(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const empresaId = String(formData.get("empresaId") ?? "");
  const mensagemId = String(formData.get("mensagemId") ?? "");
  const resposta = String(formData.get("resposta") ?? "").trim().slice(0, MAXIMO_RESPOSTA);
  if (!resposta) return { ok: false, error: "Escreva a resposta antes de enviar." };

  const usuario = await requireEmpresaAccess(empresaId);

  const mensagem = await prisma.mensagemPortal.findUnique({
    where: { id: mensagemId },
    select: { id: true, empresaId: true, respondidaEm: true, colaborador: { select: { nome: true } } },
  });
  if (!mensagem) return { ok: false, error: "Mensagem não encontrada." };
  // O guard valida o acesso à empresa da URL; aqui garantimos que a mensagem
  // pertence a uma empresa que o usuário realmente enxerga — id de mensagem
  // chutado no FormData não vaza conversa de outra empresa.
  const visiveis = await empresasVisiveis(usuario);
  if (!visiveis.includes(mensagem.empresaId)) {
    return { ok: false, error: "Mensagem não encontrada." };
  }
  if (mensagem.respondidaEm) return { ok: false, error: "Esta mensagem já foi respondida." };

  await prisma.mensagemPortal.update({
    where: { id: mensagem.id },
    data: {
      resposta,
      respondidaEm: new Date(),
      respondidaPorNome: usuario.name ?? usuario.email ?? "RH",
    },
  });

  await registrarAuditoria({
    empresaId: mensagem.empresaId,
    acao: "ATUALIZAR",
    entidade: "MensagemPortal",
    entidadeId: mensagem.id,
    resumo: `Mensagem do portal de ${mensagem.colaborador.nome} respondida`,
  });

  revalidatePath("/portal");
  return { ok: true };
}
