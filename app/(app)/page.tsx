import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { periodoAtual, periodoAnterior } from "@/lib/periodo";
import { DashboardView, type RankingLinha, type ResumoPeriodo } from "./dashboard-view";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const fechamentos = await prisma.fechamentoMensal.findMany({
    orderBy: { periodo: "asc" },
  });
  const fechamentoAberto = [...fechamentos].reverse().find((f) => f.status === "ABERTO") ?? null;
  const periodo =
    params.periodo ?? fechamentoAberto?.periodo ?? fechamentos.at(-1)?.periodo ?? periodoAtual();
  const anterior = periodoAnterior(periodo);
  const fechamentoSelecionado = fechamentos.find((f) => f.periodo === periodo) ?? null;

  const [
    lancamentos,
    lancAnteriorAgg,
    bonificacoes,
    bonifAnteriorAgg,
    ajustesAgg,
    totalFuncionarios,
    totalCidades,
  ] = await Promise.all([
    prisma.lancamentoVenda.findMany({
      where: { periodo },
      include: { funcionario: { include: { cidade: true } } },
    }),
    prisma.lancamentoVenda.aggregate({
      where: { periodo: anterior },
      _sum: { valorInstalado: true, quantidade: true, aprovado: true, cancelado: true },
    }),
    prisma.bonificacaoCalculada.findMany({
      where: { fechamento: { periodo } },
      include: { funcionario: { include: { cidade: true } } },
    }),
    prisma.bonificacaoCalculada.aggregate({
      where: { fechamento: { periodo: anterior } },
      _sum: { valorTotal: true },
    }),
    prisma.ajuste.aggregate({ where: { periodo }, _sum: { valor: true } }),
    prisma.funcionario.count({ where: { ativo: true } }),
    prisma.cidade.count(),
  ]);

  const resumo: ResumoPeriodo = {
    vendido: 0,
    bonificacao: 0,
    lancadas: 0,
    aprovadas: 0,
    canceladas: 0,
  };
  const mix = { internet: 0, chip: 0, gps: 0, tv: 0, streaming: 0, telefoniaFixa: 0 };
  const porCidadeMap = new Map<string, { valor: number; aprovadas: number }>();
  const porCargoMap = new Map<string, { vendido: number; bonificacao: number }>();
  const rankingMap = new Map<string, RankingLinha>();
  const vendedoresComVenda = new Set<string>();

  for (const l of lancamentos) {
    resumo.vendido += l.valorInstalado;
    resumo.lancadas += l.quantidade;
    resumo.aprovadas += l.aprovado;
    resumo.canceladas += l.cancelado;
    mix.internet += l.qtdInternet;
    mix.chip += l.qtdChip;
    mix.gps += l.qtdGps;
    mix.tv += l.qtdTv;
    mix.streaming += l.qtdStreaming;
    mix.telefoniaFixa += l.qtdTelefoniaFixa;
    if (l.quantidade > 0 || l.valorInstalado > 0) vendedoresComVenda.add(l.funcionarioId);

    const cidade = l.funcionario.cidade?.nome ?? "Sem cidade";
    const c = porCidadeMap.get(cidade) ?? { valor: 0, aprovadas: 0 };
    c.valor += l.valorInstalado;
    c.aprovadas += l.aprovado;
    porCidadeMap.set(cidade, c);

    const cargo = porCargoMap.get(l.funcionario.cargo) ?? { vendido: 0, bonificacao: 0 };
    cargo.vendido += l.valorInstalado;
    porCargoMap.set(l.funcionario.cargo, cargo);

    const r = rankingMap.get(l.funcionarioId) ?? {
      id: l.funcionarioId,
      nome: l.funcionario.nome,
      cidade: l.funcionario.cidade?.nome ?? "—",
      cargo: l.funcionario.cargo,
      aprovadas: 0,
      valor: 0,
      bonificacao: 0,
    };
    r.aprovadas += l.aprovado;
    r.valor += l.valorInstalado;
    rankingMap.set(l.funcionarioId, r);
  }

  const composicao = {
    internet: 0,
    chip: 0,
    demais: 0,
    supervisor: 0,
  };
  for (const b of bonificacoes) {
    resumo.bonificacao += b.valorTotal;
    composicao.internet += b.valorInternet;
    composicao.chip += b.valorChip;
    composicao.demais += b.valorDemais;
    composicao.supervisor += b.valorSupervisor;

    const cargo = porCargoMap.get(b.funcionario.cargo) ?? { vendido: 0, bonificacao: 0 };
    cargo.bonificacao += b.valorTotal;
    porCargoMap.set(b.funcionario.cargo, cargo);

    const r = rankingMap.get(b.funcionarioId) ?? {
      id: b.funcionarioId,
      nome: b.funcionario.nome,
      cidade: b.funcionario.cidade?.nome ?? "—",
      cargo: b.funcionario.cargo,
      aprovadas: 0,
      valor: 0,
      bonificacao: 0,
    };
    r.bonificacao += b.valorTotal;
    rankingMap.set(b.funcionarioId, r);
  }

  const resumoAnterior: ResumoPeriodo = {
    vendido: lancAnteriorAgg._sum.valorInstalado ?? 0,
    bonificacao: bonifAnteriorAgg._sum.valorTotal ?? 0,
    lancadas: lancAnteriorAgg._sum.quantidade ?? 0,
    aprovadas: lancAnteriorAgg._sum.aprovado ?? 0,
    canceladas: lancAnteriorAgg._sum.cancelado ?? 0,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Olá, {user.name ?? user.username}
          </h1>
          <p className="text-muted-foreground">
            Visão geral do sistema de bonificação de vendas.
          </p>
        </div>
        <Button variant="outline" nativeButton={false} render={<Link href="/relatorios" />}>
          Ver relatórios completos
        </Button>
      </div>

      <DashboardView
        periodo={periodo}
        periodoAnterior={anterior}
        statusFechamento={fechamentoSelecionado?.status ?? null}
        totalFuncionarios={totalFuncionarios}
        totalCidades={totalCidades}
        vendedoresComVenda={vendedoresComVenda.size}
        resumo={resumo}
        resumoAnterior={resumoAnterior}
        totalAjustes={ajustesAgg._sum.valor ?? 0}
        tendencia={fechamentos.slice(-12).map((f) => ({
          periodo: f.periodo,
          vendido: f.valorTotalVendido,
          bonificacao: f.valorTotalBonificacao,
        }))}
        porCidade={Array.from(porCidadeMap.entries())
          .map(([cidade, v]) => ({ cidade, ...v }))
          .sort((a, b) => b.valor - a.valor)}
        mixProdutos={[
          { produto: "Internet", qtd: mix.internet },
          { produto: "Chip", qtd: mix.chip },
          { produto: "GPS", qtd: mix.gps },
          { produto: "TV", qtd: mix.tv },
          { produto: "Streaming", qtd: mix.streaming },
          { produto: "Telefonia Fixa", qtd: mix.telefoniaFixa },
        ]}
        composicao={[
          { componente: "Internet", valor: composicao.internet },
          { componente: "Chip", valor: composicao.chip },
          { componente: "Demais serviços", valor: composicao.demais },
          { componente: "Supervisor", valor: composicao.supervisor },
          { componente: "Ajustes", valor: ajustesAgg._sum.valor ?? 0 },
        ]}
        porCargo={Array.from(porCargoMap.entries())
          .map(([cargo, v]) => ({ cargo, ...v }))
          .sort((a, b) => b.vendido - a.vendido)}
        ranking={Array.from(rankingMap.values())}
      />
    </div>
  );
}
