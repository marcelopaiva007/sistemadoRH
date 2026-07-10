import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { periodoAtual } from "@/lib/periodo";
import { LancamentosView } from "./lancamentos-view";

export default async function LancamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const periodo = params.periodo ?? periodoAtual();

  const [funcionarios, lancamentos, fechamento] = await Promise.all([
    prisma.funcionario.findMany({
      where: { ativo: true },
      orderBy: { nome: "asc" },
      include: { cidade: true },
    }),
    prisma.lancamentoVenda.findMany({
      where: { periodo },
      orderBy: { createdAt: "desc" },
      include: { funcionario: { include: { cidade: true } } },
    }),
    prisma.fechamentoMensal.findUnique({ where: { periodo } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lançamentos de Vendas</h1>
        <p className="text-muted-foreground">
          Lance as vendas do mês por funcionário. A bonificação é recalculada
          automaticamente a cada lançamento.
        </p>
      </div>
      <LancamentosView
        periodo={periodo}
        funcionarios={funcionarios}
        lancamentos={lancamentos}
        fechado={fechamento?.status === "FECHADO"}
      />
    </div>
  );
}
