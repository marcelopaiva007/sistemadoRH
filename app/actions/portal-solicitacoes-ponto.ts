"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { resolverIdentidadeDePonto } from "@/lib/ponto-identidade";
import { registrarAuditoria } from "@/lib/audit";
import { dataDoFormulario, dataUTC, diaBrasilia, formatarData } from "@/lib/datas";
import {
  TIPOS_MARCACAO_VALIDOS,
  tipoMarcacaoLabel,
} from "@/lib/constants-ponto";
import type { ActionResult } from "@/lib/constants";

// Solicitações de ponto abertas pelo PRÓPRIO colaborador (21/08/2026):
// ajuste de marcação (não conseguiu bater — celular, internet, GPS, fila) e
// abono em dia de folga. NADA aqui altera batida ou apuração: o pedido nasce
// TratamentoPonto PENDENTE com origem COLABORADOR e quem decide é o RH, na
// aba Tratamento (PTRP) ou na Central de Aprovações — mesma fila, mesma
// auditoria, mesma contagem na área de Pendências.
//
// A identidade vem de resolverIdentidadeDePonto, nunca de parâmetro: server
// action é endpoint POST público, e o resolver é o único lugar que aceita as
// duas sessões (portal Telegram e PIN do app /ponto).

// Freio anti-duplo-toque e anti-fila-entupida, mesmo papel do MAXIMO_ABERTAS
// de portal-mensagens.ts: com 5 pedidos ainda sem decisão, o sexto espera.
const MAXIMO_PENDENTES = 5;
const MAXIMO_MOTIVO = 1000;
// Pedido de coisa velha demais é conversa para o RH, não formulário: 60 dias
// cobre o fechamento de duas folhas.
const MAXIMO_DIAS_ATRAS = 60;
const REGEX_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

type Solicitante = {
  id: string;
  nome: string;
  empresaId: string;
};

// Valida sessão + colaborador ativo e devolve quem pede — ou a recusa pronta.
async function solicitanteDaSessao(): Promise<
  { ok: true; colaborador: Solicitante } | { ok: false; error: string }
> {
  const identidade = await resolverIdentidadeDePonto();
  if (!identidade) {
    return { ok: false, error: "Sessão inválida ou expirada. Entre de novo e tente outra vez." };
  }
  const colaborador = await prisma.colaborador.findUnique({
    where: { id: identidade.colaboradorId },
    select: { id: true, nome: true, empresaId: true, ativo: true },
  });
  if (!colaborador || !colaborador.ativo) {
    return { ok: false, error: "Cadastro não encontrado. Fale com o RH." };
  }
  return { ok: true, colaborador };
}

// "Hoje" pelo relógio de BRASÍLIA, devolvido como data de calendário
// (meia-noite UTC) — o mesmo formato que dataDoFormulario() devolve para a data
// digitada, para as comparações abaixo serem dia contra dia.
//
// POR QUE NÃO hojeUTC(): na Vercel o processo roda em UTC, e das 21h às 23h59 de
// Brasília o dia UTC já é o SEGUINTE. Nessa janela hojeUTC() deixava o
// colaborador pedir ajuste para AMANHÃ, e o limite de 60 dias para trás andava
// um dia junto. hojeUTC() continua correta nos demais usos do repo (data de
// calendário do banco contra data de calendário); o defeito é aqui, onde o
// "hoje" nasce do relógio do servidor.
//
// O parâmetro `agora` existe só para o teste conseguir fixar o instante.
function hojeEmBrasilia(agora: Date = new Date()): Date {
  const [ano, mes, dia] = diaBrasilia(agora).split("-").map(Number);
  return dataUTC(ano, mes, dia);
}

