"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/audit";
import {
  MAXIMO_TENTATIVAS_CPF,
  cpfConfere,
  encerrarSessaoPortal,
  lerSessaoPortal,
} from "@/lib/portal-auth";
import type { ActionResult } from "@/lib/constants";

/**
 * Confirmação de CPF da primeira entrada no portal.
 *
 * O vínculo do Telegram casa pelos últimos 8 dígitos do telefone importado do
 * elleven. Para convidar alguém a responder uma pesquisa, essa margem de erro é
 * tolerável; para abrir salário, conta bancária e documentos, não é. Então na
 * primeira vez o portal pede o CPF, mesmo de quem já vinculou pelo telefone.
 */
export async function confirmarCpfDoPortal(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const sessao = await lerSessaoPortal();
  if (!sessao) return { ok: false, error: "Sua sessão expirou. Peça um novo link ao bot: /portal" };

  const colaborador = await prisma.colaborador.findUnique({
    where: { id: sessao.colaboradorId },
    select: { id: true, nome: true, cpf: true, empresaId: true, portalVerificadoEm: true },
  });
  if (!colaborador) return { ok: false, error: "Cadastro não encontrado. Procure o RH." };
  if (colaborador.portalVerificadoEm) return { ok: true };

  if (!colaborador.cpf) {
    return {
      ok: false,
      error: "Seu CPF ainda não está no cadastro, então não dá para confirmar por aqui. Procure o RH.",
    };
  }

  const informado = String(formData.get("cpf") ?? "");
  if (cpfConfere(informado, colaborador.cpf)) {
    await prisma.$transaction([
      prisma.colaborador.update({
        where: { id: colaborador.id },
        data: { portalVerificadoEm: new Date() },
      }),
      prisma.portalSessao.update({ where: { id: sessao.id }, data: { tentativasCpf: 0 } }),
    ]);
    await registrarAuditoria({
      empresaId: colaborador.empresaId,
      acao: "ATUALIZAR",
      entidade: "Colaborador",
      entidadeId: colaborador.id,
      resumo: "Confirmou o CPF na primeira entrada no portal.",
      ator: { id: colaborador.id, nome: colaborador.nome, papel: "COLABORADOR" },
    });
    revalidatePath("/portal");
    return { ok: true };
  }

  const { tentativasCpf } = await prisma.portalSessao.update({
    where: { id: sessao.id },
    data: { tentativasCpf: { increment: 1 } },
    select: { tentativasCpf: true },
  });

  if (tentativasCpf >= MAXIMO_TENTATIVAS_CPF) {
    await encerrarSessaoPortal(sessao.id);
    await registrarAuditoria({
      empresaId: colaborador.empresaId,
      acao: "EXCLUIR",
      entidade: "PortalSessao",
      entidadeId: colaborador.id,
      resumo: `Sessão do portal encerrada após ${MAXIMO_TENTATIVAS_CPF} tentativas de CPF erradas.`,
      ator: { id: colaborador.id, nome: colaborador.nome, papel: "COLABORADOR" },
    });
    return {
      ok: false,
      error: "Tentativas demais. A sessão foi encerrada — peça um novo link ao bot: /portal",
    };
  }

  const restantes = MAXIMO_TENTATIVAS_CPF - tentativasCpf;
  return { ok: false, error: `CPF não confere. Restam ${restantes} tentativa(s).` };
}

export async function sairDoPortal(): Promise<void> {
  const sessao = await lerSessaoPortal();
  await encerrarSessaoPortal(sessao?.id);
  redirect("/portal/saiu");
}
