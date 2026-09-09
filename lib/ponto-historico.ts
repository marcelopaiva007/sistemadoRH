/**
 * O histórico completo de marcações de ponto — tudo que ficou gravado de cada
 * batida, e tudo que aconteceu com ela depois.
 *
 * POR QUE EXISTE. Até v1.168.1 a tela de Ponto só tinha o monitor do DIA: quem
 * quisesse ver a batida de ontem — a foto, o GPS, quem ajustou e por quê —
 * não tinha para onde ir. Os dados estavam todos gravados (foto, coordenada,
 * IP, hash, NSR, aparelho, tratamentos, trilha de auditoria); o que faltava
 * era a consulta. Este arquivo é essa consulta, e só ela: não grava, não
 * decide, não altera nada.
 *
 * LEITOR ÚNICO, DE NOVO. A jornada de um dia vem de lib/ponto-jornada.ts, que
 * mescla RegistroPonto (batida do REP-P) com MarcacaoTratada (marcação que o
 * RH incluiu por tratamento aprovado). Aqui a mescla é a mesma — as duas
 * origens numa lista só — mas com TODAS as colunas, porque a pergunta desta
 * tela é auditoria, não apuração. A ordem, ao contrário da jornada, é
 * DECRESCENTE: histórico se lê do mais recente para trás.
 *
 * IMUTABILIDADE. Nada no sistema faz UPDATE ou DELETE em RegistroPonto — a
 * batida nasce e fica (Portaria MTP 671/2021). Correção não reescreve a linha:
 * abre um TratamentoPonto, que é outra linha, com autor, motivo, decisão e
 * data próprios. É por isso que "histórico de alterações" aqui é a lista de
 * tratamentos vinculados + a trilha de auditoria — e não um diff de versões:
 * versão anterior nenhuma foi apagada porque nenhuma foi sobrescrita.
 */

import type { Cliente } from "@/lib/prisma";
// A situação da marcação e seus rótulos moram em constants-ponto.ts: a tela
// precisa deles e não pode arrastar o cliente do banco para o navegador.
import type { StatusDaMarcacao } from "@/lib/constants-ponto";

/** Uma alteração pedida sobre a marcação — pendente, aprovada ou rejeitada. */
export type AlteracaoDaMarcacao = {
  id: string;
  tipo: string;
  status: string;
  /** "RH" (aberto pelo RH) ou "COLABORADOR" (pedido pelo portal/app). */
  origem: string;
  motivo: string;
  /** Justificativa de quem DECIDIU — nunca sobrescreve o `motivo` de quem pediu. */
  motivoDecisao: string | null;
  tipoMarcacao: string | null;
  horaSolicitada: string | null;
  pedidoEm: Date;
  decididoPorNome: string | null;
  decididoEm: Date | null;
};

/** Um evento da trilha LGPD tocando esta marcação (ver lib/audit.ts). */
export type EventoDeAuditoria = {
  id: string;
  acao: string;
  entidade: string;
  usuarioNome: string | null;
  usuarioRole: string | null;
  resumo: string;
  em: Date;
};

export type MarcacaoDoHistorico = {
  id: string;
  origem: "BATIDA" | "TRATAMENTO";
  colaboradorId: string;
  colaboradorNome: string;
  setor: string;
  cargo: string;
  /** O instante da marcação (UTC). É o que vale como hora do ponto. */
  dataHora: Date;
  /** Quando a linha entrou no banco. Difere de `dataHora` na marcação incluída
   *  pelo RH (decidida dias depois) e, em batida, mede a latência da gravação. */
  registradoEm: Date;
  tipo: string;
  status: StatusDaMarcacao;

  /** Só batida: a selfie. A imagem sai pela rota autenticada, que audita. */
  temFoto: boolean;

  latitude: number | null;
  longitude: number | null;
  precisaoGps: number | null;
  /** false = fora da cerca configurada no momento da batida. */
  gpsValido: boolean;

  ipOrigem: string | null;
  ipValido: boolean;
  dispositivoInfo: string | null;

  /** Número Sequencial de Registro. String porque BigInt não atravessa RSC. */
  nsr: string | null;
  hashSHA256: string;

  /** Só marcação incluída pelo RH: motivo copiado no instante da decisão. */
  justificativa: string | null;
  aprovadoPorNome: string | null;
  aprovadoEm: Date | null;

  alteracoes: AlteracaoDaMarcacao[];
  auditoria: EventoDeAuditoria[];
};

export type FiltroDoHistorico = {
  empresaId: string;
  /** Janela [de, ate) em instantes UTC — quem chama monta a partir do dia BRT. */
  de: Date;
  ate: Date;
  colaboradorId?: string;
  /** "ENTRADA_1" | "SAIDA_1" | "ENTRADA_2" | "SAIDA_2" */
  tipo?: string;
  /** Teto de linhas devolvidas, mais recentes primeiro. */
  limite?: number;
};

