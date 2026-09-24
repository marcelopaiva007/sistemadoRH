"use server";

import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { marcacoesDaJornada } from "@/lib/ponto-jornada";
import { eachDayOfInterval, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { zonedTimeToUtc, utcToZonedTime } from "date-fns-tz";

const TIMEZONE = "America/Sao_Paulo";

/** Retorna o primeiro e último dia do mês em UTC com fuso Brasília */
function periodoDoMesEmUTC(mes: Date) {
  const inicio = startOfMonth(mes);
  const fim = endOfMonth(mes);

  const inicioUTC = zonedTimeToUtc(startOfDay(inicio), TIMEZONE);
  const fimUTC = zonedTimeToUtc(endOfDay(fim), TIMEZONE);

  return { inicio: inicioUTC, fim: fimUTC };
}

export interface DadosIndicadoresRH {
  totalColaboradores: number;
  presentes: number;
  ausentes: number;
  atrasos: number;
  saidasAntecipadas: number;
  horaMediaTrabalhada: number;
  horasExtrasTotais: number;
}

/** Dashboard de indicadores gerais da empresa no mês */
export async function obterIndicadoresRH(
  empresaId: string,
  mes: Date = new Date(),
): Promise<DadosIndicadoresRH | { erro: string }> {
  await requireEmpresaAccess(empresaId);

  try {
    const { inicio, fim } = periodoDoMesEmUTC(mes);

    // Total de colaboradores ativos
    const totalColaboradores = await prisma.colaborador.count({
      where: { empresaId, ativo: true },
    });

    // Colaboradores com marcação no mês
    const colaboradoresComMarcacao = await prisma.registroPonto.findMany({
      where: {
        empresaId,
        dataHora: { gte: inicio, lte: fim },
      },
      distinct: ["colaboradorId"],
      select: { colaboradorId: true },
    });

    const colaboradoresComMarcacaoSet = new Set(colaboradoresComMarcacao.map((c) => c.colaboradorId));
    const presentes = colaboradoresComMarcacaoSet.size;
    const ausentes = totalColaboradores - presentes;

    // Marcações do mês (incluindo tratadas)
    const marcacoes = await marcacoesDaJornada(prisma, {
      empresaId,
      de: inicio,
      ate: fim,
    });

    // Contar atrasos (entrada após horário esperado)
    let atrasos = 0;
    let saidasAntecipadas = 0;
    let totalMinutosTrabalhados = 0;
    let diasComTrabalhosContados = 0;

    const marcacoesPorColaboradorDia = new Map<string, string[]>();
    for (const m of marcacoes) {
      const chave = `${m.colaboradorId}-${m.dataHora.toDateString()}`;
      const tipos = marcacoesPorColaboradorDia.get(chave) ?? [];
      tipos.push(m.tipo);
      marcacoesPorColaboradorDia.set(chave, tipos);
    }

    // Simples heurística: se tem ENTRADA_1 muito depois do esperado (~08:00) = atraso
    // Se tem SAIDA_2 muito antes do esperado (~18:00) = saída antecipada
    for (const m of marcacoes) {
      if (m.tipo === "ENTRADA_1") {
        const hora = utcToZonedTime(m.dataHora, TIMEZONE).getHours();
        const minutos = utcToZonedTime(m.dataHora, TIMEZONE).getMinutes();
        if (hora > 8 || (hora === 8 && minutos > 10)) {
          atrasos++;
        }
      }

      if (m.tipo === "SAIDA_2") {
        const hora = utcToZonedTime(m.dataHora, TIMEZONE).getHours();
        const minutos = utcToZonedTime(m.dataHora, TIMEZONE).getMinutes();
        if (hora < 18 || (hora === 18 && minutos < -10)) {
          saidasAntecipadas++;
        }
      }
    }

    // Calcular horas trabalhadas
    const diasDoMes = eachDayOfInterval({
      start: new Date(inicio),
      end: new Date(fim),
    });

    for (const dia of diasDoMes) {
      for (const colaborador of colaboradoresComMarcacao) {
        const marcacoesDoDiaColaborador = marcacoes.filter(
          (m) =>
            m.colaboradorId === colaborador.colaboradorId &&
            utcToZonedTime(m.dataHora, TIMEZONE).toDateString() === dia.toDateString(),
        );

        if (marcacoesDoDiaColaborador.length >= 2) {
          let minutosDoDia = 0;

          // Calcular minutos entre ENTRADA_1 e SAIDA_1 (período 1)
          const entrada1 = marcacoesDoDiaColaborador.find((m) => m.tipo === "ENTRADA_1");
          const saida1 = marcacoesDoDiaColaborador.find((m) => m.tipo === "SAIDA_1");

          if (entrada1 && saida1) {
            minutosDoDia += (saida1.dataHora.getTime() - entrada1.dataHora.getTime()) / (1000 * 60);
          }

          // Calcular minutos entre ENTRADA_2 e SAIDA_2 (período 2)
          const entrada2 = marcacoesDoDiaColaborador.find((m) => m.tipo === "ENTRADA_2");
          const saida2 = marcacoesDoDiaColaborador.find((m) => m.tipo === "SAIDA_2");

          if (entrada2 && saida2) {
            minutosDoDia += (saida2.dataHora.getTime() - entrada2.dataHora.getTime()) / (1000 * 60);
          }

          if (minutosDoDia > 0) {
            totalMinutosTrabalhados += minutosDoDia;
            diasComTrabalhosContados++;
          }
        }
      }
    }

    const horaMediaTrabalhada = diasComTrabalhosContados > 0 ? totalMinutosTrabalhados / diasComTrabalhosContados / 60 : 0;

    // Horas extras (simplificado: minutos > 480 por dia, acumulado)
    let horasExtrasTotais = 0;
    for (const dia of diasDoMes) {
      for (const colaborador of colaboradoresComMarcacao) {
        const marcacoesDoDiaColaborador = marcacoes.filter(
          (m) =>
            m.colaboradorId === colaborador.colaboradorId &&
            utcToZonedTime(m.dataHora, TIMEZONE).toDateString() === dia.toDateString(),
        );

        if (marcacoesDoDiaColaborador.length >= 2) {
          let minutosDoDia = 0;

          const entrada1 = marcacoesDoDiaColaborador.find((m) => m.tipo === "ENTRADA_1");
          const saida1 = marcacoesDoDiaColaborador.find((m) => m.tipo === "SAIDA_1");

          if (entrada1 && saida1) {
            minutosDoDia += (saida1.dataHora.getTime() - entrada1.dataHora.getTime()) / (1000 * 60);
          }

          const entrada2 = marcacoesDoDiaColaborador.find((m) => m.tipo === "ENTRADA_2");
          const saida2 = marcacoesDoDiaColaborador.find((m) => m.tipo === "SAIDA_2");

          if (entrada2 && saida2) {
            minutosDoDia += (saida2.dataHora.getTime() - entrada2.dataHora.getTime()) / (1000 * 60);
          }

          if (minutosDoDia > 480) {
            horasExtrasTotais += (minutosDoDia - 480) / 60;
          }
        }
      }
    }

    return {
      totalColaboradores,
      presentes,
      ausentes,
      atrasos,
      saidasAntecipadas,
      horaMediaTrabalhada: Math.round(horaMediaTrabalhada * 100) / 100,
      horasExtrasTotais: Math.round(horasExtrasTotais * 100) / 100,
    };
  } catch (error) {
    console.error("Erro ao obter indicadores:", error);
    return { erro: "Erro ao obter indicadores de ponto." };
  }
}

export interface DadosHorasTrabalhadas {
  colaboradorId: string;
  nome: string;
  totalHoras: number;
  totalMinutos: number;
  diasTrabalhados: number;
  horaMedia: number;
}

/** Relatório de horas trabalhadas por colaborador no mês */
export async function obterHorasTrabalhadas(
  empresaId: string,
  mes: Date = new Date(),
): Promise<DadosHorasTrabalhadas[] | { erro: string }> {
  await requireEmpresaAccess(empresaId);

  try {
    const { inicio, fim } = periodoDoMesEmUTC(mes);

    const colaboradores = await prisma.colaborador.findMany({
      where: { empresaId, ativo: true },
      select: { id: true, nome: true },
    });

    const marcacoes = await marcacoesDaJornada(prisma, {
      empresaId,
      de: inicio,
      ate: fim,
    });

    const resultado: DadosHorasTrabalhadas[] = [];

    for (const colab of colaboradores) {
      const marcacoesColab = marcacoes.filter((m) => m.colaboradorId === colab.id);

      if (marcacoesColab.length === 0) continue;

      const diasTrabalhados = new Set<string>();
      let totalMinutos = 0;

      const marcacoesPorDia = new Map<string, typeof marcacoesColab>();
      for (const m of marcacoesColab) {
        const dia = utcToZonedTime(m.dataHora, TIMEZONE).toDateString();
        const list = marcacoesPorDia.get(dia) ?? [];
        list.push(m);
        marcacoesPorDia.set(dia, list);
      }

      for (const [dia, marcacoesDoDia] of marcacoesPorDia) {
        let minutosDoDia = 0;

        const entrada1 = marcacoesDoDia.find((m) => m.tipo === "ENTRADA_1");
        const saida1 = marcacoesDoDia.find((m) => m.tipo === "SAIDA_1");

        if (entrada1 && saida1) {
          minutosDoDia += (saida1.dataHora.getTime() - entrada1.dataHora.getTime()) / (1000 * 60);
        }

        const entrada2 = marcacoesDoDia.find((m) => m.tipo === "ENTRADA_2");
        const saida2 = marcacoesDoDia.find((m) => m.tipo === "SAIDA_2");

        if (entrada2 && saida2) {
          minutosDoDia += (saida2.dataHora.getTime() - entrada2.dataHora.getTime()) / (1000 * 60);
        }

        if (minutosDoDia > 0) {
          diasTrabalhados.add(dia);
          totalMinutos += minutosDoDia;
        }
      }

      const totalHoras = Math.floor(totalMinutos / 60);
      const horaMedia = diasTrabalhados.size > 0 ? totalMinutos / diasTrabalhados.size / 60 : 0;

      resultado.push({
        colaboradorId: colab.id,
        nome: colab.nome,
        totalHoras,
        totalMinutos: totalMinutos % 60,
        diasTrabalhados: diasTrabalhados.size,
        horaMedia: Math.round(horaMedia * 100) / 100,
      });
    }

    return resultado.sort((a, b) => a.nome.localeCompare(b.nome));
  } catch (error) {
    console.error("Erro ao obter horas trabalhadas:", error);
    return { erro: "Erro ao obter dados de horas trabalhadas." };
  }
}

export interface DadosBancoHoras {
  colaboradorId: string;
  nome: string;
  saldoAnterior: number;
  creditosMes: number;
  debitosMes: number;
  saldoAtual: number;
  saldoEmHoras: string;
}

/** Relatório de banco de horas por colaborador */
export async function obterBancoHoras(
  empresaId: string,
  competencia: string,
): Promise<DadosBancoHoras[] | { erro: string }> {
  await requireEmpresaAccess(empresaId);

  try {
    const registros = await prisma.bancoHoras.findMany({
      where: { empresaId, competencia },
      include: { colaborador: { select: { nome: true } } },
      orderBy: { colaborador: { nome: "asc" } },
    });

    return registros.map((r) => ({
      colaboradorId: r.colaboradorId,
      nome: r.colaborador.nome,
      saldoAnterior: r.saldoAnterior,
      creditosMes: r.creditosMes,
      debitosMes: r.debitosMes,
      saldoAtual: r.saldoAtual,
      saldoEmHoras: `${Math.floor(Math.abs(r.saldoAtual) / 60)}h ${Math.abs(r.saldoAtual) % 60}m ${r.saldoAtual < 0 ? "(débito)" : ""}`,
    }));
  } catch (error) {
    console.error("Erro ao obter banco de horas:", error);
    return { erro: "Erro ao obter dados de banco de horas." };
  }
}
