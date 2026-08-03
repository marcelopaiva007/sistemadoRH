import { prisma } from "@/lib/prisma";
import { DIAS_ALERTA_VENCIMENTO } from "@/lib/constants-dp";
import { hojeUTC, somarDiasUTC } from "@/lib/datas";

export type Pendencias = {
  aprovacoes: number;
  documentosAConferir: number;
  asoVencendo: number;
  certificadosVencendo: number;
  catPendente: number;
  integracoesAtrasadas: number;
  epiVencido: number;
  // Críticas
  feriasVencidas: number;
  avisoPrevio: number;
  desligamentosIncompletos: number;
  // Altas
  treinamentosObrigatorios: number;
  avaliacoesAtrasadas: number;
  contratosTemporariosVencidos: number;
  onboardingIncompleto: number;
  // Médias
  pesquisaClimaRespostasAtrasadas: number;
  dadosCadastraisDesatualizados: number;
  beneficiariosSemAtualizacao: number;
  movimentacoesAdministrativas: number;
  atestadosMedicosSemRegistro: number;
  horasExtrasSemAprovacao: number;
};

export const totalPendencias = (p: Pendencias) => Object.values(p).reduce((s, n) => s + n, 0);

export const zeradas = (): Pendencias => ({
  aprovacoes: 0,
  documentosAConferir: 0,
  asoVencendo: 0,
  certificadosVencendo: 0,
  catPendente: 0,
  integracoesAtrasadas: 0,
  epiVencido: 0,
  feriasVencidas: 0,
  avisoPrevio: 0,
  desligamentosIncompletos: 0,
  treinamentosObrigatorios: 0,
  avaliacoesAtrasadas: 0,
  contratosTemporariosVencidos: 0,
  onboardingIncompleto: 0,
  pesquisaClimaRespostasAtrasadas: 0,
  dadosCadastraisDesatualizados: 0,
  beneficiariosSemAtualizacao: 0,
  movimentacoesAdministrativas: 0,
  atestadosMedicosSemRegistro: 0,
  horasExtrasSemAprovacao: 0,
});

type LinhaAgrupada = { empresaId: string; _count?: { _all?: number } };

/**
 * As pendências de várias empresas de uma vez, já separadas por empresa.
 *
 * São 8 queries agregadas, independente de quantas empresas entrarem: o
 * `groupBy` devolve a contagem por `empresaId` numa tacada. A tela inicial do
 * grupo antes chamava `pendenciasDaEmpresa([id])` dentro de um laço, o que dava
 * 8 queries POR empresa — com os 11 CNPJs do grupo, quase 90 idas ao banco só
 * para montar os cartões.
 *
 * Empresa sem nenhuma pendência não volta no `groupBy`; por isso o mapa já
 * nasce com todas as chaves zeradas.
 */
