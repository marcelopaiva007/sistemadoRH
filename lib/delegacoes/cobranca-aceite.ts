import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { sendEmail } from "@/lib/email";
import { prazoLimiteAceite } from "@/lib/delegacoes/estados";
import { prazoEmTexto } from "@/lib/delegacoes/consultas";
import { rotuloCriticidade } from "@/lib/constants-delegacoes";

// REGRA 5 — ACEITE ATIVO (spec §5.5): "sem aceite em 24h/48h/72h, o sistema
// cobra o aceite e registra evento de risco." É um cutucão ÚNICO, não uma
// régua — por isso a guarda de concorrência é `emRisco: false` (não um
// contador): a primeira vez que o cron encontra a demanda vencida, cobra e
// liga `emRisco`; da segunda vez em diante ela já não bate no `where` e o
// cron a ignora. Desligar `emRisco` é ação de gente (validarMarcarEmRisco),
// não deste cron — ele só liga.

const SELECT = {
  id: true,
  titulo: true,
  criterioAceite: true,
  prazo: true,
  enviadaEm: true,
  criticidade: true,
  solicitante: { select: { nome: true } },
  responsavel: {
    select: {
      nome: true,
      email: true,
      colaborador: {
        select: {
          telegramChatId: true,
          empresa: { select: { marca: { select: { nome: true } } } },
        },
      },
    },
  },
} as const;

export async function demandasComAceitePendente(agora = new Date()) {
  // `prazoLimiteAceite` depende da criticidade, então o filtro do prazo não
  // dá para ir no `where` do banco (é por criticidade) — a varredura filtra
  // as ENVIADAS não-vencidas pelo `enviadaEm` mais cedo possível (72h, a
  // janela mais longa) e a checagem exata roda em memória, por demanda.
  const candidatas = await prisma.demanda.findMany({
    where: { status: "ENVIADA", enviadaEm: { lte: new Date(agora.getTime() - 24 * 3_600_000) } },
    select: SELECT,
  });
  return candidatas.filter((d) => {
    const limite = prazoLimiteAceite({ enviadaEm: d.enviadaEm, criticidade: d.criticidade });
    return limite !== null && limite.getTime() <= agora.getTime();
  });
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type ResultadoAceite = "cobrado" | "conflito";

/**
 * Cobra o aceite de UMA demanda e liga `emRisco`, com guarda de concorrência.
 * `conflito` = outra execução já cobrou esta (ou o responsável aceitou entre
 * a leitura e a escrita, o que também tira `status=ENVIADA` do `where`).
 */
export async function cobrarAceite(demandaId: string): Promise<ResultadoAceite> {
  const d = await prisma.demanda.findUnique({ where: { id: demandaId }, select: SELECT });
  if (!d) return "conflito";

  const { count } = await prisma.demanda.updateMany({
    where: { id: d.id, status: "ENVIADA", emRisco: false },
    data: { emRisco: true },
  });
  if (count === 0) return "conflito";

  await prisma.demandaEvento.create({
    data: {
      demandaId: d.id,
      tipoEvento: "ACEITE_COBRADO",
      autorId: null,
      autorNome: "sistema",
      dados: { horasLimite: prazoLimiteAceite({ enviadaEm: d.enviadaEm, criticidade: d.criticidade })?.toISOString() },
    },
  });

  const texto = [
    `Ainda esperando seu aceite — ${d.titulo}`,
    "",
    `Pedido por ${d.solicitante.nome}`,
    `Prazo combinado: ${prazoEmTexto(d.prazo)} · ${rotuloCriticidade(d.criticidade)}`,
    "",
    `Fica pronto quando: ${d.criterioAceite}`,
    "",
    "Toque em Aceito para confirmar o compromisso com o prazo.",
  ].join("\n");

  const chatId = d.responsavel.colaborador?.telegramChatId;
  const promessas: Promise<unknown>[] = [];
  if (chatId) {
    promessas.push(
      sendTelegramMessage(chatId, texto, {
        inline_keyboard: [[{ text: "✅ Aceito", callback_data: `d:ac:${d.id}` }]],
      }).then((r) =>
        r.ok
          ? prisma.demandaInteracao.create({
              data: { demandaId: d.id, tipo: "ENVIADA", canal: "TELEGRAM", conteudo: "Cobrança de aceite (regra 5)." },
            })
          : undefined,
      ),
    );
  }
  if (d.responsavel.email) {
    const fromName = d.responsavel.colaborador?.empresa.marca.nome
      ? `RH ${d.responsavel.colaborador.empresa.marca.nome}`
      : "Delegações";
    promessas.push(
      sendEmail({
        to: d.responsavel.email,
        fromName,
        subject: `[Delegações] Ainda esperando seu aceite — ${d.titulo}`,
        text: texto,
        html: `<p>${esc(texto).replace(/\n/g, "<br/>")}</p>`,
        chave: `delegacoes-aceite:${d.id}`,
      }).then((r) =>
        r.ok && !r.deduplicado
          ? prisma.demandaInteracao.create({
              data: { demandaId: d.id, tipo: "ENVIADA", canal: "EMAIL", conteudo: "Cobrança de aceite por e-mail (regra 5)." },
            })
          : undefined,
      ),
    );
  }
  await Promise.all(promessas);

  return "cobrado";
}
