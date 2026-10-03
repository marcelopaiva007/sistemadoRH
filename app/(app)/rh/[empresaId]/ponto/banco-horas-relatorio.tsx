"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TrendingUp } from "lucide-react";

interface DadoBancoHoras {
  colaboradorId: string;
  nome: string;
  saldoAnterior: number;
  creditosMes: number;
  debitosMes: number;
  saldoAtual: number;
  saldoEmHoras: string;
}

interface BancoHorasRelatorioProps {
  dados: DadoBancoHoras[];
  competencia: string;
}

export function BancoHorasRelatorio({ dados, competencia }: BancoHorasRelatorioProps) {
  if (!dados || dados.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Banco de Horas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Sem dados disponíveis para este período.</p>
        </CardContent>
      </Card>
    );
  }

  // Contar saldos
  const comCredito = dados.filter((d) => d.saldoAtual > 0).length;
  const comDebito = dados.filter((d) => d.saldoAtual < 0).length;
  const zerado = dados.filter((d) => d.saldoAtual === 0).length;

  const dadosGrafico = [
    { name: "Com Crédito", value: comCredito },
    { name: "Com Débito", value: comDebito },
    { name: "Zerado", value: zerado },
  ].filter((d) => d.value > 0);

  const COLORS = ["#10b981", "#ef4444", "#6b7280"];

  // Resumo
  const totalCreditos = dados.reduce((sum, d) => sum + d.creditosMes, 0);
  const totalDebitos = dados.reduce((sum, d) => sum + d.debitosMes, 0);
  const totalSaldo = dados.reduce((sum, d) => sum + d.saldoAtual, 0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Banco de Horas</h2>
        <p className="text-sm text-muted-foreground">Referência: {competencia}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Gráfico de Pizza */}
        {dadosGrafico.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Distribuição de Saldos</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={dadosGrafico}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {dadosGrafico.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Cards de Resumo */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total de Colaboradores</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dados.length}</div>
            </CardContent>
          </Card>

          <Card className="bg-green-50 border-green-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-900">Com Crédito</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{comCredito}</div>
              <p className="text-xs text-green-700 mt-1">+{totalCreditos} min</p>
            </CardContent>
          </Card>

          <Card className="bg-red-50 border-red-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-red-900">Com Débito</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{comDebito}</div>
              <p className="text-xs text-red-700 mt-1">-{totalDebitos} min</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Tabela Detalhada */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Detalhamento Completo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead className="text-right">Saldo Anterior</TableHead>
                  <TableHead className="text-right">Créditos</TableHead>
                  <TableHead className="text-right">Débitos</TableHead>
                  <TableHead className="text-right">Saldo Atual</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dados.map((d) => (
                  <TableRow key={d.colaboradorId}>
                    <TableCell className="font-medium">{d.nome}</TableCell>
                    <TableCell className="text-right text-sm">
                      {Math.floor(d.saldoAnterior / 60)}h {Math.abs(d.saldoAnterior) % 60}m
                    </TableCell>
                    <TableCell className="text-right text-sm">+{Math.floor(d.creditosMes / 60)}h</TableCell>
                    <TableCell className="text-right text-sm">-{Math.floor(d.debitosMes / 60)}h</TableCell>
                    <TableCell
                      className={`text-right text-sm font-semibold ${
                        d.saldoAtual > 0
                          ? "text-green-600"
                          : d.saldoAtual < 0
                            ? "text-red-600"
                            : "text-gray-600"
                      }`}
                    >
                      {d.saldoEmHoras}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Resumo Total */}
      <Card className="bg-slate-50">
        <CardHeader>
          <CardTitle className="text-sm">Resumo Geral</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Total Créditos</p>
              <p className="text-lg font-semibold">+{Math.floor(totalCreditos / 60)}h</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Débitos</p>
              <p className="text-lg font-semibold">-{Math.floor(totalDebitos / 60)}h</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Saldo Total</p>
              <p className={`text-lg font-semibold ${totalSaldo >= 0 ? "text-green-600" : "text-red-600"}`}>
                {totalSaldo >= 0 ? "+" : ""}{Math.floor(totalSaldo / 60)}h
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
