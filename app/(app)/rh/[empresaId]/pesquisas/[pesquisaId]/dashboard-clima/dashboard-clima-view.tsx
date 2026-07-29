"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FileDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import { classificarScore, classificarNPS, type ResultadoClima, type ResultadoComparativo } from "@/lib/clima";
import { dimensaoGPTWLabel } from "@/lib/constants-rh";

const CORES_RADAR = [
  "#3b82f6",
  "#8b5cf6",
  "#06b6d4",
  "#f59e0b",
  "#10b981",
  "#6b7280",
];

type Props = {
  pesquisa: { id: string; titulo: string; empresa: { nome: string }; status: string };
  empresaId: string;
  convites: number;
  resultado: ResultadoClima;
  comparativo: ResultadoComparativo | null;
};

export function DashboardClimaView({ pesquisa, empresaId, convites, resultado, comparativo }: Props) {
  const [baixando, setBaixando] = useState(false);

  async function baixarRelatorio() {
    setBaixando(true);
    try {
      const res = await fetch(
        `/api/rh/${empresaId}/pesquisas/${pesquisa.id}/relatorio-clima-pdf`,
      );
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-clima-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Erro ao gerar relatório: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBaixando(false);
    }
  }

  const clsGeral = classificarScore(resultado.scoreGeral);
  const participacao = convites > 0 ? Math.round((resultado.totalRespostas / convites) * 100) : 0;

  // Dados pro radar: dimensões com labels curtos
  const radarData = resultado.mediaPorDimensao.map((d, i) => ({
    dimensao: dimensaoGPTWLabel(d.dimensao),
    score: d.media100,
    media: Number(d.media.toFixed(2)),
    fullMark: 100,
    cor: CORES_RADAR[i % CORES_RADAR.length],
  }));

  // Dados pro comparativo
  const comparativoData = comparativo
    ? resultado.mediaPorDimensao.map((d) => {
        const ant = comparativo.variacao.find((v) => v.dimensao === d.dimensao);
        return {
          dimensao: dimensaoGPTWLabel(d.dimensao),
          Anterior: ant?.anterior ?? 0,
          Atual: d.media100,
        };
      })
    : null;

  // NPS
  const npsData = resultado.nps
    ? [
        { name: "Promotores", value: resultado.nps.promotores, color: "#16a34a" },
        { name: "Neutros", value: resultado.nps.neutros, color: "#f59e0b" },
        { name: "Detratores", value: resultado.nps.detratores, color: "#6b7280" },
      ]
    : null;

  if (resultado.totalRespostas === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Ainda não há respostas para exibir o dashboard.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Dashboard — {pesquisa.titulo}</h2>
          <p className="text-sm text-muted-foreground">{pesquisa.empresa.nome}</p>
        </div>
        <Button variant="outline" onClick={baixarRelatorio} disabled={baixando}>
          <FileDown className="size-4" />
          {baixando ? "Gerando..." : "Baixar PDF"}
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{resultado.totalRespostas}/{convites}</div>
            <p className="text-xs text-muted-foreground">Respostas ({participacao}%)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold" style={{ color: clsGeral.cor }}>
              {resultado.scoreGeral}
            </div>
            <p className="text-xs text-muted-foreground">Score Geral (0-100)</p>
            <Badge style={{ backgroundColor: clsGeral.cor }} className="mt-1 text-white">
              {clsGeral.label}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            {resultado.nps ? (
              <>
                <div className="text-2xl font-bold" style={{ color: classificarNPS(resultado.nps.score).cor }}>
                  {resultado.nps.score}
                </div>
                <p className="text-xs text-muted-foreground">NPS ({resultado.nps.total} respostas)</p>
                <Badge style={{ backgroundColor: classificarNPS(resultado.nps.score).cor }} className="mt-1 text-white">
                  {classificarNPS(resultado.nps.score).label}
                </Badge>
              </>
            ) : (
              <div className="text-muted-foreground">Sem pergunta NPS</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{resultado.mediaPorDimensao.length}</div>
            <p className="text-xs text-muted-foreground">Dimensões avaliadas</p>
          </CardContent>
        </Card>
      </div>

      {/* Radar + NPS */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Radar */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scores por Dimensão GPTW</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData} margin={{ top: 0, right: 24, bottom: 0, left: 24 }}>
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="dimensao" tick={{ fontSize: 12 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Radar
                  name="Score"
                  dataKey="score"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.3}
                />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* NPS ou Scores por dimensão */}
        {npsData ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">NPS — Distribuição</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={npsData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={80} />
                  <Tooltip />
                  <Bar dataKey="value" name="Colaboradores" radius={[0, 4, 4, 0]}>
                    {npsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-2 flex justify-center gap-4 text-xs">
                <span style={{ color: "#16a34a" }}>■ Promotores (9-10)</span>
                <span style={{ color: "#f59e0b" }}>■ Neutros (7-8)</span>
                <span style={{ color: "#6b7280" }}>■ Detratores (0-6)</span>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Scores Detalhados</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={resultado.mediaPorDimensao}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => Number(v).toFixed(2) + "/5"} />
                  <Bar dataKey="media" name="Média" radius={[4, 4, 0, 0]}>
                    {resultado.mediaPorDimensao.map((_, i) => (
                      <Cell key={`cell-${i}`} fill={CORES_RADAR[i % CORES_RADAR.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Comparativo */}
      {comparativoData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Comparativo com Ciclo Anterior</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={comparativoData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="dimensao" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="Anterior" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Atual" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Por setor */}
      {resultado.porSetor.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resultados por Setor</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {resultado.porSetor.map((s) => {
                const cls = classificarScore(s.media100);
                return (
                  <div key={s.setor} className="flex items-center gap-3">
                    <div className="w-32 text-sm truncate">{s.setor}</div>
                    <div className="flex-1">
                      <div className="flex justify-between text-xs mb-1">
                        <span>{s.respostas} resp.</span>
                        <span style={{ color: cls.cor }}>{s.media100} — {cls.label}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full transition-all"
                          style={{ width: `${s.media100}%`, backgroundColor: cls.cor }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
