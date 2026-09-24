"use client";

import { Users, Clock, AlertCircle, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DadosIndicadores {
  totalColaboradores: number;
  presentes: number;
  ausentes: number;
  atrasos: number;
  saidasAntecipadas: number;
  horaMediaTrabalhada: number;
  horasExtrasTotais: number;
}

interface IndicadoresDashboardProps {
  dados: DadosIndicadores;
  mesReferencia: string;
}

export function IndicadoresDashboard({ dados, mesReferencia }: IndicadoresDashboardProps) {
  const taxaPontualidade = dados.totalColaboradores > 0
    ? Math.round(((dados.totalColaboradores - dados.atrasos) / dados.totalColaboradores) * 100)
    : 0;

  const taxaAbsenteismo = dados.totalColaboradores > 0
    ? Math.round((dados.ausentes / dados.totalColaboradores) * 100)
    : 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Dashboard de Indicadores</h2>
        <p className="text-sm text-muted-foreground">Relatório de {mesReferencia}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total de Colaboradores */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Total de Colaboradores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dados.totalColaboradores}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {dados.presentes} presentes, {dados.ausentes} ausentes
            </p>
          </CardContent>
        </Card>

        {/* Taxa de Pontualidade */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="w-4 h-4 text-green-600" />
              Pontualidade
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{taxaPontualidade}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {dados.atrasos} atrasos detectados
            </p>
          </CardContent>
        </Card>

        {/* Taxa de Absenteísmo */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-orange-600" />
              Absenteísmo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{taxaAbsenteismo}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {dados.ausentes} colaboradores ausentes
            </p>
          </CardContent>
        </Card>

        {/* Hora Média + Extras */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              Horas Extras
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dados.horasExtrasTotais}h</div>
            <p className="text-xs text-muted-foreground mt-1">
              Média: {dados.horaMediaTrabalhada}h/dia
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Saídas Antecipadas */}
      {dados.saidasAntecipadas > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="text-sm text-yellow-900">Saídas Antecipadas Detectadas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-yellow-800">
              {dados.saidasAntecipadas} colaborador(es) tiveram saída(s) antecipada(s) neste período.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