export async function pendenciasPorEmpresa(empresaIds: string[]): Promise<Map<string, Pendencias>> {
  const mapa = new Map<string, Pendencias>(empresaIds.map((id) => [id, zeradas()]));
  if (empresaIds.length === 0) return mapa;

  const empresaId = { in: empresaIds };
  const hoje = hojeUTC();
  const limite = somarDiasUTC(hoje, DIAS_ALERTA_VENCIMENTO);
  const por = ["empresaId"] as const;
  const contar = { _all: true } as const;

  const [feriasPendentes, ausenciasPendentes, documentosAConferir, asoVencendo, certificadosVencendo, catPendente, integracoesAtrasadas, epiVencido, feriasVencidas, avisoPrevio, desligamentosIncompletos, treinamentosObrigatorios, avaliacoesAtrasadas, contratosTemporariosVencidos, onboardingIncompleto, pesquisaClimaRespostasAtrasadas, dadosCadastraisDesatualizados, beneficiariosSemAtualizacao, movimentacoesAdministrativas, atestadosMedicosSemRegistro, horasExtrasSemAprovacao] =
    await Promise.all([
      prisma.solicitacaoFerias.groupBy({ by: [...por], _count: contar, where: { empresaId, status: "PENDENTE" } }),
      prisma.ausencia.groupBy({ by: [...por], _count: contar, where: { empresaId, status: "PENDENTE" } }),
      prisma.documentoColaborador.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, origem: "COLABORADOR", conferidoEm: null },
      }),
      prisma.exameOcupacional.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, validoAte: { not: null, lte: limite }, colaborador: { ativo: true } },
      }),
      prisma.certificadoNR.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, validoAte: { not: null, lte: limite }, colaborador: { ativo: true } },
      }),
      prisma.acidenteTrabalho.groupBy({ by: [...por], _count: contar, where: { empresaId, catEmitida: false } }),
      prisma.checklistIntegracao.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, concluido: false, prazo: { not: null, lt: hoje }, colaborador: { ativo: true } },
      }),
      prisma.entregaEPI.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, validoAte: { not: null, lt: hoje }, colaborador: { ativo: true } },
      }),
      // Férias vencidas (12+ meses sem gozar)
      prisma.colaborador.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, ativo: true, ultimasFerias: { lt: somarDiasUTC(hoje, -365) } },
      }),
      // Aviso prévio (data de saída próxima - 7 dias)
      prisma.colaborador.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, ativo: true, dataSaida: { gte: hoje, lte: somarDiasUTC(hoje, 7) } },
      }),
      // Desligamentos incompletos (saído mas sem acertos finalizados)
      prisma.colaborador.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, ativo: false, acertosFinalizadoEm: null },
      }),
      // Treinamentos obrigatórios vencidos
      prisma.treinamento.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, obrigatorio: true, validoAte: { lt: hoje }, colaborador: { ativo: true } },
      }),
      // Avaliações atrasadas (ciclo vencido sem avaliação)
      prisma.cicloAvaliacao.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, dataFim: { lt: hoje }, avisoEnviado: false },
      }),
      // Contratos temporários vencendo (próximos 30 dias)
      prisma.colaborador.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, ativo: true, tipoContrato: "TEMPORÁRIO", dataVencimentoContrato: { gte: hoje, lte: somarDiasUTC(hoje, 30) } },
      }),
      // Onboarding incompleto (novos contratados - 30 dias)
      prisma.colaborador.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, ativo: true, dataAdmissao: { gte: somarDiasUTC(hoje, -30), lte: hoje }, onboardingConcluido: false },
      }),
      // Pesquisa de clima não respondida (ciclo aberto)
      prisma.pesquisaClima.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, status: "ATIVA", respondente: { none: { respondidoEm: { not: null } } } },
      }),
      // Dados cadastrais desatualizados (6+ meses)
      prisma.colaborador.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, ativo: true, atualizadoEm: { lt: somarDiasUTC(hoje, -180) } },
      }),
      // Beneficiários sem atualização (12+ meses)
      prisma.beneficiarioDependente.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, atualizadoEm: { lt: somarDiasUTC(hoje, -365) } },
      }),
      // Movimentações administrativas pendentes (não processadas)
      prisma.movimentacao.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, status: "PENDENTE" },
      }),
      // Atestados médicos sem registro (comunicações não lançadas)
      prisma.ausencia.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, tipoAusencia: "ATESTADO_MÉDICO", registradoEm: null },
      }),
      // Horas extras sem aprovação
      prisma.horaExtra.groupBy({
        by: [...por],
        _count: contar,
        where: { empresaId, aprovadoEm: null, solicitadoEm: { lt: somarDiasUTC(hoje, -7) } },
      }),
    ]);

  const somar = (linhas: LinhaAgrupada[], aplicar: (p: Pendencias, n: number) => void) => {
    for (const linha of linhas) {
      const p = mapa.get(linha.empresaId);
      if (p) aplicar(p, linha._count?._all ?? 0);
    }
  };

  // `aprovacoes` junta férias e ausências — as duas somam no mesmo número.
  somar(feriasPendentes, (p, n) => (p.aprovacoes += n));
  somar(ausenciasPendentes, (p, n) => (p.aprovacoes += n));
  somar(documentosAConferir, (p, n) => (p.documentosAConferir = n));
  somar(asoVencendo, (p, n) => (p.asoVencendo = n));
  somar(certificadosVencendo, (p, n) => (p.certificadosVencendo = n));
  somar(catPendente, (p, n) => (p.catPendente = n));
  somar(integracoesAtrasadas, (p, n) => (p.integracoesAtrasadas = n));
  somar(epiVencido, (p, n) => (p.epiVencido = n));
  somar(feriasVencidas, (p, n) => (p.feriasVencidas = n));
  somar(avisoPrevio, (p, n) => (p.avisoPrevio = n));
  somar(desligamentosIncompletos, (p, n) => (p.desligamentosIncompletos = n));
  somar(treinamentosObrigatorios, (p, n) => (p.treinamentosObrigatorios = n));
  somar(avaliacoesAtrasadas, (p, n) => (p.avaliacoesAtrasadas = n));
  somar(contratosTemporariosVencidos, (p, n) => (p.contratosTemporariosVencidos = n));
  somar(onboardingIncompleto, (p, n) => (p.onboardingIncompleto = n));
  somar(pesquisaClimaRespostasAtrasadas, (p, n) => (p.pesquisaClimaRespostasAtrasadas = n));
  somar(dadosCadastraisDesatualizados, (p, n) => (p.dadosCadastraisDesatualizados = n));
  somar(beneficiariosSemAtualizacao, (p, n) => (p.beneficiariosSemAtualizacao = n));
  somar(movimentacoesAdministrativas, (p, n) => (p.movimentacoesAdministrativas = n));
  somar(atestadosMedicosSemRegistro, (p, n) => (p.atestadosMedicosSemRegistro = n));
  somar(horasExtrasSemAprovacao, (p, n) => (p.horasExtrasSemAprovacao = n));

  return mapa;
}

