"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { lerSessaoPortal } from "@/lib/portal-auth";
import { registrarAuditoria } from "@/lib/audit";
import type { ActionResult } from "@/lib/constants";

// Fale com o RH — o colaborador manda dúvida/pedido pelo portal e acompanha a
// resposta na mesma tela. Como em portal-cadastro.ts, nada aqui recebe
// colaboradorId por parâmetro: sempre sai da sessão, porque server action é
// endpoint público.

const MAXIMO_MENSAGEM = 2000;
// Teto de mensagens sem resposta por pessoa. Não é limite de uso — é freio
// contra loop de duplo toque e contra lotar a fila do RH com a mesma dúvida.
const MAXIMO_ABERTAS = 5;

export async function enviarMensagemAoRh(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const sessao = await lerSessaoPortal();
  if (!sessao) return { ok: false, error: "Sua sessão expirou. Peça /portal ao bot novamente." };

  const mensagem = String(formData.get("mensagem") ?? "").trim().slice(0, MAXIMO_MENSAGEM);
  if (!mensagem) return { ok: false, error: "Escreva a mensagem antes de enviar." };

  const colaborador = await prisma.colaborador.findUnique({
    where: { id: sessao.colaboradorId },
    select: { id: true, nome: true, empresaId: true, ativo: true },
  });
  if (!colaborador || !colaborador.ativo) {
    return { ok: false, error: "Cadastro não encontrado. Fale com o RH." };
  }

  const abertas = await prisma.mensagemPortal.count({
    where: { colaboradorId: colaborador.id, respondidaEm: null },
  });
  if (abertas >= MAXIMO_ABERTAS) {
    return {
      ok: false,
      error: "Você já tem mensagens aguardando resposta. Assim que o RH responder, dá para enviar outra.",
    };
  }

  await prisma.mensagemPortal.create({
    data: { colaboradorId: colaborador.id, empresaId: colaborador.empresaId, mensagem },
  });

  await registrarAuditoria({
    empresaId: colaborador.empresaId,
    acao: "CRIAR",
    entidade: "MensagemPortal",
    resumo: `Mensagem enviada ao RH pelo portal por ${colaborador.nome}`,
    ator: { id: colaborador.id, nome: colaborador.nome, papel: "COLABORADOR" },
  });

  revalidatePath("/portal");
  return { ok: true };
}
