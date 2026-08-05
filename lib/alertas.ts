// Motor de alertas — fase 3 do roadmap de 02/08/2026 (docs/RD-001..., seed em
// lib/data/pesquisas-rh-seed.json, chave "alertas"). Só os 3 gatilhos que não
// dependem de pesquisa ou dado que ainda não existe:
//   AL08 — taxa de resposta baixa durante janela ativa
//   AL09 — plano de ação vencido
//   AL10 — desligamentos concentrados numa área em 90 dias
// Os outros 8 (AL01-07, AL11) dependem de IRP por área, eNPS por área, LNPS
// de gestor ou pesquisas que ainda não existem (P06/P11/P15) — ficam pra
// quando essas fases existirem.
//
// Dedup: cada alerta chama sendEmail com uma `chave` — a mesma infra que já
// evita reenviar convite/lembrete duplicado (lib/email.ts, tabela
// EmailEnviado) evita alertar a mesma pessoa duas vezes NO MESMO DIA pelo
// mesmo evento, sem precisar de tabela nova. Enquanto a situação persistir
// (plano continua vencido, área continua com resposta baixa), o alerta volta
// no dia seguinte — de propósito: "ainda não resolvido" é informação válida
// todo dia, não só na primeira vez.
//
// `cliente` (default `prisma`) aceita um `tx` de transação — é o que deixa
// isto testável com o mesmo padrão de rollback dos outros smokes
// (scripts/smoke-alertas-rh.ts), sem gravar nada de verdade no banco.
// Além do e-mail, cada checagem devolve `candidatos` — a mesma situação, no
// formato que a Central de Sinais persiste (lib/sinais.ts). Um único ponto de
// detecção de propósito: se a query mudasse aqui e não na Central, o e-mail e
// o cartão contariam histórias diferentes sobre o mesmo fato.
import { prisma, type Cliente } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { formatarData } from "@/lib/datas";
import { buscarDestinatarios } from "@/lib/pesquisa-notificacoes";
import type { CandidatoSinal } from "@/lib/sinais";

// regras_globais.n_minimo_exibicao no seed — mesmo corte usado pra não expor
// agregado de amostra pequena, reaproveitado aqui pra não alertar taxa de
// resposta de um setor com gente demais para ser ruído estatístico.
const N_MINIMO_PARA_ALERTAR_RESPOSTA = 5;
const TAXA_RESPOSTA_MINIMA_PCT = 60;
const DESLIGAMENTOS_MINIMOS_90D = 3;
const JANELA_DESLIGAMENTOS_DIAS = 90;

export type ResultadoAlertas = {
  avaliados: number;
  disparados: number;
  erros: number;
  /** As mesmas situações dos e-mails, prontas para `registrarSinais` — mesmo que o envio falhe, o sinal existe. */
  candidatos: CandidatoSinal[];
};

async function destinatarioGestorDoSetor(
  cliente: Cliente,
  empresaId: string,
  setorId: string,
): Promise<{ email: string; nome: string }[]> {
  const vinculo = await cliente.userEmpresa.findFirst({
    where: { empresaId, setorId, role: "GESTOR_SETOR", ativo: true },
    select: { user: { select: { email: true, nome: true } } },
  });
  return vinculo?.user.email ? [{ email: vinculo.user.email, nome: vinculo.user.nome }] : [];
}

async function enviarAlerta(opts: {
  chave: string;
  assunto: string;
  mensagem: string;
  destinatarios: { email: string | null; nome: string }[];
}): Promise<{ disparados: number; erros: number }> {
  let disparados = 0;
  let erros = 0;
  // Um e-mail por pessoa: a chave leva o endereço embutido de propósito,
  // senão o dedupe do primeiro destinatário do dia silenciaria os outros.
  for (const d of opts.destinatarios) {
    if (!d.email) continue;
    const resultado = await sendEmail({
      to: d.email,
      subject: opts.assunto,
      text: opts.mensagem,
      html: `<p>${opts.mensagem}</p>`,
      chave: `${opts.chave}:${d.email}`,
    });
    if (resultado.ok) disparados++;
    else erros++;
  }
  return { disparados, erros };
}