// Data do pedido: nem no futuro (a ocorrência já aconteceu), nem velha demais.
function validarDataDoPedido(dataTexto: string): { ok: true; data: Date } | { ok: false; error: string } {
  const data = dataDoFormulario(dataTexto);
  if (!data) return { ok: false, error: "Informe a data da ocorrência." };
  const hoje = hojeEmBrasilia();
  if (data.getTime() > hoje.getTime()) {
    return { ok: false, error: "A data não pode estar no futuro." };
  }
  if (hoje.getTime() - data.getTime() > MAXIMO_DIAS_ATRAS * 24 * 60 * 60 * 1000) {
    return {
      ok: false,
      error: `Só é possível pedir por aqui ocorrências dos últimos ${MAXIMO_DIAS_ATRAS} dias. Para algo mais antigo, fale direto com o RH.`,
    };
  }
  return { ok: true, data };
}

function validarMotivo(motivoBruto: string): { ok: true; motivo: string } | { ok: false; error: string } {
  const motivo = String(motivoBruto ?? "").trim().slice(0, MAXIMO_MOTIVO);
  if (motivo.length < 5) {
    return { ok: false, error: "Escreva a justificativa (mínimo 5 caracteres) — é ela que o RH vai analisar." };
  }
  return { ok: true, motivo };
}

async function pendentesNoLimite(colaboradorId: string): Promise<boolean> {
  const pendentes = await prisma.tratamentoPonto.count({
    where: { colaboradorId, origem: "COLABORADOR", status: "PENDENTE" },
  });
  return pendentes >= MAXIMO_PENDENTES;
}

export type SolicitarAjustePontoInput = {
  data: string; // "AAAA-MM-DD" do <input type="date">
  tipoMarcacao: string; // ENTRADA_1 | SAIDA_1 | ENTRADA_2 | SAIDA_2
  hora: string; // "HH:mm" que deveria ter sido registrado
  motivo: string;
};

/**
 * Pedido de ajuste de marcação: "deveria ter registrado a {marcação} de
 * {data} às {hora}, e não consegui porque {motivo}".
 */
export async function solicitarAjustePonto(input: SolicitarAjustePontoInput): Promise<ActionResult> {
  const sessao = await solicitanteDaSessao();
  if (!sessao.ok) return sessao;
  const { colaborador } = sessao;

  const dataRes = validarDataDoPedido(input.data);
  if (!dataRes.ok) return dataRes;
  const motivoRes = validarMotivo(input.motivo);
  if (!motivoRes.ok) return motivoRes;

  if (!TIPOS_MARCACAO_VALIDOS.has(input.tipoMarcacao)) {
    return { ok: false, error: "Escolha qual marcação deveria ter sido registrada." };
  }
  const hora = String(input.hora ?? "").trim();
  if (!REGEX_HORA.test(hora)) {
    return { ok: false, error: "Informe o horário no formato HH:MM (ex.: 08:02)." };
  }

  if (await pendentesNoLimite(colaborador.id)) {
    return {
      ok: false,
      error: "Você já tem pedidos aguardando análise do RH. Assim que forem decididos, dá para enviar outro.",
    };
  }

  const tratamento = await prisma.tratamentoPonto.create({
    data: {
      empresaId: colaborador.empresaId,
      colaboradorId: colaborador.id,
      dataFato: dataRes.data,
      tipo: "INCLUSAO_MANUAL",
      tipoMarcacao: input.tipoMarcacao,
      horaSolicitada: hora,
      motivo: motivoRes.motivo,
      origem: "COLABORADOR",
      status: "PENDENTE",
    },
  });

  await registrarAuditoria({
    empresaId: colaborador.empresaId,
    acao: "CRIAR",
    entidade: "TratamentoPonto",
    entidadeId: tratamento.id,
    resumo: `Pedido de ajuste de ponto aberto por ${colaborador.nome}: ${tipoMarcacaoLabel(input.tipoMarcacao)} de ${formatarData(dataRes.data)} às ${hora}.`,
    detalhes: { tipo: "INCLUSAO_MANUAL", origem: "COLABORADOR", tipoMarcacao: input.tipoMarcacao, horaSolicitada: hora },
    ator: { id: colaborador.id, nome: colaborador.nome, papel: "COLABORADOR" },
  });

  revalidatePath("/portal");
  revalidatePath("/ponto");
  revalidatePath(`/rh/${colaborador.empresaId}/ponto`);
  revalidatePath(`/rh/${colaborador.empresaId}/aprovacoes`);
  return { ok: true };
}

