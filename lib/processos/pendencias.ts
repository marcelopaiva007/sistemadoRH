import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { diferencaEmDiasUTC, hojeUTC, formatarData } from "@/lib/datas";
import { formatarPlaca, rotulo, TIPOS_DOCUMENTO_VEICULO } from "@/lib/processos/ctb";

/**
 * Os detectores da Central de Pendências.
 *
 * A ideia é a mesma de `lib/sinais.ts`, e é de propósito: um SEGUNDO motor de
 * alerta em paralelo é como o sistema acaba com duas listas de pendência que
 * discordam entre si — e aí o RH deixa de confiar nas duas. Aqui o cron detecta,
 * a linha existente é atualizada pela chave de dedupe, e o que parou de ser
 * detectado se fecha sozinho.
 *
 * Cada detector responde a uma pergunta com data. Nada aqui inventa prazo: os
 * prazos vêm de `lib/processos/ctb.ts`, com o artigo ao lado, e são gravados
 * MATERIALIZADOS na linha — para um alerta antigo continuar explicando por que
 * disparou, mesmo depois de a regra ter mudado.
 */

export type Candidata = {
  dominio: string;
  tipo: string;
  origemTipo: string;
  origemId: string;
  empresaId: string;
  titulo: string;
  descricao?: string | null;
  venceEm: Date;
  contagem?: "DIAS_UTEIS" | "DIAS_CORRIDOS";
  origemLegal?: "INTERNO" | "JUDICIAL";
};

/**
 * O quanto cada tipo dói quando passa. Não é opinião de quem cadastrou: é o que
 * a lei cobra do outro lado, e por isso mora no código, ao lado do artigo.
 *
 * 3 = a empresa perde dinheiro ou o veículo sai de circulação;
 * 2 = a empresa perde um direito (defesa, recurso, desconto);
 * 1 = ainda dá para resolver sem consequência.
 */
const IMPACTO: Record<string, number> = {
  // Não indicar em 30 dias = multa nova do dobro, somada à original (3× no
  // total). É o prazo mais caro do módulo, e o único que se paga toda vez.
  INDICAR_CONDUTOR: 3,
  // Gravíssima com remoção do veículo — a van sai da rua no meio da instalação.
  LICENCIAMENTO: 3,
  // Sem comunicar, a empresa responde solidariamente pelo que o comprador fizer.
  COMUNICACAO_VENDA: 3,
  CNH_VENCENDO: 3,
  // "Pontos perto do limite" NÃO está aqui de propósito: ainda não há detector
  // para ele (a tela de Condutores mostra o aviso, mas nada vira pendência).
  // Uma entrada sem detector faria parecer que a Central cobre o caso — e é
  // assim que o alerta mais caro deixa de ser construído sem ninguém notar.
  NOVO_CRV: 2,
  DEFESA_AUTUACAO: 2,
  RECURSO_JARI: 2,
  IPVA: 2,
  SEGURO: 2,
  TOXICOLOGICO: 2,
  MANUTENCAO_PROGRAMADA: 1,
  DOCUMENTO_VEICULO: 1,
};

/**
 * Severidade é DERIVADA — dias restantes × impacto —, nunca digitada. Digitada,
 * vira opinião de quem cadastrou, e duas pessoas classificam a mesma coisa
 * diferente no mesmo dia.
 */
export function severidadeDe(diasRestantes: number, tipo: string): string {
  const impacto = IMPACTO[tipo] ?? 1;
  if (diasRestantes < 0) return impacto >= 2 ? "CRITICA" : "ALTA";
  if (diasRestantes <= 7) return impacto >= 3 ? "CRITICA" : "ALTA";
  if (diasRestantes <= 30) return impacto >= 3 ? "ALTA" : "ATENCAO";
  return "ATENCAO";
}

