"use client";

import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { periodoLabel } from "@/lib/periodo";

const fmtMoeda = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

type Tendencia = { periodo: string; label: string; vendido: number; bonificacao: number };
type PorCidade = { cidade: string; valor: number };
type BonificacaoLinha = { id: string; nome: string; cidade: string; valorTotal: number };

export function RelatoriosView({
  periodo,
  periodosDisponiveis,
  tendencia,
  porCidade,
  totalVendido,
  totalBonificacao,
  bonificacoes,
}: {
  periodo: string;
  periodosDisponiveis: string[];
  tendencia: Tendencia[];
  porCidade: PorCidade[];
  totalVendido: number;
  totalBonificacao: number;
  bonificacoes: BonificacaoLinha[];
}) {
  const router = useRouter();
  const top5 = bonificacoes.slice(0, 5);

  async function handleExportar() {
    const XLSX = await import("xlsx");
    const wsData = [
      ["L&M Telecom"],
      [`Relatório de Bonificação — ${periodoLabel(periodo)}`],
      [],
      ["Funcionário", "Cidade", "Bonificação"],
      ...bonificacoes.map((b) => [b.nome, b.cidade, b.valorTotal]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bonificacao");
    XLSX.writeFile(wb, `bonificacao-${periodo}.xlsx`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Input
            type="month"
            value={periodo}
            onChange={(e) => router.push(`/relatorios?periodo=${e.target.value}`)}
            className="w-44"
          />
          {periodosDisponiveis.length === 0 && (
            <span className="text-sm text-muted-foreground">Nenhum mês com dados ainda.</span>
          )}
        </div>
        <Button variant="outline" onClick={handleExportar} disabled={bonificacoes.length === 0}>
          <Download className="size-4" />
          Exportar Excel — {periodoLabel(periodo)}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Valor vendido — {periodoLabel(periodo)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{fmtMoeda(totalVendido)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Bonificação total — {periodoLabel(periodo)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{fmtMoeda(totalBonificacao)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tendência mensal</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          {tendencia.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem histórico suficiente ainda.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tendencia} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => fmtMoeda(Number(v))} width={90} />
                <Tooltip formatter={(v) => fmtMoeda(Number(v))} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="vendido"
                  name="Valor Vendido"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="bonificacao"
                  name="Bonificação"
                  stroke="var(--chart-4)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Valor vendido por cidade — {periodoLabel(periodo)}</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {porCidade.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem lançamentos neste período.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={porCidade} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => fmtMoeda(Number(v))} />
                  <YAxis dataKey="cidade" type="category" tick={{ fontSize: 12 }} width={90} />
                  <Tooltip formatter={(v) => fmtMoeda(Number(v))} />
                  <Bar dataKey="valor" name="Valor Vendido" fill="var(--chart-2)" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top 5 bonificações — {periodoLabel(periodo)}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead className="text-right">Bonificação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {top5.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                      Sem bonificações calculadas neste período.
                    </TableCell>
                  </TableRow>
                )}
                {top5.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.nome}</TableCell>
                    <TableCell>{b.cidade}</TableCell>
                    <TableCell className="text-right">{fmtMoeda(b.valorTotal)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
