"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FileDown, AlertTriangle, MessageSquare, TrendingDown, Users, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  LineChart,
  Line,
  Legend,
} from "recharts";
import {
  classificarScore,
  classificarNPS,
  type ResultadoClima,
  type ResultadoComparativo,
  type EvolucaoCiclo,
} from "@/lib/clima";
import { dimensaoGPTWLabel } from "@/lib/constants-rh";

const CORES_DIM = [
  "#3b82f6", "#8b5cf6", "#06b6d4", "#f59e0b", "#10b981", "#6b7280",
];

const CORES_NIVEL: Record<string, string> = {
  critico: "#dc2626",
  atencao: "#f59e0b",
  bom: "#22c55e",
  excelente: "#16a34a",
};

type Props = {
  pesquisa: { id: string; titulo: string; empresa: { nome: string }; status: string };
  empresaId: string;
  convites: number;
  resultado: ResultadoClima;
  comparativo: ResultadoComparativo | null;
  evolucao: EvolucaoCiclo[];
};

export function DashboardClimaView({
  pesquisa, empresaId, convites, resultado, comparativo, evolucao,
}: Props) {
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
      toast.error("Erro: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBaixando(false);
    }
  }

  const clsGeral = classificarScore(resultado.scoreGeral);
  const participacao = convites > 0 ? Math.round((resultado.totalRespostas / convites) * 100) : 0;
  const alertas = resultado.mediaPorDimensao.filter(
    (d) => d.nivel === "critico" || d.nivel === "atencao",
  );

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
          {baixando ? "Gerando..." : "Relatório PDF executivo"}
        </Button>
      </div>

      {/* Alerta */}
      {alertas.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>
            {alertas.length} dimensão{alertas.length === 1 ? "" : "es"} em alerta
          </AlertTitle>
          <AlertDescription>
            {alertas.map((d) => d.label).join(", ")} — verifique o plano de ação recomendado.
          </AlertDescription>
        </Alert>
      )}

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
                <p className="text-xs text-muted-foreground">NPS ({resultado.nps.total} votos)</p>
                <Badge style={{ backgroundColor: classificarNPS(resultado.nps.score).cor }} className="mt-1 text-white">
                  {classificarNPS(resultado.nps.score).label}
                </Badge>
              </>
            ) : (
              <div className="text-muted-foreground">Sem NPS</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold" style={{ color: alertas.length > 0 ? "#dc2626" : "#22c55e" }}>
              {alertas.length}
            </div>
            <p className="text-xs text-muted-foreground">Dimensões em alerta</p>
            <p className="text-xs text-muted-foreground mt-1">
              {alertas.length === 0 ? "Tudo dentro do esperado" : "Requer atenção do RH"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Abas */}
      <Tabs defaultValue="visao" className="space-y-4">
        <TabsList>
          <TabsTrigger value="visao"><BarChart3 className="size-4" /> Visão Geral</TabsTrigger>
          <TabsTrigger value="setor"><Users className="size-4" /> Por Setor</TabsTrigger>
          <TabsTrigger value="alertas"><AlertTriangle className="size-4" /> Críticos</TabsTrigger>
          <TabsTrigger value="recomendacoes">Plano de Ação</TabsTrigger>
          <TabsTrigger value="historico">Evolução</TabsTrigger>
          <TabsTrigger value="comentarios"><MessageSquare className="size-4" /> Comentários</TabsTrigger>
        </TabsList>

        {/* Visão Geral */}
        <TabsContent value="visao" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Radar — Dimensões GPTW</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={resultado.mediaPorDimensao.map((d, i) => ({
                    dimensao: dimensaoGPTWLabel(d.dimensao),
                    score: d.media100,
                    fullMark: 100,
                  }))}>
                    <PolarGrid stroke="var(--border)" />
                    <PolarAngleAxis dataKey="dimensao" tick={{ fontSize: 11 }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <Radar name="Score" dataKey="score" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Scores por Dimensão</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {resultado.mediaPorDimensao.map((d, i) => (
                    <div key={d.dimensao}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">{d.label}</span>
                        <span style={{ color: CORES_NIVEL[d.nivel] }} className="font-bold">
                          {d.media100} — {classificarScore(d.media100).label}
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full transition-all"
                          style={{ width: `${d.media100}%`, backgroundColor: CORES_NIVEL[d.nivel] }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
          {resultado.nps && (
            <Card>
              <CardHeader><CardTitle className="text-base">NPS — Distribuição</CardTitle></CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="text-center">
                    <div className="text-3xl font-bold" style={{ color: "#16a34a" }}>
                      {resultado.nps.promotores}
                    </div>
                    <div className="text-xs text-muted-foreground">Promotores (9-10)</div>
                    <div className="text-xs">
                      {Math.round((resultado.nps.promotores / resultado.nps.total) * 100)}%
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold" style={{ color: "#f59e0b" }}>
                      {resultado.nps.neutros}
                    </div>
                    <div className="text-xs text-muted-foreground">Neutros (7-8)</div>
                    <div className="text-xs">
                      {Math.round((resultado.nps.neutros / resultado.nps.total) * 100)}%
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold" style={{ color: "#6b7280" }}>
                      {resultado.nps.detratores}
                    </div>
                    <div className="text-xs text-muted-foreground">Detratores (0-6)</div>
                    <div className="text-xs">
                      {Math.round((resultado.nps.detratores / resultado.nps.total) * 100)}%
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Por Setor */}
        <TabsContent value="setor" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Ranking de Setores</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {resultado.porSetor.map((s) => {
                  const cls = classificarScore(s.media100);
                  return (
                    <div key={s.setor} className="flex items-center gap-3">
                      <div className="w-8 text-center font-bold text-muted-foreground">
                        {s.ranking}
                      </div>
                      <div className="w-40 text-sm truncate">{s.setor}</div>
                      <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1">
                          <span>{s.respostas} resp.</span>
                          <span style={{ color: cls.cor }}>{s.media100} — {cls.label}</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full"
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

          {resultado.heatmap.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Heatmap — Setor × Dimensão</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="text-left p-2">Setor</th>
                        {resultado.mediaPorDimensao.map((d) => (
                          <th key={d.dimensao} className="text-center p-2 text-xs">
                            {d.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...new Set(resultado.heatmap.map((h) => h.setor))].map((setor) => (
                        <tr key={setor} className="border-t">
                          <td className="font-medium p-2">{setor}</td>
                          {resultado.mediaPorDimensao.map((d) => {
                            const cell = resultado.heatmap.find(
                              (h) => h.setor === setor && h.dimensao === d.dimensao,
                            );
                            const cor = cell ? CORES_NIVEL[cell.nivel] : "#f3f4f6";
                            return (
                              <td
                                key={d.dimensao}
                                className="p-2 text-center font-bold"
                                style={{
                                  backgroundColor: cell ? `${cor}1a` : "#f3f4f6",
                                  color: cor,
                                }}
                              >
                                {cell ? cell.media100 : "—"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Críticos */}
        <TabsContent value="alertas" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingDown className="size-4" />
                Top 5 Perguntas com Menor Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              {resultado.perguntasCriticas.length === 0 ? (
                <p className="text-muted-foreground">Nenhuma pergunta abaixo do limiar crítico.</p>
              ) : (
                <div className="space-y-3">
                  {resultado.perguntasCriticas.map((p, i) => {
                    const cor = CORES_NIVEL[
                      p.media100 < 40 ? "critico" : p.media100 < 60 ? "atencao" : "bom"
                    ];
                    return (
                      <div key={p.id} className="border-l-4 pl-3" style={{ borderColor: cor }}>
                        <div className="flex justify-between">
                          <span className="text-sm font-medium">#{i + 1} {p.enunciado}</span>
                          <span className="text-sm font-bold" style={{ color: cor }}>
                            {p.media100}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {p.dimensaoLabel} · {p.respostas} respostas · média {p.media.toFixed(2)}/5
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {resultado.demografia && (
            <Card>
              <CardHeader><CardTitle className="text-base">Análise Demográfica</CardTitle></CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  {resultado.demografia.porSexo.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Por sexo</h4>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={resultado.demografia.porSexo}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis dataKey="sexo" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Bar dataKey="count" name="Colaboradores" fill="#3b82f6" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {resultado.demografia.porFaixaEtaria.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Por faixa etária</h4>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={resultado.demografia.porFaixaEtaria}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis dataKey="faixa" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Bar dataKey="count" name="Colaboradores" fill="#8b5cf6" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Recomendações */}
        <TabsContent value="recomendacoes" className="space-y-4">
          {resultado.recomendacoes.filter((r) => r.nivel !== "bom" && r.nivel !== "excelente").length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                ✓ Todas as dimensões em nível Bom/Excelente. Continue o monitoramento.
              </CardContent>
            </Card>
          ) : (
            resultado.recomendacoes
              .filter((r) => r.nivel === "critico" || r.nivel === "atencao")
              .map((r) => (
                <Card key={r.dimensao} style={{ borderLeft: `4px solid ${CORES_NIVEL[r.nivel]}` }}>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center justify-between">
                      <span>{r.dimensaoLabel}</span>
                      <Badge style={{ backgroundColor: CORES_NIVEL[r.nivel] }} className="text-white">
                        {r.score} — {r.nivel.toUpperCase()}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-sm">
                      {r.acoes.map((a, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-muted-foreground">•</span>
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))
          )}
        </TabsContent>

        {/* Evolução */}
        <TabsContent value="historico" className="space-y-4">
          {evolucao.length < 2 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Histórico insuficiente — aguarde o próximo ciclo para ver a evolução.
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader><CardTitle className="text-base">Score Geral — Evolução</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={evolucao.map((e) => ({
                      ciclo: e.encerradaEm.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
                      "Score Geral": e.scoreGeral,
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="ciclo" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="Score Geral"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              {comparativo && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Comparativo com Ciclo Anterior</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={resultado.mediaPorDimensao.map((d) => {
                        const ant = comparativo.variacao.find((v) => v.dimensao === d.dimensao);
                        return {
                          dimensao: dimensaoGPTWLabel(d.dimensao),
                          Anterior: ant?.anterior ?? 0,
                          Atual: d.media100,
                        };
                      })}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="dimensao" tick={{ fontSize: 11 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="Anterior" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Atual" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* Comentários */}
        <TabsContent value="comentarios">
          <Card>
            <CardHeader><CardTitle className="text-base">Comentários dos Colaboradores</CardTitle></CardHeader>
            <CardContent>
              {resultado.comentarios.length === 0 ? (
                <p className="text-muted-foreground">Nenhum comentário textual.</p>
              ) : (
                <div className="space-y-3">
                  {resultado.comentarios.map((c, i) => (
                    <div key={i} className="border-l-2 border-muted pl-3 italic text-sm">
                      <p>"{c.texto}"</p>
                      <p className="text-xs text-muted-foreground mt-1">— {c.setor}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
