"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { empresasVisiveis, requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import type { ActionResult } from "@/lib/constants";
import { sendTelegramMessage } from "@/lib/telegram";
import { sendEmail } from "@/lib/email";
import { canaisDoAvisoDeResposta, montarAvisoDeResposta } from "@/lib/aviso-resposta-portal";

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

  // Grava SÓ se ainda não respondida — condição no próprio UPDATE (auditoria
  // de 26/11/2026). A conferência acima lê e o `update` escrevia depois: dois
  // atendentes respondendo a mesma mensagem passavam os dois pela leitura, e
  // o segundo sobrescrevia a resposta do primeiro sem ninguém saber — o
  // colaborador via no portal só a última. Com `updateMany` condicional, o
  // banco decide quem chegou primeiro; o segundo recebe aviso e a tela
  // recarrega mostrando a resposta que valeu.
  const { count } = await prisma.mensagemPortal.updateMany({
    where: { id: mensagem.id, respondidaEm: null },
    data: {
      resposta,
      respondidaEm: new Date(),
      respondidaPorNome: usuario.name ?? usuario.email ?? "RH",
    },
  });
  if (count === 0) {
    revalidatePath(`/rh/${empresaId}/mensagens`);
    return {
      ok: false,
      error: "Outra pessoa do RH respondeu esta mensagem enquanto você escrevia. A sua resposta não foi enviada.",
    };
  }

  await registrarAuditoria({
    empresaId: mensagem.empresaId,
    acao: "ATUALIZAR",
    entidade: "MensagemPortal",
    entidadeId: mensagem.id,
    resumo: `Mensagem do portal de ${mensagem.colaborador.nome} respondida`,
  });

  // Aviso ao colaborador (26/11/2026) — depois da resposta já gravada e fora
  // do caminho da tela (`after`): o RH não espera o Telegram/SMTP, e uma falha
  // no aviso NÃO desfaz a resposta, só fica no log. Só chega aqui quem ganhou
  // a gravação condicional acima, então o aviso sai uma vez por mensagem.
  after(() =>
    avisarColaboradorDaResposta(mensagem.id).catch((e) =>
      console.error("[rh-mensagens] aviso de resposta falhou:", e),
    ),
  );

  revalidatePath("/portal");
  revalidatePath(`/rh/${empresaId}/mensagens`);
  return { ok: true };
}

/**
 * Avisa o colaborador de que há resposta no portal — Telegram se vinculado,
 * senão e-mail do cadastro. O texto não leva a resposta (lib/aviso-resposta-portal.ts).
 */
async function avisarColaboradorDaResposta(mensagemId: string): Promise<void> {
  const m = await prisma.mensagemPortal.findUnique({
    where: { id: mensagemId },
    select: {
      empresaId: true,
      colaborador: {
        select: {
          nome: true,
          ativo: true,
          telegramChatId: true,
          email: true,
          empresa: { select: { marca: { select: { nome: true } } } },
        },
      },
    },
  });
  if (!m) return;
  const c = m.colaborador;
  const canais = canaisDoAvisoDeResposta(c);
  if (canais.length === 0) return;

  const marca = c.empresa.marca.nome;
  const aviso = montarAvisoDeResposta(c.nome, marca);

  if (canais.includes("TELEGRAM") && c.telegramChatId) {
    const enviado = await sendTelegramMessage(c.telegramChatId, aviso.telegram);
    if (enviado.ok) return;
    // Bot bloqueado ou chat apagado: cai para o e-mail, se houver.
    console.error(`[rh-mensagens] Telegram do aviso de resposta ${mensagemId} falhou: ${enviado.error}`);
  }

  if (canais.includes("EMAIL") && c.email) {
    const enviado = await sendEmail({
      to: c.email,
      subject: aviso.assunto,
      html: aviso.html,
      text: aviso.texto,
      fromName: `RH ${marca}`,
      origem: "RESPOSTA_PORTAL",
      empresaId: m.empresaId,
      marcaNome: marca,
      chave: `resposta-portal:${mensagemId}`,
    });
    if (!enviado.ok) {
      console.error(`[rh-mensagens] e-mail do aviso de resposta ${mensagemId} falhou: ${enviado.error}`);
    }
  }
}
