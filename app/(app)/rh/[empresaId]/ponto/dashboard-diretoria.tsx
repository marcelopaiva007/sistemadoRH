"use client";

import { useState } from "react";
import { DollarSign, ShieldAlert, AlertTriangle, TrendingUp, TrendingDown, Clock, Scale } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type MetricadDiretoriaPonto = {
  custoEstimadoHE: number;
  totalHorasExtras50Min: number;
  totalHorasExtras100Min: number;
  passivoBancoHorasMin: number;
  valorPassivoBancoHorasR$: number;
  violacoesLimite2h: number;
  supressoesIntervalo: number;
  taxaAbsenteismoPct: number;
};

export function DashboardDiretoriaPontoView({ dados }: { dados: MetricadDiretoriaPonto }) {
  const formatarMinutosHoras = (minutos: number) => {
    const abs = Math.abs(minutos);
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return `${h}h ${String(m).padStart(2, "0")}m`;
  };

  const formatarMoeda = (valor: number) => {
    return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">Dashboard Executivo de Ponto & Governança Trabalhista</h2>
        <p className="text-xs text-muted-foreground">
          Indicadores de custos com Horas Extras, passivo de Banco de Horas e auditoria de riscos CLT (Art. 59 e Art. 71).
        </p>
      </div>

      {/* Bloco 1: Gestão Financeira da Jornada */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4 bg-emerald-500/10 border-emerald-500/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Custo Est. Horas Extras (Mês)</span>
            <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono mt-2 block">
            {formatarMoeda(dados.custoEstimadoHE)}
          </span>
          <span className="text-[10px] text-muted-foreground block mt-1">
            Total H.E: {formatarMinutosHoras(dados.totalHorasExtras50Min + dados.totalHorasExtras100Min)}
          </span>
        </Card>

        <Card className="p-4 bg-amber-500/10 border-amber-500/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Valoração Passivo Banco Horas</span>
            <Scale className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <span className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 font-mono mt-2 block">
            {formatarMoeda(dados.valorPassivoBancoHorasR$)}
          </span>
          <span className="text-[10px] text-muted-foreground block mt-1">
            Saldo acumulado: {formatarMinutosHoras(dados.passivoBancoHorasMin)}
          </span>
        </Card>

        <Card className="p-4 bg-primary/10 border-primary/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Taxa de Absenteísmo Global</span>
            <TrendingDown className="w-4 h-4 text-primary" />
          </div>
          <span className="text-2xl font-extrabold text-primary font-mono mt-2 block">
            {dados.taxaAbsenteismoPct.toFixed(1)}%
          </span>
          <span className="text-[10px] text-muted-foreground block mt-1">Lost Time Rate (Perdas de jornada)</span>
        </Card>
      </div>

      {/* Bloco 2: Governança & Alertas de Risco Trabalhista (CLT) */}
      <Card className="border-rose-500/30 bg-card">
        <CardHeader className="py-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            <CardTitle className="text-sm">Alertas de Compliance & Riscos CLT (MTE)</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-0">
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-foreground block">Violação do Limite de 2h Extra/Dia</span>
              <span className="text-[11px] text-muted-foreground">Risco de autuação fiscal pelo MTE (CLT Art. 59)</span>
            </div>
            <Badge variant="destructive" className="text-sm font-mono px-2.5">
              {dados.violacoesLimite2h} casos
            </Badge>
          </div>

          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-foreground block">Supressão do Intervalo de Almoço</span>
              <span className="text-[11px] text-muted-foreground">Obrigatório 1h p/ jornada &gt; 6h (CLT Art. 71)</span>
            </div>
            <Badge variant="secondary" className="text-sm font-mono px-2.5 bg-amber-500/20 text-amber-600 dark:text-amber-400">
              {dados.supressoesIntervalo} casos
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
