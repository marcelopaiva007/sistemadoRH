// Régua de cobrança automática de contracheques pendentes (dias 2, 4 e 5 após envio).
//
// O prazo total é de 5 dias corridos. Os lembretes são enviados via Telegram
// no horário configurado pelo RH (tela Configuração → Lembretes).

import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { rotuloDoContracheque } from "./situacao";
import { PRAZO_DIAS_CORRIDOS } from "./envio";

function primeiroNome(nome: string): string {
  return (nome.split(" ")[0] ?? "").toLowerCase().replace(/^\p{L}/u, (c) => c.toUpperCase());
}

/** Formata data YYYY-MM-DD no fuso de Brasília. */
function chaveDataBrasilia(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Calcula os dias corridos de calendário decorridos entre duas datas em Brasília. */
export function diasCorridosDecorridos(envio: Date, agora = new Date()): number {
  const dEnvio = new Date(chaveDataBrasilia(envio) + "T00:00:00Z");
  const dAgora = new Date(chaveDataBrasilia(agora) + "T00:00:00Z");
  const diffMs = dAgora.getTime() - dEnvio.getTime();
  return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
}

/** Verifica se um contracheque deve receber lembrete hoje (dias 2, 4 ou 5). */
export function deveCobrarContracheque(
  enviadoEm: Date,
  agora = new Date(),
  lembretesJaEnviados = 0
): { cobrar: boolean; motivo?: string; diasRestantes?: number } {
  const dias = diasCorridosDecorridos(enviadoEm, agora);
  const diasRestantes = Math.max(0, PRAZO_DIAS_CORRIDOS - dias);

  if (dias === 2 && lembretesJaEnviados < 1) {
    return { cobrar: true, motivo: "Lembrete inicial (dia 2)", diasRestantes };
  }
  if (dias === 4 && lembretesJaEnviados < 2) {
    return { cobrar: true, motivo: "Lembrete de atenção (dia 4)", diasRestantes };
  }
  if (dias === 5 && lembretesJaEnviados < 3) {
    return { cobrar: true, motivo: "Lembrete final de prazo (dia 5)", diasRestantes: 0 };
  }

  return { cobrar: false };
}

/** Monta o texto de cobrança amigável no Telegram. */
export function montarMensagemLembreteTelegram(
  nome: string,
  ref: string,
  marca: string,
  diasRestantes: number
): string {
  const saudacao = `Oi, ${nome}!`;
  if (diasRestantes === 0) {
    return (
      `${saudacao} Lembrete: hoje é o último dia do prazo para assinar o recebimento do seu contracheque de ${ref}. ⚠️\n\n` +
      `Abra o link enviado para o seu e-mail para assinar e confirmar com sua selfie.\n\n` +
      `RH — ${marca}`
    );
  }

  return (
    `${saudacao} Lembrete: seu contracheque de ${ref} ainda está pendente de assinatura. Restam ${diasRestantes} dia(s) de prazo. ⏳\n\n` +
    `Abra o link enviado para o seu e-mail para assinar e confirmar com sua selfie.\n\n` +
    `RH — ${marca}`
  );
}

/** Executa a rodada diária de cobrança automática via Cron. */
export async function rodadaLembreteContracheque(agora = new Date()): Promise<{
  verificados: number;
  cobrados: number;
  falhas: number;
}> {
  const pendentes = await prisma.reciboContracheque.findMany({
    where: {
      enviadoEm: { not: null },
      confirmadoEm: null,
      colaborador: {
        ativo: true,
        telegramChatId: { not: null },
      },
    },
    select: {
      id: true,
      enviadoEm: true,
      lembretesEnviados: true,
      competencia: true,
      tipoFolha: true,
      colaborador: {
        select: {
          nome: true,
          telegramChatId: true,
          empresa: { select: { marca: { select: { nome: true } } } },
        },
      },
    },
  });

  let cobrados = 0;
  let falhas = 0;

  for (const r of pendentes) {
    if (!r.enviadoEm || !r.colaborador.telegramChatId) continue;
    const checagem = deveCobrarContracheque(r.enviadoEm, agora, r.lembretesEnviados);
    if (!checagem.cobrar) continue;

    const nome = primeiroNome(r.colaborador.nome);
    const ref = rotuloDoContracheque(r.competencia, r.tipoFolha);
    const marca = r.colaborador.empresa.marca?.nome || "RH";
    const texto = montarMensagemLembreteTelegram(nome, ref, marca, checagem.diasRestantes ?? 0);

    try {
      const enviado = await sendTelegramMessage(r.colaborador.telegramChatId, texto);
      if (enviado.ok) {
        await prisma.reciboContracheque.update({
          where: { id: r.id },
          data: {
            lembretesEnviados: { increment: 1 },
            ultimoLembreteEm: agora,
          },
        });
        cobrados++;
      } else {
        falhas++;
      }
    } catch (e) {
      console.error(`[lembrete-contracheque] erro ao cobrar ${r.id}:`, e);
      falhas++;
    }
  }

  return { verificados: pendentes.length, cobrados, falhas };
}
