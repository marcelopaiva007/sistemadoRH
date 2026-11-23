"use client";

import { FileDown, MessageSquare, TrendingDown, TrendingUp, Minus, Users, Gauge, ShieldCheck } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  LineChart,
  Line,
  Legend,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AnaliseGerencial, Tom } from "@/lib/pesquisa-analise";

const estiloTooltip = {
  backgroundColor: "var(--card)",
  borderColor: "var(--border)",
  color: "var(--card-foreground)",
  borderRadius: 0,
  boxShadow: "none",
} as const;

const COR_TOM: Record<Tom, string> = {
  negativo: "var(--chart-2)",
  misto: "var(--chart-3)",
  positivo: "var(--success)",
};
const ROTULO_TOM: Record<Tom, string> = { negativo: "a melhorar", misto: "neutro / dividido", positivo: "elogio" };

const ROTULO_PRIORIDADE = { alta: "Alta", media: "Média", baixa: "Baixa" } as const;

function fmt(n: number | null, escala: string): string {
  if (n === null) return "—";
  if (escala === "enps") return n > 0 ? `+${n}` : String(n);
  if (escala === "favorabilidade") return `${n}%`;
  return String(n);
}

function Kpi({
  icone,
  rotulo,
  valor,
  detalhe,
  cor,
}: {
  icone: React.ReactNode;
  rotulo: string;
  valor: string;
  detalhe?: string;
  cor?: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 py-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icone}
          {rotulo}
        </div>
        <p className="text-3xl font-semibold tabular-nums" style={cor ? { color: cor } : undefined}>
          {valor}
        </p>
        {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
      </CardContent>
    </Card>
  );
}

