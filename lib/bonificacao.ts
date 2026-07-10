import { prisma } from "@/lib/prisma";

type ProdutoValores = {
  internet?: number;
  chip?: number;
  gps?: number;
  streaming?: number;
  telefoniaFixa?: number;
};

type SupervisorTier = { meta?: number; valor?: number };
type RegraSupervisor = { tier3?: SupervisorTier; tier5?: SupervisorTier };

export function periodoParaIntervalo(periodo: string) {
  const [ano, mes] = periodo.split("-").map(Number);
  const inicio = new Date(Date.UTC(ano, mes - 1, 1));
  const fim = new Date(Date.UTC(ano, mes, 0, 23, 59, 59));
  return { inicio, fim };
}

export async function getRegraVigente(cargo: string, periodo: string) {
  const { fim } = periodoParaIntervalo(periodo);
  return prisma.regraBonificacao.findFirst({
    where: {
      cargo,
      vigenciaInicio: { lte: fim },
      OR: [{ vigenciaFim: null }, { vigenciaFim: { gte: fim } }],
    },
    orderBy: { vigenciaInicio: "desc" },
  });
}

type LancamentoAgregado = {
  quantidade: number;
  aprovado: number;
  cancelado: number;
  valorInstalado: number;
  qtdInternet: number;
  qtdChip: number;
  qtdGps: number;
  qtdStreaming: number;
  qtdTelefoniaFixa: number;
};

function somaLancamentos(lancamentos: LancamentoAgregado[]): LancamentoAgregado {
  return lancamentos.reduce(
    (acc, l) => ({
      quantidade: acc.quantidade + l.quantidade,
      aprovado: acc.aprovado + l.aprovado,
      cancelado: acc.cancelado + l.cancelado,
      valorInstalado: acc.valorInstalado + l.valorInstalado,
      qtdInternet: acc.qtdInternet + l.qtdInternet,
      qtdChip: acc.qtdChip + l.qtdChip,
      qtdGps: acc.qtdGps + l.qtdGps,
      qtdStreaming: acc.qtdStreaming + l.qtdStreaming,
      qtdTelefoniaFixa: acc.qtdTelefoniaFixa + l.qtdTelefoniaFixa,
    }),
    {
      quantidade: 0,
      aprovado: 0,
      cancelado: 0,
      valorInstalado: 0,
      qtdInternet: 0,
      qtdChip: 0,
      qtdGps: 0,
      qtdStreaming: 0,
      qtdTelefoniaFixa: 0,
    }
  );
}

type RegraCampos = {
  metaQtd: number | null;
  valorMeta: number | null;
  superMetaQtd: number | null;
  valorSuperMeta: number | null;
  percentualTaxaAtivacao: number | null;
  valoresPorProduto: unknown;
};

export function calcularBonificacaoIndividual(agregado: LancamentoAgregado, regra: RegraCampos | null) {
  if (!regra) {
    return { valorBase: 0, valorMeta: 0, valorSuperMeta: 0, valorProdutos: 0 };
  }

  let valorMeta = 0;
  let valorSuperMeta = 0;
  if (regra.superMetaQtd != null && agregado.aprovado >= regra.superMetaQtd) {
    valorSuperMeta = regra.valorSuperMeta ?? 0;
  } else if (regra.metaQtd != null && agregado.aprovado >= regra.metaQtd) {
    valorMeta = regra.valorMeta ?? 0;
  }

  const valorBase = regra.percentualTaxaAtivacao
    ? agregado.valorInstalado * regra.percentualTaxaAtivacao
    : 0;

  const produtos = (regra.valoresPorProduto as ProdutoValores) ?? {};
  const valorProdutos =
    agregado.qtdInternet * (produtos.internet ?? 0) +
    agregado.qtdChip * (produtos.chip ?? 0) +
    agregado.qtdGps * (produtos.gps ?? 0) +
    agregado.qtdStreaming * (produtos.streaming ?? 0) +
    agregado.qtdTelefoniaFixa * (produtos.telefoniaFixa ?? 0);

  return { valorBase, valorMeta, valorSuperMeta, valorProdutos };
}

