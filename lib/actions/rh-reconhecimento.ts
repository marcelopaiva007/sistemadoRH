"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { sendTelegramMessage } from "@/lib/telegram";
import { formatarData } from "@/lib/datas";
import { hojeBrasiliaUTC, marcoDoAno, type MarcoDeCasa } from "@/lib/reconhecimento/anos-de-casa";
import type { ActionResult } from "@/lib/constants";

export type TipoReconhecimento = "ANIVERSARIO" | "TEMPO_CASA";

function mensagem(
  tipo: TipoReconhecimento,
  primeiroNome: string,
  empresaNome: string,
  marco: MarcoDeCasa | null,
): string {
  if (tipo === "ANIVERSARIO" || !marco) {
    return `🎉 Feliz aniversário, ${primeiroNome}! O time do RH da ${empresaNome} deseja um dia excelente. 🎂`;
  }
  const anos = `${marco.anos} ano${marco.anos === 1 ? "" : "s"} de casa na ${empresaNome}`;
  // O RH costuma mandar antes ou depois do dia — "Hoje você completa" só no dia.
  if (marco.diasAte === 0) return `🏆 Hoje você completa ${anos}! Obrigado por fazer parte do time. 🙌`;
  if (marco.diasAte > 0) {
    return `🏆 No dia ${formatarData(marco.data).slice(0, 5)} você completa ${anos}! Obrigado por fazer parte do time. 🙌`;
  }
  return `🏆 Você completou ${anos}! Obrigado por fazer parte do time. 🙌`;
}

/**
 * Manda os parabéns pelo bot do Telegram e registra o envio.
 *
 * REGISTRA ANTES DE ENVIAR (26/11/2026, auditoria). Até aqui a mensagem saía
 * primeiro e o registro vinha depois, num `try` que engolia a violação da
 * unique (colaborador, tipo, ano): duplo clique, duas abas ou dois do RH ao
 * mesmo tempo mandavam os parabéns DUAS vezes — e o Telegram não desenvia. A
 * unique continua sendo a trava, só que agora antes do envio: quem não
 * consegue gravar o registro não envia. Se o Telegram falhar, o registro é
 * desfeito, para o RH poder tentar de novo.
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

  const hoje = hojeBrasiliaUTC();
  const ano = hoje.getUTCFullYear();
  const marco = tipo === "TEMPO_CASA" ? marcoDoAno(colaborador.dataAdmissao!, hoje) : null;
  const anos = marco?.anos ?? 0;
  if (marco && anos < 1) {
    return { ok: false, error: "A pessoa ainda não completa um ano de casa este ano." };
  }
  const primeiroNome = colaborador.nome.split(" ")[0];
  const texto = mensagem(tipo, primeiroNome, colaborador.empresa.nome, marco);

  let registroId: string;
  try {
    const registro = await prisma.reconhecimento.create({
      data: {
        empresaId,
        colaboradorId,
        tipo,
        ano,
        anosCompletos: marco ? anos : null,
        enviadoPorId: usuario?.id ?? null,
        enviadoPorNome: usuario?.name ?? null,
      },
      select: { id: true },
    });
    registroId = registro.id;
  } catch {
    // A unique (colaborador, tipo, ano) recusou: alguém já mandou este ano —
    // ou está mandando agora, noutra aba. Não envia de novo.
    revalidatePath(`/rh/${empresaId}/reconhecimento`);
    return { ok: false, error: "Os parabéns deste ano já foram enviados para esta pessoa." };
  }

  const envio = await sendTelegramMessage(colaborador.telegramChatId, texto);
  if (!envio.ok) {
    await prisma.reconhecimento.delete({ where: { id: registroId } }).catch(() => {});
    return { ok: false, error: `Falha ao enviar pelo Telegram: ${envio.error}` };
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