export function DashboardPesquisaView({
  empresaId,
  pesquisa,
  analise,
}: {
  empresaId: string;
  pesquisa: { id: string; titulo: string; empresaNome: string; anonima: boolean };
  analise: AnaliseGerencial;
}) {
  const urlRelatorio = `/api/rh/${empresaId}/pesquisas/${pesquisa.id}/relatorio-pdf`;
  const esc = analise.indicador.escala;

  const botaoRelatorio = (
    <Button variant="outline" render={<a href={urlRelatorio} target="_blank" rel="noreferrer" />}>
      <FileDown className="size-4" />
      Relatório de análise gerencial
    </Button>
  );

  if (analise.respostas === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Ainda não há respostas para montar o dashboard.
        </CardContent>
      </Card>
    );
  }

  const comp = analise.comparativo;
  const IconeTendencia =
    comp?.tendencia === "melhora" ? TrendingUp : comp?.tendencia === "queda" ? TrendingDown : Minus;

  // Distribuição de notas 0-10 (pergunta NPS) e grupos.
  const perguntaNps = analise.perguntas.find((p) => p.tipo === "NPS_10");
  const distribuicaoNotas = perguntaNps
    ? Array.from({ length: 11 }, (_, n) => {
        const f = perguntaNps.distribuicao.find((d) => d.rotulo === String(n));
        return { nota: String(n), quantidade: f?.quantidade ?? 0, grupo: n >= 9 ? "promotor" : n >= 7 ? "neutro" : "detrator" };
      })
    : [];
  const corGrupo = { promotor: "var(--success)", neutro: "var(--chart-3)", detrator: "var(--chart-2)" } as const;

  const perguntasComNota = analise.perguntas
    .filter((p) => p.nota100 !== null && p.tipo !== "NPS_10")
    .map((p) => ({ pergunta: `${p.ordem}. ${p.enunciado}`, nota: p.nota100 as number }));

  const setoresComNumero = analise.setores
    .filter((s) => !s.amostraInsuficiente)
    .map((s) => ({ setor: s.setor, valor: (esc === "enps" ? s.enps : s.nota100) ?? 0, respostas: s.respostas }));
  const setoresOcultos = analise.setores.filter((s) => s.amostraInsuficiente);

  const temasGrafico = analise.temas.map((t) => ({ tema: t.tema, quantidade: t.quantidade, tom: t.tom }));

  const serie = analise.serie.map((p) => ({
    ciclo: p.titulo,
    indicador: p.indicador,
    participacao: p.participacao,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Dashboard de análise gerencial</h2>
          <p className="text-sm text-muted-foreground">
            {pesquisa.empresaNome}
            {pesquisa.anonima && " · pesquisa anônima: nenhum número identifica quem respondeu"}
          </p>
        </div>
        {botaoRelatorio}
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icone={<Users className="size-4" />}
          rotulo="Participação"
          valor={`${analise.participacao}%`}
          detalhe={`${analise.respostas} de ${analise.convites} · adesão ${
            analise.nivelParticipacao === "boa" ? "boa" : analise.nivelParticipacao === "razoavel" ? "razoável" : "baixa"
          }`}
          cor={analise.nivelParticipacao === "baixa" ? "var(--chart-2)" : undefined}
        />
        <Kpi
          icone={<Gauge className="size-4" />}
          rotulo={analise.indicador.nome}
          valor={fmt(analise.indicador.valor, esc)}
          detalhe={analise.indicador.zona ? `Zona ${analise.indicador.zona.rotulo}` : undefined}
          cor={analise.indicador.zona?.cor}
        />
        <Kpi
          icone={<IconeTendencia className="size-4" />}
          rotulo="Frente ao ciclo anterior"
          valor={comp?.variacao != null ? (comp.variacao > 0 ? `+${comp.variacao}` : String(comp.variacao)) : "—"}
          detalhe={comp ? `${comp.tituloAnterior}: ${fmt(comp.indicadorAnterior, esc)}` : "Primeiro ciclo deste tipo"}
          cor={comp?.tendencia === "queda" ? "var(--chart-2)" : comp?.tendencia === "melhora" ? "var(--success)" : undefined}
        />
        <Kpi
          icone={<MessageSquare className="size-4" />}
          rotulo="Comentários"
          valor={String(analise.totalComentarios)}
          detalhe={analise.temas[0] ? `Mais citado: ${analise.temas[0].tema}` : "Nenhum comentário aberto"}
        />
      </div>

      {/* Resumo executivo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumo executivo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-relaxed">
          {analise.resumo.map((f, i) => (
            <p key={i}>{f}</p>
          ))}
        </CardContent>
      </Card>

      {/* Indicador principal */}
      <div className="grid gap-4 lg:grid-cols-2">
        {analise.enps && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Promotores, neutros e detratores</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex h-8 w-full overflow-hidden">
                {(["promotores", "neutros", "detratores"] as const).map((g) => {
                  const pct = Math.round((analise.enps![g] / analise.enps!.total) * 100);
                  const cor = g === "promotores" ? corGrupo.promotor : g === "neutros" ? corGrupo.neutro : corGrupo.detrator;
                  return pct > 0 ? (
                    <div
                      key={g}
                      className="flex items-center justify-center text-xs font-medium text-white"
                      style={{ width: `${pct}%`, background: cor }}
                      title={`${g}: ${analise.enps![g]}`}
                    >
                      {pct >= 8 ? `${pct}%` : ""}
                    </div>
                  ) : null;
                })}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <p className="text-lg font-semibold" style={{ color: corGrupo.promotor }}>{analise.enps.promotores}</p>
                  Promotores (9-10)
                </div>
                <div>
                  <p className="text-lg font-semibold" style={{ color: corGrupo.neutro }}>{analise.enps.neutros}</p>
                  Neutros (7-8)
                </div>
                <div>
                  <p className="text-lg font-semibold" style={{ color: corGrupo.detrator }}>{analise.enps.detratores}</p>
                  Detratores (0-6)
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {distribuicaoNotas.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Distribuição das notas (0 a 10)</CardTitle>
            </CardHeader>
            <CardContent className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distribuicaoNotas}>
                  <XAxis dataKey="nota" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={28} />
                  <Tooltip contentStyle={estiloTooltip} />
                  <Bar dataKey="quantidade" name="Respostas">
                    {distribuicaoNotas.map((d) => (
                      <Cell key={d.nota} fill={corGrupo[d.grupo as keyof typeof corGrupo]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {perguntasComNota.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Nota por pergunta (0 a 100)</CardTitle>
            </CardHeader>
            <CardContent style={{ height: Math.max(160, perguntasComNota.length * 34) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perguntasComNota} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <YAxis dataKey="pergunta" type="category" width={280} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={estiloTooltip} />
                  <Bar dataKey="nota" name="Nota">
                    {perguntasComNota.map((p) => (
                      <Cell key={p.pergunta} fill={p.nota >= 75 ? "var(--success)" : p.nota >= 60 ? "var(--chart-3)" : "var(--chart-2)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Evolução */}
      {serie.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evolução entre ciclos</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serie} margin={{ right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="ciclo" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} width={36} />
                <Tooltip contentStyle={estiloTooltip} />
                <Legend />
                <Line type="monotone" dataKey="indicador" name={analise.indicador.nome} stroke="var(--chart-1)" strokeWidth={2} />
                <Line type="monotone" dataKey="participacao" name="Participação %" stroke="var(--chart-3)" strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Setores e temas */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {esc === "enps" ? "eNPS por setor" : "Nota por setor (0 a 100)"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {setoresComNumero.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum setor com respostas suficientes para mostrar sem identificar ninguém.</p>
            ) : (
              <div style={{ height: Math.max(140, setoresComNumero.length * 32) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={setoresComNumero} layout="vertical" margin={{ left: 8, right: 24 }}>
                    <XAxis type="number" domain={esc === "enps" ? [-100, 100] : [0, 100]} tick={{ fontSize: 12 }} />
                    <YAxis dataKey="setor" type="category" width={140} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={estiloTooltip} />
                    <Bar dataKey="valor" name={esc === "enps" ? "eNPS" : "Nota"}>
                      {setoresComNumero.map((s) => (
                        <Cell
                          key={s.setor}
                          fill={
                            esc === "enps"
                              ? s.valor >= 31 ? "var(--success)" : s.valor >= 0 ? "var(--chart-3)" : "var(--chart-2)"
                              : s.valor >= 75 ? "var(--success)" : s.valor >= 60 ? "var(--chart-3)" : "var(--chart-2)"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {setoresOcultos.length > 0 && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
                Sem número por terem poucas respostas (proteção do anonimato):{" "}
                {setoresOcultos.map((s) => `${s.setor} (${s.respostas})`).join(", ")}.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assuntos dos comentários</CardTitle>
          </CardHeader>
          <CardContent>
            {temasGrafico.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum comentário aberto.</p>
            ) : (
              <>
                <div style={{ height: Math.max(140, temasGrafico.length * 30) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={temasGrafico} layout="vertical" margin={{ left: 8, right: 24 }}>
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                      <YAxis dataKey="tema" type="category" width={170} tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={estiloTooltip} />
                      <Bar dataKey="quantidade" name="Comentários">
                        {temasGrafico.map((t) => (
                          <Cell key={t.tema} fill={COR_TOM[t.tom]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {(Object.keys(COR_TOM) as Tom[]).map((t) => (
                    <span key={t} className="flex items-center gap-1">
                      <span className="inline-block size-2.5" style={{ background: COR_TOM[t] }} />
                      {ROTULO_TOM[t]}
                    </span>
                  ))}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* O que dizem, por tema */}
      {analise.temas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">O que as pessoas dizem</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {analise.temas.map((t) => (
              <div key={t.tema} className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{t.tema}</p>
                  <span className="text-xs text-muted-foreground">
                    {t.quantidade} · {t.percentual}% ·{" "}
                    <span style={{ color: COR_TOM[t.tom] }}>{ROTULO_TOM[t.tom]}</span>
                  </span>
                </div>
                {analise.enps && (
                  <p className="text-xs text-muted-foreground">
                    {t.porGrupo.promotor} de promotores · {t.porGrupo.neutro} de neutros · {t.porGrupo.detrator} de detratores
                  </p>
                )}
                <ul className="space-y-1.5">
                  {t.exemplos.map((e, i) => (
                    <li key={i} className="bg-muted/40 p-2 text-xs italic">
                      “{e}”
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Pontos fortes e de atenção */}
      {(analise.pontosFortes.length > 0 || analise.pontosAtencao.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pontos fortes</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {analise.pontosFortes.map((p, i) => (
                  <li key={i} className="border-l-2 pl-3" style={{ borderColor: "var(--success)" }}>
                    <p className="font-medium">{p.titulo}</p>
                    <p className="text-xs text-muted-foreground">{p.detalhe}</p>
                  </li>
                ))}
                {analise.pontosFortes.length === 0 && <li className="text-muted-foreground">—</li>}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pontos de atenção</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {analise.pontosAtencao.map((p, i) => (
                  <li key={i} className="border-l-2 pl-3" style={{ borderColor: "var(--chart-2)" }}>
                    <p className="font-medium">{p.titulo}</p>
                    <p className="text-xs text-muted-foreground">{p.detalhe}</p>
                  </li>
                ))}
                {analise.pontosAtencao.length === 0 && <li className="text-muted-foreground">—</li>}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recomendações */}
      {analise.recomendacoes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recomendações para a gestão</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {analise.recomendacoes.map((r, i) => (
                <li key={i} className="flex gap-3 border-b pb-3 last:border-b-0 last:pb-0">
                  <span className="w-5 shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                  <div className="flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{r.titulo}</p>
                      <Badge variant={r.prioridade === "alta" ? "destructive" : r.prioridade === "media" ? "default" : "secondary"}>
                        Prioridade {ROTULO_PRIORIDADE[r.prioridade]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{r.detalhe}</p>
                    <p className="text-xs">
                      <span className="text-muted-foreground">Responsável sugerido:</span> {r.responsavel}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