/**
 * O que exige ação numa empresa. Usado tanto na tela inicial do grupo quanto
 * na da empresa — uma função só para os dois lugares nunca discordarem sobre
 * o que conta como pendência.
 */
// Recebe os CNPJs da marca (ver lib/escopo-marca.ts): o RH cobra a pendência
// de todo mundo no mesmo lugar, não CNPJ a CNPJ.
export async function pendenciasDaEmpresa(empresaIds: string[]): Promise<Pendencias> {
  const porEmpresa = await pendenciasPorEmpresa(empresaIds);

  const total = zeradas();
  for (const p of porEmpresa.values()) {
    total.aprovacoes += p.aprovacoes;
    total.documentosAConferir += p.documentosAConferir;
    total.asoVencendo += p.asoVencendo;
    total.certificadosVencendo += p.certificadosVencendo;
    total.catPendente += p.catPendente;
    total.integracoesAtrasadas += p.integracoesAtrasadas;
    total.epiVencido += p.epiVencido;
    total.feriasVencidas += p.feriasVencidas;
    total.avisoPrevio += p.avisoPrevio;
    total.desligamentosIncompletos += p.desligamentosIncompletos;
    total.treinamentosObrigatorios += p.treinamentosObrigatorios;
    total.avaliacoesAtrasadas += p.avaliacoesAtrasadas;
    total.contratosTemporariosVencidos += p.contratosTemporariosVencidos;
    total.onboardingIncompleto += p.onboardingIncompleto;
    total.pesquisaClimaRespostasAtrasadas += p.pesquisaClimaRespostasAtrasadas;
    total.dadosCadastraisDesatualizados += p.dadosCadastraisDesatualizados;
    total.beneficiariosSemAtualizacao += p.beneficiariosSemAtualizacao;
    total.movimentacoesAdministrativas += p.movimentacoesAdministrativas;
    total.atestadosMedicosSemRegistro += p.atestadosMedicosSemRegistro;
    total.horasExtrasSemAprovacao += p.horasExtrasSemAprovacao;
  }
  return total;
}
