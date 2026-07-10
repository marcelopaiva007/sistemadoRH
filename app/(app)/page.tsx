import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { periodoLabel } from "@/lib/periodo";

const fmtMoeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function HomePage() {
  const user = await requireUser();

  const [totalFuncionarios, totalCidades, fechamentoAberto] = await Promise.all([
    prisma.funcionario.count({ where: { ativo: true } }),
    prisma.cidade.count(),
    prisma.fechamentoMensal.findFirst({
      where: { status: "ABERTO" },
      orderBy: { periodo: "desc" },
    }),
  ]);

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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Funcionários ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{totalFuncionarios}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Cidades atendidas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{totalCidades}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Vendido no mês corrente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              {fechamentoAberto ? fmtMoeda(fechamentoAberto.valorTotalVendido) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {fechamentoAberto ? periodoLabel(fechamentoAberto.periodo) : "Nenhum mês em aberto"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Bonificação no mês corrente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              {fechamentoAberto ? fmtMoeda(fechamentoAberto.valorTotalBonificacao) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {fechamentoAberto ? "Aberto" : "Nenhum mês em aberto"}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
