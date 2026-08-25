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

/**
 * Os domínios que ESTES detectores cobrem.
 *
 * A varredura de auto-resolve compara o que existe no banco com o que foi
 * detectado agora — e só pode olhar para os domínios que ela mesma detecta. Um
 * domínio de fora da lista (pendência criada à mão, ou um motor futuro) seria
 * lido como "não detectado" e fechado sozinho na primeira rodada.
 */
export const DOMINIOS_DETECTADOS: string[] = ["FROTA", "CONTRATOS", "ALUGUEIS"];

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
  /**
   * Dono que vem DO PRÓPRIO REGISTRO (o gestor do contrato), quando existe.
   * Tem precedência sobre a RegraAlerta: quem responde por aquele contrato é
   * mais específico que o padrão por tipo. Sem isto, o campo "Gestor
   * responsável" era coletado, congelado na linha e nunca usado — as
   * pendências caíam todas em "Sem responsável".
   */
  responsavelId?: string | null;
  responsavelNome?: string | null;
  /**
   * Identifica a OCORRÊNCIA dentro de um registro que gera o mesmo alerta mais
   * de uma vez (reajuste anual, janela de renovação a cada termo). Entra na
   * chave de dedupe para que uma dispensa valha só para aquele ciclo.
   */
  ciclo?: string;
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

  // Contratos. A renovatória é o único prazo do módulo que mata um DIREITO por
  // decadência — passou, não volta, e nem negociação em curso suspende (Lei
  // 8.245/1991, art. 51, §5º). Perder a janela de denúncia custa mais um ciclo
  // inteiro de aluguel; perder o reajuste custa a diferença do índice, que é
  // recuperável na negociação seguinte.
  ACAO_RENOVATORIA: 3,
  DENUNCIA_CONTRATO: 3,
  REAJUSTE_CONTRATO: 1,

  // Aluguel a receber em atraso: é dinheiro que devia ter entrado e não
  // entrou. Peso 2 — a empresa perde liquidez, mas não um direito nem um prazo
  // legal (a cobrança em si é onda 2).
  ALUGUEL_ATRASADO: 2,
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

/**
 * Identidade da ocorrência — é por ela que o cron reencontra a linha.
 *
 * O `ciclo` existe para o alerta que VOLTA no mesmo registro: reajuste anual,
 * janela de renovação a cada termo. Sem ele, a chave é uma só para sempre, e
 * dispensar o reajuste de 2027 (dispensa é definitiva, de propósito) silencia
 * também 2028, 2029… do mesmo contrato — um alerta anual desligado para
 * sempre por uma decisão que valia para um ano.
 *
 * Só os detectores de contrato preenchem `ciclo`. Os de frota não, e não podem
 * passar a preencher: a chave deles já está gravada em produção, e mudá-la
 * faria toda pendência existente ser lida como "não detectada" — resolvida
 * sozinha na primeira rodada, e recriada em seguida sem dono nem histórico.
 */
export function chaveDe(c: Candidata): string {
  const base = `${c.tipo}:${c.origemTipo}:${c.origemId}`;
  return c.ciclo ? `${base}:${c.ciclo}` : base;
}

