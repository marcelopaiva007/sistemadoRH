"use server";

import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { marcacoesDaJornada } from "@/lib/ponto-jornada";
import {
  agruparPorDiaBrasilia,
  ehAtrasoNoPainel,
  ehSaidaAntecipadaNoPainel,
  janelaDoMesBrasilia,
  lerCompetencia,
  minutosTrabalhadosNoDia,
  primeiroDiaDoMesCalendario,
} from "@/lib/ponto-relatorios";

// Toda conta de fuso, mês e dia vem de lib/ponto-relatorios.ts (26/11/2026).
// Até ali esta action somava e subtraía 3h à mão, com o sinal trocado nas duas
// direções — ver o cabeçalho daquele arquivo.

/** Quem entra no relatório do mês: ativo, ou desligado a partir do dia 1º do mês. */
function filtroColaboradoresDoMes(empresaId: string, competencia: string) {
  return {
    empresaId,
    OR: [{ ativo: true }, { dataDesligamento: { gte: primeiroDiaDoMesCalendario(competencia) } }],
  };
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

/** Dashboard de indicadores gerais da empresa no mês ("AAAA-MM", calendário de Brasília). */
export async function obterIndicadoresRH(
  empresaId: string,
  competencia: string,
): Promise<DadosIndicadoresRH | { erro: string }> {
  await requireEmpresaAccess(empresaId);
  if (!lerCompetencia(competencia)) return { erro: "Mês inválido." };

  try {
    const { inicio, fim } = janelaDoMesBrasilia(competencia);

    const colaboradores = await prisma.colaborador.findMany({
      where: filtroColaboradoresDoMes(empresaId, competencia),
      select: { id: true },
    });
    const doMes = new Set(colaboradores.map((c) => c.id));

    // Batidas + marcações tratadas (inclusão manual aprovada), janela [inicio, fim).
    const marcacoes = (await marcacoesDaJornada(prisma, { empresaId, de: inicio, ate: fim })).filter((m) =>
      doMes.has(m.colaboradorId),
    );

    const presentesSet = new Set(marcacoes.map((m) => m.colaboradorId));
    const totalColaboradores = doMes.size;
    const presentes = presentesSet.size;
    const ausentes = Math.max(0, totalColaboradores - presentes);

    let atrasos = 0;
    let saidasAntecipadas = 0;
    for (const m of marcacoes) {
      if (m.tipo === "ENTRADA_1" && ehAtrasoNoPainel(m.dataHora)) atrasos++;
      if (m.tipo === "SAIDA_2" && ehSaidaAntecipadaNoPainel(m.dataHora)) saidasAntecipadas++;
    }

    // Horas por colaborador-dia, com o DIA de Brasília (saída às 22:30 fica no
    // mesmo dia da entrada).
    let totalMinutosTrabalhados = 0;
    let diasContados = 0;
    let minutosExtras = 0;
    for (const colaboradorId of presentesSet) {
      const doColaborador = marcacoes.filter((m) => m.colaboradorId === colaboradorId);
      for (const marcacoesDoDia of agruparPorDiaBrasilia(doColaborador).values()) {
        const minutos = minutosTrabalhadosNoDia(marcacoesDoDia);
        if (minutos <= 0) continue;
        totalMinutosTrabalhados += minutos;
        diasContados++;
        // Simplificado: o que passa de 8h no dia. Não é apuração de hora extra
        // (não conhece a jornada contratual de cada um) — a tela diz isso.
        if (minutos > 480) minutosExtras += minutos - 480;
      }
    }

    const horaMediaTrabalhada = diasContados > 0 ? totalMinutosTrabalhados / diasContados / 60 : 0;

    return {
      totalColaboradores,
      presentes,
      ausentes,
      atrasos,
      saidasAntecipadas,
      horaMediaTrabalhada: Math.round(horaMediaTrabalhada * 100) / 100,
      horasExtrasTotais: Math.round((minutosExtras / 60) * 100) / 100,
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

/** Relatório de horas trabalhadas por colaborador no mês ("AAAA-MM", calendário de Brasília). */
export async function obterHorasTrabalhadas(
  empresaId: string,
  competencia: string,
): Promise<DadosHorasTrabalhadas[] | { erro: string }> {
  await requireEmpresaAccess(empresaId);
  if (!lerCompetencia(competencia)) return { erro: "Mês inválido." };

  try {
    const { inicio, fim } = janelaDoMesBrasilia(competencia);

    // Desligados no mês entram (26/11/2026): antes só `ativo: true`, e as
    // horas de quem saiu no meio do mês sumiam do relatório.
    const colaboradores = await prisma.colaborador.findMany({
      where: filtroColaboradoresDoMes(empresaId, competencia),
      select: { id: true, nome: true },
    });

    const marcacoes = await marcacoesDaJornada(prisma, { empresaId, de: inicio, ate: fim });

    const resultado: DadosHorasTrabalhadas[] = [];

    for (const colab of colaboradores) {
      const marcacoesColab = marcacoes.filter((m) => m.colaboradorId === colab.id);
      if (marcacoesColab.length === 0) continue;

      let diasTrabalhados = 0;
      let totalMinutos = 0;
      for (const marcacoesDoDia of agruparPorDiaBrasilia(marcacoesColab).values()) {
        const minutos = minutosTrabalhadosNoDia(marcacoesDoDia);
        if (minutos > 0) {
          diasTrabalhados++;
          totalMinutos += minutos;
        }
      }

      const minutosInteiros = Math.round(totalMinutos);
      const horaMedia = diasTrabalhados > 0 ? totalMinutos / diasTrabalhados / 60 : 0;

      resultado.push({
        colaboradorId: colab.id,
        nome: colab.nome,
        totalHoras: Math.floor(minutosInteiros / 60),
        totalMinutos: minutosInteiros % 60,
        diasTrabalhados,
        horaMedia: Math.round(horaMedia * 100) / 100,
      });
    }

    return resultado.sort((a, b) => a.nome.localeCompare(b.nome));
  } catch (error) {
    console.error("Erro ao obter horas trabalhadas:", error);
    return { erro: "Erro ao obter dados de horas trabalhadas." };
  }
}

// Banco de horas: `obterBancoHoras` foi REMOVIDA em 26/11/2026. Ela lia a
// tabela rh.BancoHoras, que nada no sistema grava (não existe create/upsert
// fora do client gerado) — devolvia lista vazia sempre, e a tela mostrava
// "Sem dados disponíveis para este período" como se o período estivesse
// zerado. A tela agora diz que o banco de horas ainda não é calculado e o que
// falta para calcular (banco-horas-relatorio.tsx).
