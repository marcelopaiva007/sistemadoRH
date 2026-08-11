// Régua de cobrança — fase 5 do roadmap de 02/08/2026 (seed: chave
// "regua_cobranca", 11 passos de dia -3 a dia 45, ancorados no lançamento da
// campanha). Só os passos com canal que este sistema sabe entregar e que são
// disparo de mensagem (não reunião/dashboard/ranking):
//
//   dia 3  — LEMBRETE_1 (com placar de quantos já responderam)
//   dia 7  — LEMBRETE_2 (reforça anonimato)
//   dia 13 — ULTIMO_AVISO
//   dia 15 — ENCERRAMENTO
//
// Fora, de propósito: dia -3 (precisa de "data de início agendada", que
// `ativarAgendadas()` documenta não existir ainda), dia 5/20/30 (ranking de
// gestores, link de dashboard, reunião presencial — não são envio de
// mensagem), dia 10 "cobrança de gestor por área abaixo de 60%" — já coberto,
// de forma contínua em vez de só num dia fixo, pelo alerta AL08
// (lib/alertas.ts). Canais mural/whatsapp/reunião não existem neste sistema
// (só Telegram e e-mail).
//
// CLIMA migrou pra cá em 02/08/2026 (aprovado pelo Marcelo): antes tinha
// lembrete/encerramento próprios (lembrete-pesquisa: 3 lembretes a cada 5
// dias; `encerrarVencidas` em lib/pesquisa-ciclo.ts: fechava em 30 dias,
// condicional a resposta recente). Isso muda o timing pra campanhas que
// estejam no ar — dia 15 fecha incondicionalmente, mais cedo que os 30 dias
// de antes. `encerrarVencidas` fica no código mas vira inerte pra CLIMA: uma
// pesquisa nunca mais chega aos 30 dias ainda ACTIVE, porque a régua já
// fechou no dia 15.
import { prisma, type Cliente } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { sendTelegramMessage } from "@/lib/telegram";
import { CONVITES_NA_PESQUISA, participacaoPct } from "@/lib/pesquisa-numeros";

export const MODELOS_COM_REGUA_NOVA = ["NR01", "P05-ENPS", "CLIMA"];

type AcaoRegua = "LEMBRETE_1" | "LEMBRETE_2" | "ULTIMO_AVISO";

const PASSOS_LEMBRETE: { diaRelativo: number; acao: AcaoRegua }[] = [
  { diaRelativo: 3, acao: "LEMBRETE_1" },
  { diaRelativo: 7, acao: "LEMBRETE_2" },
  { diaRelativo: 13, acao: "ULTIMO_AVISO" },
];
const DIA_ENCERRAMENTO = 15;

function diasDesde(inicio: Date, hoje: Date): number {
  const inicioDia = new Date(inicio);
  inicioDia.setHours(0, 0, 0, 0);
  const hojeDia = new Date(hoje);
  hojeDia.setHours(0, 0, 0, 0);
  return Math.round((hojeDia.getTime() - inicioDia.getTime()) / (24 * 60 * 60 * 1000));
}

function mensagemDoPasso(
  acao: AcaoRegua,
  titulo: string,
  link: string,
  placarTexto: string,
): { assunto: string; texto: string } {
  switch (acao) {
    case "LEMBRETE_1":
      return {
        assunto: `Lembrete: pesquisa "${titulo}"`,
        texto: `Sua opinião sobre a pesquisa "${titulo}" ainda não foi registrada. ${placarTexto}Leva poucos minutos: ${link}`,
      };
    case "LEMBRETE_2":
      return {
        assunto: `Lembrete: pesquisa "${titulo}" ainda aberta`,
        texto: `A pesquisa "${titulo}" segue aberta. As respostas são analisadas apenas de forma agregada — ninguém vê quem respondeu o quê. Responda aqui: ${link}`,
      };
    case "ULTIMO_AVISO":
      return {
        assunto: `Último aviso: "${titulo}" encerra em breve`,
        texto: `A pesquisa "${titulo}" encerra em poucos dias. Esta é a última chance de participar: ${link}`,
      };
  }
}

