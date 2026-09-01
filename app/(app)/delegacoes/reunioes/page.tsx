import { prisma } from "@/lib/prisma";
import { requireDelegacoesAccess } from "@/lib/delegacoes-auth-guard";
import { listarPessoasParaDelegar } from "@/lib/delegacoes/pessoas";
import { formatarDataHoraBrasilia, hojeUTC } from "@/lib/datas";
import { ReunioesView, type ReuniaoLinha } from "./reunioes-view";

/**
 * REUNIÕES — marcar uma vez, convocar todo mundo (pedido da Direção em
 * 31/08/2026). A reunião é o agrupador: cada convocado tem a PRÓPRIA demanda
 * (regra 1 intacta), aceitar é confirmar presença, e a régua de cobrança que
 * já existe faz o lembrete de véspera conforme a criticidade.
 *
 * A lista é DE QUEM MARCOU (`solicitanteId = eu`), como Delegadas por mim —
 * a demanda de cada convocado já aparece para ele em Recebidas e no Telegram.
 */
export default async function ReunioesPage() {
  const usuario = await requireDelegacoesAccess();

  const [reunioes, pessoas, marcas] = await Promise.all([
    prisma.reuniao.findMany({
      where: { solicitanteId: usuario.id },
      orderBy: { dataHora: "desc" },
      select: {
        id: true,
        titulo: true,
        pauta: true,
        local: true,
        dataHora: true,
        demandas: {
          select: {
            id: true,
            status: true,
            emRisco: true,
            responsavel: { select: { nome: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    listarPessoasParaDelegar(usuario.id),
    prisma.marca.findMany({
      where: { ativo: true },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  // Comparação por DIA (hojeUTC, o padrão do repo): a reunião só vira "já
  // aconteceu" no dia seguinte — no próprio dia ela ainda é assunto vivo.
  const hoje = hojeUTC();
  const linhas: ReuniaoLinha[] = reunioes.map((r) => ({
    id: r.id,
    titulo: r.titulo,
    pauta: r.pauta,
    local: r.local,
    quandoTexto: formatarDataHoraBrasilia(r.dataHora),
    passada: r.dataHora.getTime() < hoje.getTime(),
    convocados: r.demandas.map((d) => ({
      demandaId: d.id,
      nome: d.responsavel.nome,
      status: d.status,
      emRisco: d.emRisco,
    })),
  }));

  return <ReunioesView reunioes={linhas} pessoas={pessoas} marcas={marcas} />;
}
