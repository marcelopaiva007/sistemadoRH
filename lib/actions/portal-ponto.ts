"use server";

import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/audit";
import { lerSessaoPortal } from "@/lib/portal-auth";

export type RegistroPontoInput = {
  tipo: "ENTRADA" | "SAÍDA";
  selfieBase64: string;
  latitude: number;
  longitude: number;
  localizacao?: string;
  observacao?: string;
};

export async function registrarPonto(input: RegistroPontoInput) {
  const sessao = await lerSessaoPortal();
  if (!sessao?.verificado) {
    return { ok: false, error: "Sessão inválida" };
  }

  const colaborador = await prisma.colaborador.findUnique({
    where: { id: sessao.colaboradorId },
    select: {
      id: true,
      nome: true,
      empresaId: true,
      setor: { select: { nome: true } },
    },
  });

  if (!colaborador) {
    return { ok: false, error: "Colaborador não encontrado" };
  }

  // Buscar a escala do colaborador para hoje
  const hoje = new Date();
  hoje.setUTCHours(0, 0, 0, 0);
  const amanhã = new Date(hoje);
  amanhã.setDate(amanhã.getDate() + 1);

  // TODO: buscar escala e validar janela de horário
  // const escalaDia = await prisma.escalaTurno.findUnique({
  //   where: {
  //     colaboradorId_data: {
  //       colaboradorId: colaborador.id,
  //       data: hoje,
  //     },
  //   },
  //   select: {
  //     turno: true,
  //   },
  // });

  // const config = await prisma.configuracaoPonto.findUnique({
  //   where: { empresaId: colaborador.empresaId },
  // });

  // const minutosAntecipacao = config?.minutosAntecipacao ?? 60;
  // const minutosTolerancia = config?.minutosTolerancia ?? 60;

  // Validar se está dentro da janela esperada
  let dentroJanela = true;
  const turnoEsperado: string | null = null;
  const horarioEsperadoInicio: Date | null = null;
  const horarioEsperadoFim: Date | null = null;

  // Validação de janela: por enquanto sempre true (sem parsing de horários de turno)
  // TODO: integrar com CatalogoItem para extrair horários de início/fim do turno
  dentroJanela = true;

  // Verificar se já existe ponto desse tipo hoje
  const pontoExistente = await prisma.ponto.findFirst({
    where: {
      colaboradorId: colaborador.id,
      tipo: input.tipo,
      dataHora: {
        gte: hoje,
        lt: amanhã,
      },
    },
  });

  if (pontoExistente) {
    return {
      ok: false,
      error: `${input.tipo === "ENTRADA" ? "Entrada" : "Saída"} já registrada hoje`,
    };
  }

  // Registrar o ponto
  const ponto = await prisma.ponto.create({
    data: {
      empresaId: colaborador.empresaId,
      colaboradorId: colaborador.id,
      tipo: input.tipo,
      dataHora: new Date(),
      selfieBase64: input.selfieBase64,
      latitude: input.latitude,
      longitude: input.longitude,
      localizacao: input.localizacao,
      observacao: input.observacao,
      dentro_janela: dentroJanela,
      turnoEsperado,
      horarioEsperadoInicio,
      horarioEsperadoFim,
    },
  });

  // Registrar na auditoria
  await registrarAuditoria({
    empresaId: colaborador.empresaId,
    acao: "CRIAR",
    entidade: "Ponto",
    entidadeId: ponto.id,
    resumo: `${input.tipo === "ENTRADA" ? "Entrada" : "Saída"} registrada`,
    ator: {
      id: colaborador.id,
      nome: colaborador.nome,
      papel: "COLABORADOR",
    },
  });

  return {
    ok: true,
    ponto,
  };
}


export async function listarPontosColaborador() {
  const sessao = await lerSessaoPortal();
  if (!sessao?.verificado) {
    return { ok: false, error: "Sessão inválida", pontos: [] };
  }

  const pontos = await prisma.ponto.findMany({
    where: { colaboradorId: sessao.colaboradorId },
    orderBy: { dataHora: "desc" },
    take: 30,
  });

  return { ok: true, pontos };
}
