import Link from "next/link";
import { requireUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { periodoLabel } from "@/lib/periodo";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const fmtMoeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function FechamentoListPage() {
  await requireUser();

  const fechamentos = await prisma.fechamentoMensal.findMany({
    orderBy: { periodo: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fechamento Mensal</h1>
        <p className="text-muted-foreground">
          Bonificação calculada automaticamente a partir dos lançamentos de cada mês.
        </p>
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Período</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Valor Vendido</TableHead>
              <TableHead className="text-right">Bonificação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fechamentos.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  Nenhum mês lançado ainda.
                </TableCell>
              </TableRow>
            )}
            {fechamentos.map((f) => (
              <TableRow key={f.id}>
                <TableCell>
                  <Link href={`/fechamento/${f.periodo}`} className="font-medium hover:underline">
                    {periodoLabel(f.periodo)}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={f.status === "FECHADO" ? "default" : "secondary"}>
                    {f.status === "FECHADO" ? "Fechado" : "Aberto"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{fmtMoeda(f.valorTotalVendido)}</TableCell>
                <TableCell className="text-right">{fmtMoeda(f.valorTotalBonificacao)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