/** Identidade da ocorrência — é por ela que o cron reencontra a linha. */
export function chaveDe(c: Candidata): string {
  return `${c.tipo}:${c.origemTipo}:${c.origemId}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Detectores
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O prazo de indicar o condutor. O detector mais importante do módulo.
 *
 * Só olha multa com `statusIndicacao` PENDENTE: indicada, aceita ou recusada
 * já saiu da fila, e prazo perdido (PERDIDO) não é mais pendência — é dano
 * consumado, e continuar alertando sobre ele é o ruído que faz o time ignorar
 * a lista inteira.
 */
async function indicarCondutor(empresaIds: string[]): Promise<Candidata[]> {
  const multas = await prisma.infracao.findMany({
    where: {
      empresaId: { in: empresaIds },
      statusIndicacao: "PENDENTE",
      prazoIndicacaoCondutor: { not: null },
    },
    select: {
      id: true,
      empresaId: true,
      numeroAIT: true,
      prazoIndicacaoCondutor: true,
      dataHoraInfracao: true,
      veiculo: { select: { placa: true } },
    },
  });

  return multas.map((m) => ({
    dominio: "FROTA",
    tipo: "INDICAR_CONDUTOR",
    origemTipo: "Infracao",
    origemId: m.id,
    empresaId: m.empresaId,
    titulo: `Indicar condutor — AIT ${m.numeroAIT} — ${formatarPlaca(m.veiculo.placa)}`,
    descricao:
      `Infração de ${formatarData(m.dataHoraInfracao)}. Sem indicar quem dirigia dentro do ` +
      `prazo, a empresa leva uma multa nova no dobro do valor, somada à original (CTB, art. 257, §§7º e 8º).`,
    venceEm: m.prazoIndicacaoCondutor!,
  }));
}

/** Defesa da autuação e recurso à JARI — prazos que, perdidos, não voltam. */
async function prazosProcessuais(empresaIds: string[]): Promise<Candidata[]> {
  const multas = await prisma.infracao.findMany({
    where: {
      empresaId: { in: empresaIds },
      statusProcessual: { in: ["AUTUADA", "PENALIZADA", "EM_DEFESA"] },
      OR: [{ prazoDefesaAutuacao: { not: null } }, { prazoRecursoJARI: { not: null } }],
    },
    select: {
      id: true,
      empresaId: true,
      numeroAIT: true,
      statusProcessual: true,
      prazoDefesaAutuacao: true,
      prazoRecursoJARI: true,
      veiculo: { select: { placa: true } },
    },
  });

  const saida: Candidata[] = [];
  for (const m of multas) {
    const placa = formatarPlaca(m.veiculo.placa);
    // Defesa prévia só faz sentido enquanto a penalidade não foi aplicada.
    if (m.prazoDefesaAutuacao && (m.statusProcessual === "AUTUADA" || m.statusProcessual === "EM_DEFESA")) {
      saida.push({
        dominio: "FROTA",
        tipo: "DEFESA_AUTUACAO",
        origemTipo: "Infracao",
        origemId: m.id,
        empresaId: m.empresaId,
        titulo: `Defesa prévia — AIT ${m.numeroAIT} — ${placa}`,
        descricao: "Prazo para apresentar defesa da autuação antes de a penalidade ser aplicada.",
        venceEm: m.prazoDefesaAutuacao,
      });
    }
    if (m.prazoRecursoJARI && m.statusProcessual === "PENALIZADA") {
      saida.push({
        dominio: "FROTA",
        tipo: "RECURSO_JARI",
        origemTipo: "Infracao",
        origemId: m.id,
        empresaId: m.empresaId,
        titulo: `Recurso à JARI — AIT ${m.numeroAIT} — ${placa}`,
        descricao: "Penalidade aplicada. Este é o prazo para recorrer à JARI.",
        venceEm: m.prazoRecursoJARI,
      });
    }
  }
  return saida;
}

// Tipo de documento → tipo de pendência (e, por consequência, peso no
// IMPACTO). Tabela em vez de ternário: documento novo que não estiver aqui cai
// em DOCUMENTO_VEICULO (peso 1) — visível e inofensivo, em vez de um ramo
// errado no meio de um encadeamento.
const TIPO_PENDENCIA_DO_DOCUMENTO: Record<string, string> = {
  LICENCIAMENTO: "LICENCIAMENTO",
  CRLV: "LICENCIAMENTO",
  IPVA: "IPVA",
  SEGURO_CASCO: "SEGURO",
  SEGURO_RCFV: "SEGURO",
};

/**
 * Documento do veículo com validade — licenciamento, IPVA, seguro, vistoria.
 *
 * Um documento por (veículo, tipo, exercício): pega sempre o de vencimento mais
 * distante dentro do mesmo tipo, porque um licenciamento antigo já substituído
 * pelo do ano seguinte não é pendência. Sem esta redução, renovar o documento
 * não apagaria o alerta — só somaria outro.
 */
async function documentosDeVeiculo(empresaIds: string[]): Promise<Candidata[]> {
  const docs = await prisma.documentoVeiculo.findMany({
    where: {
      empresaId: { in: empresaIds },
      dataVencimento: { not: null },
      veiculo: { situacao: { in: ["ATIVO", "EM_MANUTENCAO"] } },
    },
    orderBy: { dataVencimento: "desc" },
    select: {
      id: true,
      empresaId: true,
      tipo: true,
      dataVencimento: true,
      veiculoId: true,
      veiculo: { select: { placa: true, modelo: true } },
    },
  });

  const maisRecentePorChave = new Map<string, (typeof docs)[number]>();
  for (const d of docs) {
    const chave = `${d.veiculoId}:${d.tipo}`;
    if (!maisRecentePorChave.has(chave)) maisRecentePorChave.set(chave, d);
  }

  return [...maisRecentePorChave.values()].map((d) => {
    const placa = formatarPlaca(d.veiculo.placa);
    const nome = rotulo(TIPOS_DOCUMENTO_VEICULO, d.tipo);
    const tipo = TIPO_PENDENCIA_DO_DOCUMENTO[d.tipo] ?? "DOCUMENTO_VEICULO";
    return {
      dominio: "FROTA",
      tipo,
      origemTipo: "DocumentoVeiculo",
      origemId: d.id,
      empresaId: d.empresaId,
      titulo: `${nome} — ${placa}${d.veiculo.modelo ? ` (${d.veiculo.modelo})` : ""}`,
      descricao:
        tipo === "LICENCIAMENTO"
          ? "Veículo não licenciado é infração gravíssima, com remoção (CTB, art. 230, V)."
          : null,
      venceEm: d.dataVencimento!,
    };
  });
}

/** CNH e exame toxicológico do condutor. */
async function documentosDoCondutor(empresaIds: string[]): Promise<Candidata[]> {
  const condutores = await prisma.condutor.findMany({
    where: {
      empresaId: { in: empresaIds },
      statusHabilitacao: { not: "AFASTADO" },
      colaborador: { ativo: true },
    },
    select: {
      id: true,
      empresaId: true,
      cnhValidade: true,
      toxicologicoValidade: true,
      possuiEAR: true,
      colaborador: { select: { nome: true } },
    },
  });

  const saida: Candidata[] = [];
  for (const c of condutores) {
    if (c.cnhValidade) {
      saida.push({
        dominio: "FROTA",
        tipo: "CNH_VENCENDO",
        origemTipo: "Condutor",
        origemId: c.id,
        empresaId: c.empresaId,
        titulo: `CNH de ${c.colaborador.nome}`,
        descricao: "Condutor com CNH vencida não pode dirigir a serviço da empresa.",
        venceEm: c.cnhValidade,
      });
    }
    // Só quem tem EAR — o exame é exigido de quem exerce atividade remunerada.
    if (c.possuiEAR && c.toxicologicoValidade) {
      saida.push({
        dominio: "FROTA",
        tipo: "TOXICOLOGICO",
        origemTipo: "Condutor",
        origemId: c.id,
        empresaId: c.empresaId,
        titulo: `Exame toxicológico de ${c.colaborador.nome}`,
        venceEm: c.toxicologicoValidade,
      });
    }
  }
  return saida;
}

/**
 * Os dois relógios da transferência.
 *
 * A comunicação de venda só vira tarefa quando a ATPV foi IMPRESSA: assinar a
 * ATPV-e eletronicamente já vale como comunicação. Gerar a pendência nos dois
 * casos criaria uma tarefa que não existe — e o time aprende a fechar tarefa
 * sem fazer nada, que é como uma lista de pendências morre.
 */
async function transferencias(empresaIds: string[]): Promise<Candidata[]> {
  const trans = await prisma.transferenciaVeiculo.findMany({
    where: { empresaId: { in: empresaIds }, dataComunicacaoVenda: null },
    select: {
      id: true,
      empresaId: true,
      tipo: true,
      modalidadeAtpv: true,
      prazoNovoCrv: true,
      prazoComunicacaoVenda: true,
      contraparteNome: true,
      veiculo: { select: { placa: true } },
    },
  });

  const saida: Candidata[] = [];
  for (const t of trans) {
    const placa = formatarPlaca(t.veiculo.placa);
    if (t.tipo === "COMPRA" && t.prazoNovoCrv) {
      saida.push({
        dominio: "FROTA",
        tipo: "NOVO_CRV",
        origemTipo: "TransferenciaVeiculo",
        origemId: t.id,
        empresaId: t.empresaId,
        titulo: `Transferir para o nome da empresa — ${placa}`,
        descricao: "Prazo de 30 dias para expedir o novo CRV (CTB, art. 123, §1º).",
        venceEm: t.prazoNovoCrv,
      });
    }
    if (t.tipo === "VENDA" && t.modalidadeAtpv === "IMPRESSA" && t.prazoComunicacaoVenda) {
      saida.push({
        dominio: "FROTA",
        tipo: "COMUNICACAO_VENDA",
        origemTipo: "TransferenciaVeiculo",
        origemId: t.id,
        empresaId: t.empresaId,
        titulo: `Comunicar a venda — ${placa}${t.contraparteNome ? ` para ${t.contraparteNome}` : ""}`,
        descricao:
          "Sem a comunicação, a empresa responde solidariamente pelas penalidades que o " +
          "comprador gerar com o veículo (CTB, art. 134).",
        venceEm: t.prazoComunicacaoVenda,
      });
    }
  }
  return saida;
}

/**
 * Revisão programada — a manutenção que avisou a próxima data.
 *
 * Só a data vira pendência: a revisão "por km" depende de saber o km de hoje,
 * que o sistema só conhece quando alguém abastece — ela aparece na tela de
 * Manutenções como referência, não como relógio. E vale só a manutenção mais
 * recente de cada veículo: uma revisão nova substitui o aviso da anterior.
 */
async function revisoesProgramadas(empresaIds: string[]): Promise<Candidata[]> {
  const manutencoes = await prisma.manutencaoVeiculo.findMany({
    where: {
      empresaId: { in: empresaIds },
      proximaRevisaoData: { not: null },
      veiculo: { situacao: { in: ["ATIVO", "EM_MANUTENCAO"] } },
    },
    orderBy: { data: "desc" },
    select: {
      id: true,
      empresaId: true,
      veiculoId: true,
      proximaRevisaoData: true,
      veiculo: { select: { placa: true, modelo: true } },
    },
  });

  const maisRecentePorVeiculo = new Map<string, (typeof manutencoes)[number]>();
  for (const m of manutencoes) {
    if (!maisRecentePorVeiculo.has(m.veiculoId)) maisRecentePorVeiculo.set(m.veiculoId, m);
  }

  return [...maisRecentePorVeiculo.values()].map((m) => ({
    dominio: "FROTA",
    tipo: "MANUTENCAO_PROGRAMADA",
    origemTipo: "ManutencaoVeiculo",
    origemId: m.id,
    empresaId: m.empresaId,
    titulo: `Revisão programada — ${formatarPlaca(m.veiculo.placa)}${m.veiculo.modelo ? ` (${m.veiculo.modelo})` : ""}`,
    venceEm: m.proximaRevisaoData!,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Sincronização
// ─────────────────────────────────────────────────────────────────────────────

export async function detectarTudo(empresaIds: string[]): Promise<Candidata[]> {
  if (empresaIds.length === 0) return [];
  const lotes = await Promise.all([
    indicarCondutor(empresaIds),
    prazosProcessuais(empresaIds),
    documentosDeVeiculo(empresaIds),
    documentosDoCondutor(empresaIds),
    transferencias(empresaIds),
    revisoesProgramadas(empresaIds),
  ]);
  return lotes.flat();
}

/**
 * Escreve o que os detectores encontraram, e fecha o que deixou de existir.
 *
 * DISPENSADA é intocável: se o usuário dispensou com motivo, o cron não pode
 * reabrir — reabrir é como a lista volta a mentir na semana seguinte e a pessoa
 * desiste de dispensar qualquer coisa. Já o que sai da detecção (a multa foi
 * indicada, o documento foi renovado) vira RESOLVIDA sozinho: quem resolveu não
 * precisa vir aqui dizer que resolveu.
 */
export async function sincronizarPendencias(empresaIds: string[]): Promise<{
  criadas: number;
  atualizadas: number;
  resolvidas: number;
}> {
  const candidatas = await detectarTudo(empresaIds);
  const hoje = hojeUTC();

  // Os campos comparáveis vêm juntos: o update de quem NÃO mudou é pulado, e
  // em regime é quase todo mundo — sem isso, o cron diário faria uma escrita
  // por pendência só para gravar os mesmos valores.
  const existentes = await prisma.pendencia.findMany({
    where: { empresaId: { in: empresaIds }, dominio: "FROTA" },
    select: {
      id: true,
      chaveDedupe: true,
      estado: true,
      titulo: true,
      descricao: true,
      venceEm: true,
      severidade: true,
    },
  });
  const porChave = new Map(existentes.map((p) => [p.chaveDedupe, p]));

  // Dono padrão por tipo, como o CEO distribuiu os domínios por área.
  const regras = await prisma.regraAlerta.findMany({
    where: { ativa: true, OR: [{ empresaId: { in: empresaIds } }, { empresaId: null }] },
    select: { tipo: true, empresaId: true, responsavelPadraoUserId: true, responsavelPadraoNome: true },
  });
  const donoDe = (tipo: string, empresaId: string) =>
    regras.find((r) => r.tipo === tipo && r.empresaId === empresaId) ??
    regras.find((r) => r.tipo === tipo && r.empresaId === null);

  const vistas = new Set<string>();
  const paraCriar: Prisma.PendenciaCreateManyInput[] = [];
  const updates: ReturnType<typeof prisma.pendencia.update>[] = [];

  for (const c of candidatas) {
    const chave = chaveDe(c);
    vistas.add(chave);
    const dias = diferencaEmDiasUTC(c.venceEm, hoje);
    const severidade = severidadeDe(dias, c.tipo);
    const existente = porChave.get(chave);

    if (!existente) {
      const dono = donoDe(c.tipo, c.empresaId);
      paraCriar.push({
        dominio: c.dominio,
        tipo: c.tipo,
        origemTipo: c.origemTipo,
        origemId: c.origemId,
        empresaId: c.empresaId,
        titulo: c.titulo,
        descricao: c.descricao ?? null,
        responsavelId: dono?.responsavelPadraoUserId ?? null,
        responsavelNome: dono?.responsavelPadraoNome ?? null,
        venceEm: c.venceEm,
        contagem: c.contagem ?? "DIAS_CORRIDOS",
        origemLegal: c.origemLegal ?? "INTERNO",
        severidade,
        chaveDedupe: chave,
      });
      continue;
    }

    // A condição VOLTOU depois de resolvida? Reabre. Sem isto, um veículo
    // marcado VENDIDO por engano (pendências auto-resolvidas) e corrigido de
    // volta deixaria o licenciamento vencido invisível PARA SEMPRE — a tela só
    // lista ABERTA/EM_ANDAMENTO, e o dedupe reencontraria a linha morta a cada
    // rodada sem nunca tocá-la de volta à vida.
    //
    // DISPENSADA fica dispensada: foi uma pessoa, com motivo escrito. Reabrir
    // por cima é como o cron ensina o usuário a não dispensar nunca mais. (É
    // uma divergência DELIBERADA do motor de Sinais, onde descarte expira em
    // 60 dias: lá o detector é estatístico e a situação muda; aqui a dispensa
    // é sobre UM registro concreto — a multa X, o documento Y — e quem
    // dispensou sabia do prazo.)
    const reabrir = existente.estado === "RESOLVIDA";
    const mudou =
      reabrir ||
      existente.titulo !== c.titulo ||
      (existente.descricao ?? null) !== (c.descricao ?? null) ||
      existente.venceEm.getTime() !== c.venceEm.getTime() ||
      existente.severidade !== severidade;
    if (!mudou) continue;

    updates.push(
      prisma.pendencia.update({
        where: { id: existente.id },
        data: {
          titulo: c.titulo,
          descricao: c.descricao ?? null,
          venceEm: c.venceEm,
          severidade,
          confirmadaEm: new Date(),
          ...(reabrir
            ? { estado: "ABERTA", resolvidaEm: null, resolvidaPorId: null, resolvidaPorNome: null }
            : {}),
        },
      }),
    );
  }

  // Uma ida ao banco para todas as criações, uma transação para os updates que
  // sobraram. O laço anterior fazia um round-trip POR pendência — com 200
  // documentos numa frota média, eram 200 escritas sequenciais no Neon para,
  // em regime, não mudar nada.
  if (paraCriar.length > 0) await prisma.pendencia.createMany({ data: paraCriar });
  if (updates.length > 0) await prisma.$transaction(updates);
  const criadas = paraCriar.length;
  const atualizadas = updates.length;

  // O que sumiu da detecção: a condição deixou de existir.
  const paraResolver = existentes.filter(
    (p) => !vistas.has(p.chaveDedupe) && (p.estado === "ABERTA" || p.estado === "EM_ANDAMENTO"),
  );
  if (paraResolver.length > 0) {
    await prisma.pendencia.updateMany({
      where: { id: { in: paraResolver.map((p) => p.id) } },
      data: { estado: "RESOLVIDA", resolvidaEm: new Date(), resolvidaPorNome: "Resolvida automaticamente" },
    });
  }

  return { criadas, atualizadas, resolvidas: paraResolver.length };
}