/** O ciclo a que um prazo pertence — ano e mês da data-alvo. */
function cicloDe(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
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

/**
 * Os status em que um contrato ainda tem prazo correndo.
 *
 * RASCUNHO não tem (ainda não é contrato); ENCERRADO e CANCELADO não têm mais.
 * SUSPENSO TEM: suspender a execução não suspende prazo legal nenhum — e era
 * exatamente esse o buraco. Como `acaoRenovatoria` só olhava VIGENTE e
 * EM_RENOVACAO, marcar o contrato como "Suspenso" durante uma negociação
 * fazia o auto-resolve fechar sozinho o prazo decadencial da renovatória,
 * silenciosamente, contra o que a própria função existe para garantir
 * (Lei 8.245/1991, art. 51, §5º — não se suspende, não se interrompe).
 *
 * Uma constante só para os três detectores: a primeira versão usava
 * `["VIGENTE","EM_RENOVACAO"]` em dois e `"VIGENTE"` no terceiro, e a
 * assimetria fazia a pendência de reajuste desaparecer quando alguém mudava o
 * status para "Em renovação" — o estado mais natural de um contrato perto do
 * fim.
 */
export const STATUS_COM_PRAZO_CORRENDO = ["VIGENTE", "EM_RENOVACAO", "SUSPENSO"];

/**
 * A janela para dizer que o contrato NÃO será renovado.
 *
 * Só existe quando o contrato tem aviso prévio escrito — sem cláusula, não há
 * data-limite, e inventar uma (o fim do contrato, por exemplo) faria a Central
 * cobrar uma decisão que ninguém precisa tomar naquele dia.
 *
 * Passar desta data com renovação automática ligada é o caso caro: o contrato
 * se renova sozinho por mais um ciclo inteiro, e aí só sai pagando multa.
 */
async function denunciaDeContrato(empresaIds: string[]): Promise<Candidata[]> {
  const contratos = await prisma.contrato.findMany({
    where: {
      empresaId: { in: empresaIds },
      status: { in: STATUS_COM_PRAZO_CORRENDO },
      dataLimiteDenuncia: { not: null },
    },
    select: {
      id: true,
      empresaId: true,
      numero: true,
      titulo: true,
      dataFim: true,
      dataLimiteDenuncia: true,
      renovacaoAutomatica: true,
      gestorId: true,
      gestorNome: true,
      contraparte: { select: { razaoSocial: true } },
    },
  });

  return contratos.map((c) => ({
    dominio: "CONTRATOS",
    tipo: "DENUNCIA_CONTRATO",
    origemTipo: "Contrato",
    origemId: c.id,
    empresaId: c.empresaId,
    titulo: `Decidir renovação — ${c.numero} · ${c.contraparte.razaoSocial}`,
    descricao: c.renovacaoAutomatica
      ? `${c.titulo}. Vigência até ${formatarData(c.dataFim)}, com renovação automática LIGADA: ` +
        `passado este prazo, o contrato se renova sozinho por mais um ciclo, e sair depois custa multa.`
      : `${c.titulo}. Vigência até ${formatarData(c.dataFim)}. Último dia para comunicar que o ` +
        `contrato não será renovado.`,
    venceEm: c.dataLimiteDenuncia!,
    ciclo: cicloDe(c.dataLimiteDenuncia!),
    responsavelId: c.gestorId,
    responsavelNome: c.gestorNome,
  }));
}

/**
 * A ação renovatória da locação não residencial — Lei 8.245/1991, art. 51, §5º.
 *
 * O alerta é a data de FECHAMENTO da janela (6 meses antes do fim), não a de
 * abertura: é ela que decai. Avisar na abertura e calar depois seria avisar
 * cedo demais para virar tarefa e tarde demais para virar urgência.
 *
 * Nada aqui suspende esse prazo. Negociação amigável em andamento, promessa
 * verbal do locador, feriado — a decadência corre igual, e é por isso que este
 * detector não olha o status da negociação.
 */
async function acaoRenovatoria(empresaIds: string[]): Promise<Candidata[]> {
  const contratos = await prisma.contrato.findMany({
    where: {
      empresaId: { in: empresaIds },
      status: { in: STATUS_COM_PRAZO_CORRENDO },
      locacaoNaoResidencial: true,
      janelaRenovatoriaFim: { not: null },
    },
    select: {
      id: true,
      empresaId: true,
      numero: true,
      titulo: true,
      janelaRenovatoriaInicio: true,
      janelaRenovatoriaFim: true,
      gestorId: true,
      gestorNome: true,
      contraparte: { select: { razaoSocial: true } },
    },
  });

  return contratos.map((c) => ({
    dominio: "CONTRATOS",
    tipo: "ACAO_RENOVATORIA",
    origemTipo: "Contrato",
    origemId: c.id,
    empresaId: c.empresaId,
    titulo: `Ação renovatória — ${c.numero} · ${c.contraparte.razaoSocial}`,
    descricao:
      `${c.titulo}. A janela para ajuizar a renovatória abriu em ` +
      `${formatarData(c.janelaRenovatoriaInicio)} e fecha nesta data. Perdida, o direito à ` +
      `renovação decai — não se suspende nem se interrompe (Lei 8.245/1991, art. 51, §5º).`,
    venceEm: c.janelaRenovatoriaFim!,
    ciclo: cicloDe(c.janelaRenovatoriaFim!),
    origemLegal: "JUDICIAL",
    responsavelId: c.gestorId,
    responsavelNome: c.gestorNome,
  }));
}

/**
 * O reajuste que já pode ser pedido.
 *
 * Peso 1 de propósito: reajuste não aplicado no mês é diferença de índice, e a
 * diferença se negocia no ciclo seguinte. Tratá-lo como os outros dois faria a
 * Central ficar cheia de item anual de rotina — e é assim que a lista deixa de
 * ser lida.
 */
async function reajustesDevidos(empresaIds: string[]): Promise<Candidata[]> {
  const contratos = await prisma.contrato.findMany({
    where: {
      empresaId: { in: empresaIds },
      status: { in: STATUS_COM_PRAZO_CORRENDO },
      proximoReajuste: { not: null },
      // `not` sozinho DESCARTARIA o contrato de índice em branco: em SQL,
      // NULL <> 'SEM_REAJUSTE' é NULL, não verdadeiro. O que importa aqui é a
      // data; quem não escolheu índice ainda precisa ser lembrado do mês-base.
      OR: [{ indiceReajuste: null }, { indiceReajuste: { not: "SEM_REAJUSTE" } }],
    },
    select: {
      id: true,
      empresaId: true,
      numero: true,
      titulo: true,
      indiceReajuste: true,
      proximoReajuste: true,
      gestorId: true,
      gestorNome: true,
      contraparte: { select: { razaoSocial: true } },
    },
  });

  return contratos.map((c) => ({
    dominio: "CONTRATOS",
    tipo: "REAJUSTE_CONTRATO",
    origemTipo: "Contrato",
    origemId: c.id,
    empresaId: c.empresaId,
    titulo: `Reajuste ${c.indiceReajuste ?? ""} — ${c.numero} · ${c.contraparte.razaoSocial}`.trim(),
    descricao: `${c.titulo}. Mês-base do reajuste contratado.`,
    venceEm: c.proximoReajuste!,
    ciclo: cicloDe(c.proximoReajuste!),
    responsavelId: c.gestorId,
    responsavelNome: c.gestorNome,
  }));
}

/**
 * Aluguel a receber em atraso — uma pendência por CONTRATO, não por parcela.
 *
 * Se três meses estão em aberto, o time precisa de UMA linha ("aluguel do
 * contrato X em atraso desde mar/2026"), não de três. A pendência aponta a
 * parcela vencida mais ANTIGA (a que dói há mais tempo); resolver a fila é
 * receber a partir dela. Quando a última em atraso é recebida, o detector para
 * de achar e a pendência se fecha sozinha.
 */
async function alugueisEmAtraso(empresaIds: string[]): Promise<Candidata[]> {
  const hoje = hojeUTC();
  const atrasadas = await prisma.recebimentoAluguel.findMany({
    where: { empresaId: { in: empresaIds }, recebidoEm: null, vencimento: { lt: hoje } },
    orderBy: { vencimento: "asc" },
    select: {
      empresaId: true,
      vencimento: true,
      valorPrevisto: true,
      contratoId: true,
      contrato: { select: { numero: true, titulo: true, contraparte: { select: { razaoSocial: true } } } },
    },
  });

  // A mais antiga de cada contrato (a lista já vem por vencimento asc).
  const maisAntigaPorContrato = new Map<string, (typeof atrasadas)[number]>();
  const totalPorContrato = new Map<string, number>();
  for (const a of atrasadas) {
    if (!maisAntigaPorContrato.has(a.contratoId)) maisAntigaPorContrato.set(a.contratoId, a);
    totalPorContrato.set(a.contratoId, (totalPorContrato.get(a.contratoId) ?? 0) + 1);
  }

  return [...maisAntigaPorContrato.values()].map((a) => {
    const qtd = totalPorContrato.get(a.contratoId) ?? 1;
    return {
      dominio: "ALUGUEIS",
      tipo: "ALUGUEL_ATRASADO",
      origemTipo: "Contrato",
      origemId: a.contratoId,
      empresaId: a.empresaId,
      titulo: `Aluguel a receber — ${a.contrato.numero} · ${a.contrato.contraparte.razaoSocial}`,
      descricao:
        `${a.contrato.titulo}. ${qtd} parcela(s) em aberto, a mais antiga vencida em ` +
        `${formatarData(a.vencimento)}.`,
      venceEm: a.vencimento,
    };
  });
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
    denunciaDeContrato(empresaIds),
    acaoRenovatoria(empresaIds),
    reajustesDevidos(empresaIds),
    alugueisEmAtraso(empresaIds),
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
    where: { empresaId: { in: empresaIds }, dominio: { in: DOMINIOS_DETECTADOS } },
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
      const padrao = donoDe(c.tipo, c.empresaId);
      const dono = c.responsavelId
        ? { responsavelPadraoUserId: c.responsavelId, responsavelPadraoNome: c.responsavelNome ?? null }
        : padrao;
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