export type SolicitarAbonoFolgaInput = {
  data: string; // "AAAA-MM-DD"
  motivo: string;
};

/**
 * Pedido de abono em dia de folga: o colaborador estava de folga e precisa
 * justificar/regularizar alguma situação do ponto daquele dia.
 *
 * A data NÃO é validada contra a escala de propósito: metade das empresas não
 * tem EscalaTurno preenchida, e recusar o pedido por falta de escala deixaria
 * a pessoa sem canal. Quem confere se o dia era mesmo folga é o RH, que tem a
 * escala (quando existe) na tela ao lado — mesma régua do resto do sistema.
 */
export async function solicitarAbonoFolga(input: SolicitarAbonoFolgaInput): Promise<ActionResult> {
  const sessao = await solicitanteDaSessao();
  if (!sessao.ok) return sessao;
  const { colaborador } = sessao;

  const dataRes = validarDataDoPedido(input.data);
  if (!dataRes.ok) return dataRes;
  const motivoRes = validarMotivo(input.motivo);
  if (!motivoRes.ok) return motivoRes;

  if (await pendentesNoLimite(colaborador.id)) {
    return {
      ok: false,
      error: "Você já tem pedidos aguardando análise do RH. Assim que forem decididos, dá para enviar outro.",
    };
  }

  const tratamento = await prisma.tratamentoPonto.create({
    data: {
      empresaId: colaborador.empresaId,
      colaboradorId: colaborador.id,
      dataFato: dataRes.data,
      tipo: "ABONO_FOLGA",
      motivo: motivoRes.motivo,
      origem: "COLABORADOR",
      status: "PENDENTE",
    },
  });

  await registrarAuditoria({
    empresaId: colaborador.empresaId,
    acao: "CRIAR",
    entidade: "TratamentoPonto",
    entidadeId: tratamento.id,
    resumo: `Pedido de abono em dia de folga aberto por ${colaborador.nome} para ${formatarData(dataRes.data)}.`,
    detalhes: { tipo: "ABONO_FOLGA", origem: "COLABORADOR" },
    ator: { id: colaborador.id, nome: colaborador.nome, papel: "COLABORADOR" },
  });

  revalidatePath("/portal");
  revalidatePath("/ponto");
  revalidatePath(`/rh/${colaborador.empresaId}/ponto`);
  revalidatePath(`/rh/${colaborador.empresaId}/aprovacoes`);
  return { ok: true };
}

export type MinhaSolicitacaoPonto = {
  id: string;
  tipo: string;
  dataFato: string; // ISO — formatada na tela
  tipoMarcacao: string | null;
  horaSolicitada: string | null;
  motivo: string;
  status: string;
  motivoDecisao: string | null;
  criadaEm: string; // ISO
};

/** As últimas solicitações do próprio colaborador, para acompanhar o status. */
export async function minhasSolicitacoesPonto(): Promise<MinhaSolicitacaoPonto[]> {
  const identidade = await resolverIdentidadeDePonto();
  if (!identidade) return [];

  const linhas = await prisma.tratamentoPonto.findMany({
    where: { colaboradorId: identidade.colaboradorId, origem: "COLABORADOR" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      tipo: true,
      dataFato: true,
      tipoMarcacao: true,
      horaSolicitada: true,
      motivo: true,
      status: true,
      motivoDecisao: true,
      createdAt: true,
    },
  });

  return linhas.map((l) => ({
    id: l.id,
    tipo: l.tipo,
    dataFato: l.dataFato.toISOString(),
    tipoMarcacao: l.tipoMarcacao,
    horaSolicitada: l.horaSolicitada,
    motivo: l.motivo,
    status: l.status,
    motivoDecisao: l.motivoDecisao,
    criadaEm: l.createdAt.toISOString(),
  }));
}
