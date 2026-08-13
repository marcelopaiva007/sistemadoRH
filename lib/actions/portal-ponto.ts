"use server";

import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/audit";
import { lerSessaoPortal } from "@/lib/portal-auth";

async function calcularHorasTrabalhadas(
  colaboradorId: string,
  dataInicio: Date,
  dataFim: Date
) {
  const pontos = await prisma.ponto.findMany({
    where: {
      colaboradorId,
      dataHora: { gte: dataInicio, lt: dataFim },
    },
    orderBy: { dataHora: "asc" },
  });

  let horasTotais = 0;
  let entradaPendente: typeof pontos[0] | null = null;

  for (const ponto of pontos) {
    if (ponto.tipo === "ENTRADA") {
      entradaPendente = ponto;
    } else if (ponto.tipo === "SAÍDA" && entradaPendente) {
      const diffMs = ponto.dataHora.getTime() - entradaPendente.dataHora.getTime();
      horasTotais += diffMs / (1000 * 60 * 60);
      entradaPendente = null;
    }
  }

  return horasTotais;
}

function obterSegundaFeira(data: Date): Date {
  const segunda = new Date(data);
  const dia = segunda.getUTCDay();
  const diff = segunda.getUTCDate() - dia + (dia === 0 ? -6 : 1);
  segunda.setUTCDate(diff);
  segunda.setUTCHours(0, 0, 0, 0);
  return segunda;
}

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
      tipoContrato: true,
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

  // Validação de horário para estágiarios (5h/dia, 30h/semana)
  if (colaborador.tipoContrato === "ESTAGIO" && input.tipo === "SAÍDA") {
    // Calcular horas do dia (entrada até agora)
    const entradaHoje = await prisma.ponto.findFirst({
      where: {
        colaboradorId: colaborador.id,
        tipo: "ENTRADA",
        dataHora: {
          gte: hoje,
          lt: amanhã,
        },
      },
      orderBy: { dataHora: "asc" },
    });

    if (entradaHoje) {
      const horasHoje =
        (new Date().getTime() - entradaHoje.dataHora.getTime()) /
        (1000 * 60 * 60);
      if (horasHoje > 5) {
        return {
          ok: false,
          error: `Estágiário não pode trabalhar mais de 5 horas por dia (já tem ${horasHoje.toFixed(1)}h)`,
        };
      }

      // Calcular horas da semana
      const segundaFeira = obterSegundaFeira(hoje);
      const proximaSegunda = new Date(segundaFeira);
      proximaSegunda.setDate(proximaSegunda.getDate() + 7);

      const horasSemana = await calcularHorasTrabalhadas(
        colaborador.id,
        segundaFeira,
        proximaSegunda
      );

      const horasComSaida = horasSemana + horasHoje;
      if (horasComSaida > 30) {
        return {
          ok: false,
          error: `Estágiário não pode trabalhar mais de 30 horas por semana (já tem ${horasSemana.toFixed(1)}h, com hoje seriam ${horasComSaida.toFixed(1)}h)`,
        };
      }
    }
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