/** AL09 — plano de ação com prazo vencido, ainda não concluído nem cancelado. */
export async function verificarPlanosDeAcaoVencidos(
  cliente: Cliente = prisma,
  hoje: Date = new Date(),
): Promise<ResultadoAlertas> {
  const vencidos = await cliente.planoAcao.findMany({
    where: { status: { notIn: ["CONCLUIDO", "CANCELADO"] }, prazo: { lt: hoje } },
    select: {
      id: true,
      empresaId: true,
      titulo: true,
      prazo: true,
      responsavelNome: true,
      setorId: true,
      setor: { select: { nome: true } },
      // Snapshot do nome para a unidade do sinal — o cartão da Central precisa
      // dizer ONDE sem uma segunda consulta.
      empresa: { select: { nome: true } },
    },
  });

  let disparados = 0;
  let erros = 0;
  const candidatos: CandidatoSinal[] = [];
  for (const plano of vencidos) {
    const [diretoria, gestor] = await Promise.all([
      buscarDestinatarios(plano.empresaId, cliente),
      plano.setorId ? destinatarioGestorDoSetor(cliente, plano.empresaId, plano.setorId) : Promise.resolve([]),
    ]);
    const local = plano.setor ? ` (${plano.setor.nome})` : "";
    const dono = plano.responsavelNome ? ` Responsável: ${plano.responsavelNome}.` : "";
    const mensagem = `Plano de ação "${plano.titulo}"${local} venceu em ${formatarData(plano.prazo)} e ainda não foi concluído.${dono}`;

    candidatos.push({
      tipo: "PLANO_VENCIDO",
      // Chave por plano, sem tempo: enquanto ele seguir vencido é a MESMA
      // ocorrência — o cron confirma a linha em vez de abrir outra.
      chaveDedupe: `AL09:${plano.id}`,
      nivelUnidade: "empresa",
      unidadeId: plano.empresaId,
      unidadeNome: plano.empresa.nome,
      empresaId: plano.empresaId,
      titulo: mensagem,
      observado: `vencido desde ${formatarData(plano.prazo)} e ainda aberto`,
      esperado: "concluído (ou cancelado com motivo) até o prazo",
      recorte: null,
      gravidade: "alta",
    });

    const resultado = await enviarAlerta({
      chave: `alerta:AL09:${plano.id}`,
      assunto: "[RH] Alerta: plano de ação vencido",
      mensagem,
      destinatarios: [...diretoria, ...gestor],
    });
    disparados += resultado.disparados;
    erros += resultado.erros;
  }

  return { avaliados: vencidos.length, disparados, erros, candidatos };
}

/** AL10 — 3+ desligamentos no mesmo setor nos últimos 90 dias. */
export async function verificarDesligamentosConcentrados(
  cliente: Cliente = prisma,
  hoje: Date = new Date(),
): Promise<ResultadoAlertas> {
  const corte = new Date(hoje.getTime() - JANELA_DESLIGAMENTOS_DIAS * 24 * 60 * 60 * 1000);
  const desligados = await cliente.colaborador.findMany({
    where: { ativo: false, dataDesligamento: { gte: corte, lte: hoje } },
    select: { empresaId: true, setorId: true, setor: { select: { nome: true } } },
  });

  const porSetor = new Map<string, { empresaId: string; setorId: string; setorNome: string; count: number }>();
  for (const c of desligados) {
    const chave = `${c.empresaId}:${c.setorId}`;
    const atual = porSetor.get(chave);
    if (atual) atual.count++;
    else porSetor.set(chave, { empresaId: c.empresaId, setorId: c.setorId, setorNome: c.setor.nome, count: 1 });
  }

  const emRisco = [...porSetor.values()].filter((s) => s.count >= DESLIGAMENTOS_MINIMOS_90D);

  let disparados = 0;
  let erros = 0;
  const candidatos: CandidatoSinal[] = [];
  for (const setor of emRisco) {
    const diretoria = await buscarDestinatarios(setor.empresaId, cliente);
    const mensagem = `${setor.count} desligamentos no setor "${setor.setorNome}" nos últimos ${JANELA_DESLIGAMENTOS_DIAS} dias — turnover concentrado, vale investigar.`;

    candidatos.push({
      tipo: "DESLIGAMENTOS_CONCENTRADOS",
      // Condição contínua (janela móvel de 90 dias): chave sem tempo — a linha
      // viva vai sendo confirmada com a contagem do dia.
      chaveDedupe: `AL10:${setor.setorId}`,
      nivelUnidade: "setor",
      unidadeId: setor.setorId,
      unidadeNome: setor.setorNome,
      empresaId: setor.empresaId,
      titulo: mensagem,
      observado: `${setor.count} desligamentos em ${JANELA_DESLIGAMENTOS_DIAS} dias`,
      esperado: `menos de ${DESLIGAMENTOS_MINIMOS_90D} na mesma janela`,
      recorte:
        "Limiar fixo, não estatístico — o radar de desvio (Poisson contra a própria média) é quem separa pico real de ruído por tamanho de unidade.",
      gravidade: "alta",
    });

    const resultado = await enviarAlerta({
      chave: `alerta:AL10:${setor.setorId}`,
      assunto: "[RH] Alerta: desligamentos concentrados numa área",
      mensagem,
      destinatarios: diretoria,
    });
    disparados += resultado.disparados;
    erros += resultado.erros;
  }

  return { avaliados: porSetor.size, disparados, erros, candidatos };
}

