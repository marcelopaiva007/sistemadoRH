import { requireUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { periodoAtual, periodoLabel } from "@/lib/periodo";
import { Logo } from "@/components/logo";
import { RelatoriosView } from "./relatorios-view";

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  await requireUser();
  const params = await searchParams;

  const fechamentos = await prisma.fechamentoMensal.findMany({
    orderBy: { periodo: "asc" },
  });

  const periodo = params.periodo ?? fechamentos.at(-1)?.periodo ?? periodoAtual();
  const fechamentoSelecionado = fechamentos.find((f) => f.periodo === periodo) ?? null;

  const [bonificacoes, lancamentos] = await Promise.all([
    prisma.bonificacaoCalculada.findMany({
      where: { fechamento: { periodo } },
      include: { funcionario: { include: { cidade: true } } },
      orderBy: { valorTotal: "desc" },
    }),
    prisma.lancamentoVenda.findMany({
      where: { periodo },
      include: { funcionario: { include: { cidade: true } } },
    }),
  ]);

  const tendencia = fechamentos.map((f) => ({
    periodo: f.periodo,
    label: periodoLabel(f.periodo),
    vendido: f.valorTotalVendido,
    bonificacao: f.valorTotalBonificacao,
  }));

  const porCidadeMap = new Map<string, number>();
  for (const l of lancamentos) {
    const nome = l.funcionario.cidade?.nome ?? "Sem cidade";
    porCidadeMap.set(nome, (porCidadeMap.get(nome) ?? 0) + l.valorInstalado);
  }
  const porCidade = Array.from(porCidadeMap.entries())
    .map(([cidade, valor]) => ({ cidade, valor }))
    .sort((a, b) => b.valor - a.valor);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Logo width={160} height={40} className="h-10 w-auto" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
          <p className="text-muted-foreground">
            Visão consolidada de vendas e bonificação por período e cidade.
          </p>
        </div>
      </div>
      <RelatoriosView
        periodo={periodo}
        periodosDisponiveis={fechamentos.map((f) => f.periodo)}
        tendencia={tendencia}
        porCidade={porCidade}
        totalVendido={fechamentoSelecionado?.valorTotalVendido ?? 0}
        totalBonificacao={fechamentoSelecionado?.valorTotalBonificacao ?? 0}
        bonificacoes={bonificacoes.map((b) => ({
          id: b.id,
          nome: b.funcionario.nome,
          cidade: b.funcionario.cidade?.nome ?? "—",
          valorTotal: b.valorTotal,
        }))}
      />
    </div>
  );
}
