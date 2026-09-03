"use client";

import { useState } from "react";
import { Scale, FileText, AlertCircle, CheckCircle2, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type DadosBancoHorasPortal = {
  competencia: string;
  saldoAnteriorMin: number;
  creditosMesMin: number;
  debitosMesMin: number;
  saldoAtualMin: number;
  expiraEm?: Date | string | null;
  historicoMensal: Array<{
    competencia: string;
    creditosMin: number;
    debitosMin: number;
    saldoMin: number;
  }>;
};

export function MeuBancoHorasCard({ dados }: { dados: DadosBancoHorasPortal }) {
  const formatarMinutosParaHoras = (minutos: number) => {
    const absMin = Math.abs(minutos);
    const h = Math.floor(absMin / 60);
    const m = absMin % 60;
    const sinal = minutos < 0 ? "-" : "+";
    return `${sinal}${h}h ${String(m).padStart(2, "0")}m`;
  };

  const eSaldoPositivo = dados.saldoAtualMin >= 0;

  return (
    <div className="space-y-4">
      {/* Resumo do Saldo de Banco de Horas */}
      <Card className="border shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 text-primary rounded-lg">
                <Scale className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-base">Meu Banco de Horas</CardTitle>
                <CardDescription className="text-xs">Competência Atual: {dados.competencia}</CardDescription>
              </div>
            </div>
            <Badge variant={eSaldoPositivo ? "default" : "destructive"} className="text-sm px-3 py-1 font-mono">
              {formatarMinutosParaHoras(dados.saldoAtualMin)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3 text-center border-t pt-3">
          <div className="p-2 bg-muted/40 rounded-lg">
            <span className="text-[11px] text-muted-foreground block">Créditos (H.E.)</span>
            <span className="text-sm font-semibold text-success flex items-center justify-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" />
              {formatarMinutosParaHoras(dados.creditosMesMin)}
            </span>
          </div>
          <div className="p-2 bg-muted/40 rounded-lg">
            <span className="text-[11px] text-muted-foreground block">Débitos (Atrasos)</span>
            <span className="text-sm font-semibold text-destructive flex items-center justify-center gap-1">
              <TrendingDown className="w-3.5 h-3.5" />
              {formatarMinutosParaHoras(dados.debitosMesMin)}
            </span>
          </div>
          <div className="p-2 bg-muted/40 rounded-lg">
            <span className="text-[11px] text-muted-foreground block">Saldo Anterior</span>
            <span className="text-sm font-medium text-foreground">
              {formatarMinutosParaHoras(dados.saldoAnteriorMin)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Histórico Recente de Banco de Horas */}
      <Card className="border shadow-xs">
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            Histórico das Últimas Competências
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {dados.historicoMensal.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">Nenhum histórico acumulado até o momento.</p>
          ) : (
            dados.historicoMensal.map((h, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs border-b pb-2 last:border-0 last:pb-0">
                <span className="font-medium text-foreground">{h.competencia}</span>
                <div className="flex items-center gap-3">
                  <span className="text-success">+{formatarMinutosParaHoras(h.creditosMin)}</span>
                  <span className="text-destructive">-{formatarMinutosParaHoras(h.debitosMin)}</span>
                  <span className={`font-semibold font-mono ${h.saldoMin >= 0 ? "text-primary" : "text-destructive"}`}>
                    {formatarMinutosParaHoras(h.saldoMin)}
                  </span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