export function calcularBonificacaoSupervisor(
  totalAprovadoEquipe: number,
  tamanhoTier: number | null,
  regraSupervisor: unknown
): number {
  if (!tamanhoTier) return 0;
  const regra = (regraSupervisor as RegraSupervisor) ?? {};
  const tier = tamanhoTier === 5 ? regra.tier5 : regra.tier3;
  if (!tier?.meta) return 0;
  return totalAprovadoEquipe >= tier.meta ? tier.valor ?? 0 : 0;
}

export async function recalcularFechamento(periodo: string) {
  const fechamento = await prisma.fechamentoMensal.upsert({
    where: { periodo },
    update: {},
    create: { periodo, status: "ABERTO" },
  });

  if (fechamento.status === "FECHADO") {
    return fechamento;
  }

  const funcionarios = await prisma.funcionario.findMany({
    where: { ativo: true },
    include: { equipe: true },
  });

  const lancamentos = await prisma.lancamentoVenda.findMany({ where: { periodo } });
  const lancamentosPorFuncionario = new Map<string, LancamentoAgregado[]>();
  for (const l of lancamentos) {
    const lista = lancamentosPorFuncionario.get(l.funcionarioId) ?? [];
    lista.push(l);
    lancamentosPorFuncionario.set(l.funcionarioId, lista);
  }

  const regraPorCargo = new Map<string, Awaited<ReturnType<typeof getRegraVigente>>>();
  for (const cargo of ["VENDEDOR_EXTERNO", "ATENDIMENTO_ADM", "SUPERVISOR", "OUTRO_SETOR"]) {
    regraPorCargo.set(cargo, await getRegraVigente(cargo, periodo));
  }

  // Total de aprovados por equipe (para a bonificação de supervisor)
  const aprovadosPorEquipe = new Map<string, number>();
  for (const f of funcionarios) {
    if (!f.equipeId) continue;
    const agregado = somaLancamentos(lancamentosPorFuncionario.get(f.id) ?? []);
    aprovadosPorEquipe.set(f.equipeId, (aprovadosPorEquipe.get(f.equipeId) ?? 0) + agregado.aprovado);
  }

  let valorTotalVendido = 0;
  let valorTotalBonificacao = 0;

  await prisma.$transaction(async (tx) => {
    for (const f of funcionarios) {
      const agregado = somaLancamentos(lancamentosPorFuncionario.get(f.id) ?? []);
      const regra = regraPorCargo.get(f.cargo) ?? null;
      const { valorBase, valorMeta, valorSuperMeta, valorProdutos } = calcularBonificacaoIndividual(
        agregado,
        regra
      );

      let valorSupervisor = 0;
      if (f.cargo === "SUPERVISOR") {
        const equipesSupervisionadas = await tx.equipe.findMany({ where: { supervisorId: f.id } });
        for (const equipe of equipesSupervisionadas) {
          const totalEquipe = aprovadosPorEquipe.get(equipe.id) ?? 0;
          valorSupervisor += calcularBonificacaoSupervisor(
            totalEquipe,
            equipe.tamanhoTier,
            regra?.regraSupervisor
          );
        }
      }

      const valorTotal = valorBase + valorMeta + valorSuperMeta + valorProdutos + valorSupervisor;
      if (valorTotal === 0 && agregado.quantidade === 0) continue;

      valorTotalVendido += agregado.valorInstalado;
      valorTotalBonificacao += valorTotal;

      await tx.bonificacaoCalculada.upsert({
        where: { fechamentoId_funcionarioId: { fechamentoId: fechamento.id, funcionarioId: f.id } },
        update: { valorBase, valorMeta, valorSuperMeta, valorProdutos, valorSupervisor, valorTotal },
        create: {
          fechamentoId: fechamento.id,
          funcionarioId: f.id,
          valorBase,
          valorMeta,
          valorSuperMeta,
          valorProdutos,
          valorSupervisor,
          valorTotal,
        },
      });
    }

    const ajustes = await tx.ajuste.findMany({ where: { periodo } });
    const totalAjustes = ajustes.reduce((acc, a) => acc + a.valor, 0);

    await tx.fechamentoMensal.update({
      where: { id: fechamento.id },
      data: {
        valorTotalVendido,
        valorTotalBonificacao: valorTotalBonificacao + totalAjustes,
      },
    });
  });

  return fechamento;
}
