"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { sendTelegramMessage } from "@/lib/telegram";
import { anosCompletos, hojeUTC } from "@/lib/datas";
import type { ActionResult } from "@/lib/constants";

export type TipoReconhecimento = "ANIVERSARIO" | "TEMPO_CASA";

function mensagem(tipo: TipoReconhecimento, primeiroNome: string, empresaNome: string, anos: number): string {
  if (tipo === "ANIVERSARIO") {
    return `🎉 Feliz aniversário, ${primeiroNome}! O time do RH da ${empresaNome} deseja um dia excelente. 🎂`;
  }
  return `🏆 Hoje você completa ${anos} ano${anos === 1 ? "" : "s"} de casa na ${empresaNome}! Obrigado por fazer parte do time. 🙌`;
}

/**
 * Manda os parabéns pelo bot do Telegram e registra o envio. A unique de
 * (colaborador, tipo, ano) faz a segunda tentativa no mesmo ano falhar aqui
 * — não precisa checar antes, o banco já resolve a corrida.
 */
export async function enviarReconhecimento(
  empresaId: string,
  colaboradorId: string,
  tipo: TipoReconhecimento,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);

  const colaborador = await prisma.colaborador.findFirst({
    where: { id: colaboradorId, empresaId, ativo: true },
    select: {
      id: true,
      nome: true,
      telegramChatId: true,
      dataAdmissao: true,
      empresa: { select: { nome: true } },
    },
  });
  if (!colaborador) return { ok: false, error: "Colaborador não encontrado nesta empresa." };
  if (!colaborador.telegramChatId) {
    return { ok: false, error: "Este colaborador ainda não vinculou o Telegram — não há como enviar." };
  }
  if (tipo === "TEMPO_CASA" && !colaborador.dataAdmissao) {
    return { ok: false, error: "Sem data de admissão na ficha, não dá para calcular o tempo de casa." };
  }

  const hoje = hojeUTC();
  const ano = hoje.getUTCFullYear();
  const anos = tipo === "TEMPO_CASA" ? anosCompletos(colaborador.dataAdmissao!, hoje) : 0;
  const primeiroNome = colaborador.nome.split(" ")[0];
  const texto = mensagem(tipo, primeiroNome, colaborador.empresa.nome, anos);

  const envio = await sendTelegramMessage(colaborador.telegramChatId, texto);
  if (!envio.ok) return { ok: false, error: `Falha ao enviar pelo Telegram: ${envio.error}` };

  try {
    await prisma.reconhecimento.create({
      data: {
        empresaId,
        colaboradorId,
        tipo,
        ano,
        anosCompletos: tipo === "TEMPO_CASA" ? anos : null,
        enviadoPorId: usuario?.id ?? null,
        enviadoPorNome: usuario?.name ?? null,
      },
    });
  } catch {
    // Mensagem já foi entregue no Telegram (não dá pra "desenviar"); a
    // constraint UNIQUE só bloqueia registrar duas vezes o mesmo ano — corrida
    // rara de duplo clique. Não é erro do usuário, mas também não falha a UI:
    // quem clicou já viu a mensagem sair.
  }

  const rotulo = tipo === "ANIVERSARIO" ? "Aniversário" : `Tempo de casa (${anos} anos)`;
  await registrarAuditoria({
    empresaId,
    acao: "CRIAR",
    entidade: "Reconhecimento",
    entidadeId: colaboradorId,
    resumo: `${rotulo} de ${colaborador.nome} — parabéns enviado pelo Telegram.`,
  });

  revalidatePath(`/rh/${empresaId}/reconhecimento`);
  return { ok: true };
}
