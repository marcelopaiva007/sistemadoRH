import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { periodoLabel } from "@/lib/periodo";
import { FechamentoDetailView } from "./fechamento-detail-view";

export default async function FechamentoDetailPage({
  params,
}: {
  params: Promise<{ periodo: string }>;
}) {
  const user = await requireUser();
  const { periodo } = await params;

  if (!/^\d{4}-\d{2}$/.test(periodo)) notFound();

  const [fechamento, funcionarios] = await Promise.all([
    prisma.fechamentoMensal.findUnique({
      where: { periodo },
      include: {
        bonificacoes: {
          include: { funcionario: { include: { cidade: true } } },
          orderBy: { valorTotal: "desc" },
        },
        ajustes: { include: { funcionario: true }, orderBy: { createdAt: "desc" } },
        fechadoPor: true,
      },
    }),
    prisma.funcionario.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Fechamento — {periodoLabel(periodo)}
        </h1>
        <p className="text-muted-foreground">
          Bonificação calculada automaticamente a partir dos lançamentos do mês.
        </p>
      </div>
      <FechamentoDetailView
        periodo={periodo}
        fechamento={fechamento}
        funcionarios={funcionarios}
        role={user.role}
      />
    </div>
  );
}
