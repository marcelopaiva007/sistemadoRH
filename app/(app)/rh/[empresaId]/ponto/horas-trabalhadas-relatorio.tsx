"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DadoHorasTrabalhadas {
  colaboradorId: string;
  nome: string;
  totalHoras: number;
  totalMinutos: number;
  diasTrabalhados: number;
  horaMedia: number;
}

interface HorasTrabalhadasRelatorioProps {
  dados: DadoHorasTrabalhadas[];
  mesReferencia: string;
}

export function HorasTrabalhadasRelatorio({ dados, mesReferencia }: HorasTrabalhadasRelatorioProps) {
  if (!dados || dados.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Horas Trabalhadas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Sem dados disponíveis para este período.</p>
        </CardContent>
      </Card>
    );
  }

  // Dados para o gráfico
  const dadosGrafico = dados
    .sort((a, b) => (b.totalHoras + b.totalMinutos / 60) - (a.totalHoras + a.totalMinutos / 60))
    .slice(0, 15)
    .map((d) => ({
      nome: d.nome.split(" ")[0],
      horas: Math.round((d.totalHoras + d.totalMinutos / 60) * 10) / 10,
    }));

  const COLORS = ["#3b82f6", "#06b6d4", "#8b5cf6", "#ec4899", "#f59e0b"];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Horas Trabalhadas</h2>
        <p className="text-sm text-muted-foreground">Relatório de {mesReferencia}</p>
      </div>

      {/* Gráfico */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Top 15 Colaboradores por Horas Trabalhadas</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dadosGrafico}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="nome" angle={-45} textAnchor="end" height={80} />
              <YAxis label={{ value: "Horas", angle: -90, position: "insideLeft" }} />
              <Tooltip formatter={(value) => `${value}h`} />
              <Bar dataKey="horas" fill="#3b82f6">
                {dadosGrafico.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

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
                  <TableHead className="text-right">Total Horas</TableHead>
                  <TableHead className="text-right">Dias Trabalhados</TableHead>
                  <TableHead className="text-right">Hora Média</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dados.map((d) => (
                  <TableRow key={d.colaboradorId}>
                    <TableCell className="font-medium">{d.nome}</TableCell>
                    <TableCell className="text-right">
                      {d.totalHoras}h {d.totalMinutos}m
                    </TableCell>
                    <TableCell className="text-right">{d.diasTrabalhados}</TableCell>
                    <TableCell className="text-right">{d.horaMedia.toFixed(2)}h</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Resumo */}
      <Card className="bg-slate-50">
        <CardHeader>
          <CardTitle className="text-sm">Resumo do Período</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Total de Colaboradores</p>
              <p className="text-lg font-semibold">{dados.length}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total de Horas</p>
              <p className="text-lg font-semibold">
                {dados.reduce((sum, d) => sum + d.totalHoras, 0)}h
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Dias Trab. Médios</p>
              <p className="text-lg font-semibold">
                {Math.round(dados.reduce((sum, d) => sum + d.diasTrabalhados, 0) / dados.length)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Hora Média</p>
              <p className="text-lg font-semibold">
                {(
                  dados.reduce((sum, d) => sum + d.horaMedia, 0) / dados.length
                ).toFixed(2)}
                h
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