/** Teto padrão: um mês de uma empresa de ~200 pessoas cabe folgado. */
export const LIMITE_PADRAO_HISTORICO = 500;

export async function historicoDeMarcacoes(
  db: Cliente,
  filtro: FiltroDoHistorico,
): Promise<{ marcacoes: MarcacaoDoHistorico[]; truncado: boolean }> {
  const limite = filtro.limite ?? LIMITE_PADRAO_HISTORICO;

  const where = {
    empresaId: filtro.empresaId,
    ...(filtro.colaboradorId ? { colaboradorId: filtro.colaboradorId } : {}),
    ...(filtro.tipo ? { tipo: filtro.tipo } : {}),
    dataHora: { gte: filtro.de, lt: filtro.ate },
  };

  // `take: limite + 1` nas DUAS consultas: assim a mescla ainda tem material
  // suficiente para preencher o teto mesmo que uma das origens domine a
  // janela, e o "+1" é o que denuncia que ficou coisa de fora.
  const selecaoColaborador = {
    select: {
      nome: true,
      setor: { select: { nome: true } },
      posicao: { select: { nome: true } },
    },
  } as const;

  const [batidas, tratadas] = await Promise.all([
    db.registroPonto.findMany({
      where,
      orderBy: { dataHora: "desc" },
      take: limite + 1,
      include: { colaborador: selecaoColaborador },
    }),
    db.marcacaoTratada.findMany({
      where,
      orderBy: { dataHora: "desc" },
      take: limite + 1,
      include: { colaborador: selecaoColaborador },
    }),
  ]);

  // Mescla e corte ANTES de buscar tratamentos e auditoria: as duas consultas
  // seguintes são por `in` de ids, e só interessam os ids que vão para a tela.
  type Cru =
    | { origem: "BATIDA"; linha: (typeof batidas)[number] }
    | { origem: "TRATAMENTO"; linha: (typeof tratadas)[number] };

  const cruas: Cru[] = [
    ...batidas.map((linha) => ({ origem: "BATIDA" as const, linha })),
    ...tratadas.map((linha) => ({ origem: "TRATAMENTO" as const, linha })),
  ];

  // Mais recente primeiro. Empate de instante: BATIDA antes de TRATAMENTO (o
  // que a máquina mediu precede o que foi incluído por decisão), depois id —
  // mesma regra de desempate de lib/ponto-jornada.ts, para as duas telas
  // contarem a mesma história.
  cruas.sort((a, b) => {
    const dt = b.linha.dataHora.getTime() - a.linha.dataHora.getTime();
    if (dt !== 0) return dt;
    if (a.origem !== b.origem) return a.origem === "BATIDA" ? -1 : 1;
    return a.linha.id < b.linha.id ? -1 : a.linha.id > b.linha.id ? 1 : 0;
  });

  const truncado = cruas.length > limite;
  const daTela = cruas.slice(0, limite);

  const idsDeBatida = daTela.filter((c) => c.origem === "BATIDA").map((c) => c.linha.id);
  const idsDeTratamentoDaMarcacao = daTela
    .filter((c): c is Extract<Cru, { origem: "TRATAMENTO" }> => c.origem === "TRATAMENTO")
    .map((c) => c.linha.tratamentoId);

  // Os tratamentos que TOCAM estas marcações, das duas maneiras possíveis:
  // apontando para a batida (`registroPontoId`) ou sendo o tratamento que
  // gerou a marcação incluída (`id`). O filtro por empresaId vai junto de
  // propósito — o `in` de ids não é escopo, é conveniência.
  const tratamentos =
    idsDeBatida.length + idsDeTratamentoDaMarcacao.length === 0
      ? []
      : await db.tratamentoPonto.findMany({
          where: {
            empresaId: filtro.empresaId,
            OR: [
              ...(idsDeBatida.length ? [{ registroPontoId: { in: idsDeBatida } }] : []),
              ...(idsDeTratamentoDaMarcacao.length ? [{ id: { in: idsDeTratamentoDaMarcacao } }] : []),
            ],
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            registroPontoId: true,
            tipo: true,
            status: true,
            origem: true,
            motivo: true,
            motivoDecisao: true,
            tipoMarcacao: true,
            horaSolicitada: true,
            createdAt: true,
            aprovadoPorNome: true,
            aprovadoEm: true,
          },
        });

  const porBatida = new Map<string, AlteracaoDaMarcacao[]>();
  const porTratamentoId = new Map<string, AlteracaoDaMarcacao>();
  for (const t of tratamentos) {
    const alteracao: AlteracaoDaMarcacao = {
      id: t.id,
      tipo: t.tipo,
      status: t.status,
      origem: t.origem,
      motivo: t.motivo,
      motivoDecisao: t.motivoDecisao,
      tipoMarcacao: t.tipoMarcacao,
      horaSolicitada: t.horaSolicitada,
      pedidoEm: t.createdAt,
      decididoPorNome: t.aprovadoPorNome,
      decididoEm: t.aprovadoEm,
    };
    porTratamentoId.set(t.id, alteracao);
    if (t.registroPontoId) {
      const lista = porBatida.get(t.registroPontoId) ?? [];
      lista.push(alteracao);
      porBatida.set(t.registroPontoId, lista);
    }
  }

  // A trilha LGPD que menciona qualquer uma destas linhas: hoje são as
  // visualizações de foto (entidade "RegistroPonto") e as decisões de ajuste
  // (entidade "TratamentoPonto"). Ler por (entidade, entidadeId) usa o índice
  // que a tabela já tem.
  const idsParaAuditoria = [
    ...idsDeBatida,
    ...tratamentos.map((t) => t.id),
  ];
  const eventos = idsParaAuditoria.length
    ? await db.auditLog.findMany({
        where: {
          entidade: { in: ["RegistroPonto", "TratamentoPonto"] },
          entidadeId: { in: idsParaAuditoria },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          acao: true,
          entidade: true,
          entidadeId: true,
          usuarioNome: true,
          usuarioRole: true,
          resumo: true,
          createdAt: true,
        },
      })
    : [];

  const auditoriaPorEntidadeId = new Map<string, EventoDeAuditoria[]>();
  for (const e of eventos) {
    if (!e.entidadeId) continue;
    const lista = auditoriaPorEntidadeId.get(e.entidadeId) ?? [];
    lista.push({
      id: e.id,
      acao: e.acao,
      entidade: e.entidade,
      usuarioNome: e.usuarioNome,
      usuarioRole: e.usuarioRole,
      resumo: e.resumo,
      em: e.createdAt,
    });
    auditoriaPorEntidadeId.set(e.entidadeId, lista);
  }

  const marcacoes: MarcacaoDoHistorico[] = daTela.map((c) => {
    if (c.origem === "BATIDA") {
      const b = c.linha;
      const alteracoes = porBatida.get(b.id) ?? [];
      const status: StatusDaMarcacao = alteracoes.some((a) => a.status === "PENDENTE")
        ? "EM_TRATAMENTO"
        : alteracoes.some((a) => a.status === "APROVADO")
          ? "AJUSTADA"
          : "VALIDA";

      return {
        id: b.id,
        origem: "BATIDA",
        colaboradorId: b.colaboradorId,
        colaboradorNome: b.colaborador.nome,
        setor: b.colaborador.setor.nome,
        cargo: b.colaborador.posicao.nome,
        dataHora: b.dataHora,
        registradoEm: b.createdAt,
        tipo: b.tipo,
        status,
        temFoto: b.fotoUrl !== null,
        latitude: b.latitude,
        longitude: b.longitude,
        precisaoGps: b.precisaoGps,
        gpsValido: b.gpsValido,
        ipOrigem: b.ipOrigem,
        ipValido: b.ipValido,
        dispositivoInfo: b.dispositivoInfo,
        nsr: b.nsr.toString(),
        hashSHA256: b.hashSHA256,
        justificativa: null,
        aprovadoPorNome: null,
        aprovadoEm: null,
        alteracoes,
        auditoria: [
          ...(auditoriaPorEntidadeId.get(b.id) ?? []),
          ...alteracoes.flatMap((a) => auditoriaPorEntidadeId.get(a.id) ?? []),
        ].sort((x, y) => y.em.getTime() - x.em.getTime()),
      };
    }

    const m = c.linha;
    const alteracao = porTratamentoId.get(m.tratamentoId);
    return {
      id: m.id,
      origem: "TRATAMENTO",
      colaboradorId: m.colaboradorId,
      colaboradorNome: m.colaborador.nome,
      setor: m.colaborador.setor.nome,
      cargo: m.colaborador.posicao.nome,
      dataHora: m.dataHora,
      registradoEm: m.createdAt,
      tipo: m.tipo,
      status: "INCLUIDA_PELO_RH",
      // Marcação incluída por decisão nunca tem selfie: não houve batida.
      temFoto: false,
      latitude: null,
      longitude: null,
      precisaoGps: null,
      gpsValido: true,
      ipOrigem: null,
      ipValido: true,
      dispositivoInfo: null,
      nsr: null,
      hashSHA256: m.hashSHA256,
      justificativa: m.justificativa,
      aprovadoPorNome: m.aprovadoPorNome,
      aprovadoEm: m.aprovadoEm,
      alteracoes: alteracao ? [alteracao] : [],
      auditoria: (auditoriaPorEntidadeId.get(m.tratamentoId) ?? []).slice().sort(
        (x, y) => y.em.getTime() - x.em.getTime(),
      ),
    };
  });

  return { marcacoes, truncado };
}