/** AL08 — taxa de resposta abaixo de 60% num setor, com pesquisa ainda ativa (janela aberta). */
export async function verificarTaxaRespostaBaixa(cliente: Cliente = prisma): Promise<ResultadoAlertas> {
  const pesquisasAtivas = await cliente.pesquisa.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, empresaId: true, titulo: true },
  });

  let avaliados = 0;
  let disparados = 0;
  let erros = 0;
  const candidatos: CandidatoSinal[] = [];

  for (const pesquisa of pesquisasAtivas) {
    const tokens = await cliente.surveyToken.findMany({
      where: { pesquisaId: pesquisa.id, status: { not: "EXCLUIDO" } },
      select: { status: true, colaborador: { select: { setorId: true, setor: { select: { nome: true } } } } },
    });

    const porSetor = new Map<string, { setorNome: string; total: number; respondidos: number }>();
    for (const t of tokens) {
      const chave = t.colaborador.setorId;
      const atual = porSetor.get(chave) ?? { setorNome: t.colaborador.setor.nome, total: 0, respondidos: 0 };
      atual.total++;
      if (t.status === "RESPONDED") atual.respondidos++;
      porSetor.set(chave, atual);
    }

    for (const [setorId, dados] of porSetor) {
      if (dados.total < N_MINIMO_PARA_ALERTAR_RESPOSTA) continue;
      avaliados++;
      const taxaPct = Math.round((dados.respondidos / dados.total) * 100);
      if (taxaPct >= TAXA_RESPOSTA_MINIMA_PCT) continue;

      const diretoria = await buscarDestinatarios(pesquisa.empresaId, cliente);
      const gestor = await destinatarioGestorDoSetor(cliente, pesquisa.empresaId, setorId);
      const mensagem = `Taxa de resposta do setor "${dados.setorNome}" na pesquisa "${pesquisa.titulo}" está em ${taxaPct}% (${dados.respondidos}/${dados.total}), abaixo da meta de ${TAXA_RESPOSTA_MINIMA_PCT}%.`;

      candidatos.push({
        tipo: "TAXA_RESPOSTA_BAIXA",
        // Por pesquisa × setor: a mesma pesquisa pode ter dois setores atrasados,
        // e o mesmo setor pode voltar em pesquisa nova — ocorrências distintas.
        chaveDedupe: `AL08:${pesquisa.id}:${setorId}`,
        nivelUnidade: "setor",
        unidadeId: setorId,
        unidadeNome: dados.setorNome,
        empresaId: pesquisa.empresaId,
        titulo: mensagem,
        observado: `${taxaPct}% de resposta (${dados.respondidos}/${dados.total})`,
        esperado: `pelo menos ${TAXA_RESPOSTA_MINIMA_PCT}% durante a janela da pesquisa`,
        recorte: `Setores com menos de ${N_MINIMO_PARA_ALERTAR_RESPOSTA} convidados ficam fora deste sinal — amostra pequena demais para taxa dizer algo.`,
        // "atencao", não "alta": ainda dá tempo de corrigir durante a janela —
        // é lembrete de gestão da coleta, não dano consumado.
        gravidade: "atencao",
      });

      const resultado = await enviarAlerta({
        chave: `alerta:AL08:${pesquisa.id}:${setorId}`,
        assunto: "[RH] Alerta: taxa de resposta baixa",
        mensagem,
        destinatarios: [...diretoria, ...gestor],
      });
      disparados += resultado.disparados;
      erros += resultado.erros;
    }
  }

  return { avaliados, disparados, erros, candidatos };
}