async function enviarPassoLembrete(cliente: Cliente, pesquisa: { id: string; titulo: string }, acao: AcaoRegua): Promise<number> {
  const [convites, respostas] = await Promise.all([
    cliente.surveyToken.count({ where: { pesquisaId: pesquisa.id, ...CONVITES_NA_PESQUISA } }),
    cliente.resposta.count({ where: { pesquisaId: pesquisa.id } }),
  ]);
  const placarTexto = acao === "LEMBRETE_1" ? `Até agora, ${participacaoPct(respostas, convites)}% já responderam. ` : "";

  const pendentes = await cliente.surveyToken.findMany({
    where: { pesquisaId: pesquisa.id, status: "SENT" },
    select: { id: true, token: true, colaborador: { select: { nome: true, email: true, telegramChatId: true } } },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  let enviados = 0;
  for (const t of pendentes) {
    const link = `${baseUrl}/responder/${t.token}`;
    const { assunto, texto } = mensagemDoPasso(acao, pesquisa.titulo, link, placarTexto);

    let ok = false;
    if (t.colaborador.telegramChatId) {
      const r = await sendTelegramMessage(t.colaborador.telegramChatId, texto);
      ok = r.ok;
    } else if (t.colaborador.email) {
      const r = await sendEmail({
        to: t.colaborador.email,
        subject: `[RH] ${assunto}`,
        text: texto,
        html: `<p>${texto}</p>`,
        // Dedup real vem do bucket de dia (`diasDesde === diaRelativo` só é
        // verdade num único dia-calendário), não desta chave — mas a chave
        // ainda evita duplicar se o cron rodar duas vezes no mesmo dia.
        chave: `regua:${pesquisa.id}:${acao}:${t.id}`,
      });
      ok = r.ok;
    }
    if (ok) enviados++;
  }
  return enviados;
}

export type ResultadoRegua = { avaliadas: number; lembretesEnviados: number; encerradas: number; erros: number };

/**
 * Roda 1×/dia. Para cada pesquisa ACTIVE dos tipos cobertos, calcula dias
 * desde `iniciadaEm` e dispara o passo do dia (se houver) e fecha a pesquisa
 * a partir do dia 15 — fechar é idempotente (checa `status: ACTIVE` de
 * novo), diferente do lembrete, que só faz sentido no dia exato.
 */
/**
 * @param apenas  Restringe a régua a estas pesquisas. Existe para o smoke:
 *   sem isso ele chamava a função sobre a base inteira e MANDAVA LEMBRETE DE
 *   VERDADE para colaborador real — 15 e-mails saíram assim em 04/08/2026,
 *   antes da hora do cron, só porque alguém rodou o teste. Em produção o
 *   parâmetro é omitido e o comportamento é o de sempre.
 */
export async function executarReguaCobranca(
  cliente: Cliente = prisma,
  hoje: Date = new Date(),
  apenas?: string[],
): Promise<ResultadoRegua> {
  const pesquisasAtivas = await cliente.pesquisa.findMany({
    where: {
      status: "ACTIVE",
      modelo: { in: MODELOS_COM_REGUA_NOVA },
      iniciadaEm: { not: null },
      ...(apenas ? { id: { in: apenas } } : {}),
    },
    select: { id: true, titulo: true, iniciadaEm: true },
  });

  let lembretesEnviados = 0;
  let encerradas = 0;
  let erros = 0;

  for (const pesquisa of pesquisasAtivas) {
    const dias = diasDesde(pesquisa.iniciadaEm!, hoje);

    const passo = PASSOS_LEMBRETE.find((p) => p.diaRelativo === dias);
    if (passo) {
      try {
        lembretesEnviados += await enviarPassoLembrete(cliente, pesquisa, passo.acao);
      } catch {
        erros++;
      }
    }

    if (dias >= DIA_ENCERRAMENTO) {
      await cliente.pesquisa.update({
        where: { id: pesquisa.id },
        data: { status: "FINISHED", encerradaEm: hoje },
      });
      encerradas++;
    }
  }

  return { avaliadas: pesquisasAtivas.length, lembretesEnviados, encerradas, erros };
}
