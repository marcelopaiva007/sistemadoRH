"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { participacaoPct } from "@/lib/pesquisa-numeros";
import type { ResultadoEnps } from "@/lib/pesquisa-enps-resultado";
import type { ApuracaoPergunta } from "@/lib/pesquisa-apuracao";

const estiloTooltip = {
  backgroundColor: "var(--card)",
  borderColor: "var(--border)",
  color: "var(--card-foreground)",
  borderRadius: 0,
  boxShadow: "none",
} as const;

export function ResultadosView({
  totalRespostas,
  convites,
  anonima,
  porPergunta,
  mediaPorDimensao,
  mediaPorSetor,
  resultadoEnps,
}: {
  totalRespostas: number;
  convites: number;
  anonima: boolean;
  /** Uma entrada por pergunta, na ordem do formulário (lib/pesquisa-apuracao.ts). */
  porPergunta: ApuracaoPergunta[];
  mediaPorDimensao: { dimensao: string; media: number; respostas: number }[];
  mediaPorSetor: { setor: string; media: number; respostas: number }[];
  /** Quando a pesquisa é P05-ENPS: score/zona já calculados (lib/pesquisa-enps-resultado.ts). Os gráficos genéricos de dimensão/setor não fazem sentido pra 1 pergunta de nota — este card substitui os dois. */
  resultadoEnps?: ResultadoEnps | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Resultados ({totalRespostas} de {convites} —{" "}
          {participacaoPct(totalRespostas, convites)}%)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {anonima && (
          <p className="text-xs text-muted-foreground">
            Pesquisa anônima: os agregados abaixo nunca identificam quem respondeu.
          </p>
        )}
        {/* PERGUNTA A PERGUNTA vem PRIMEIRO, antes dos gráficos de dimensão.
            Os gráficos abaixo só enxergam nota numérica e existem para a
            pesquisa de clima; numa pesquisa de múltipla escolha eles aparecem
            vazios, e era só isso que a tela mostrava. O que responde "manter
            ou cancelar" é a distribuição de cada pergunta. */}
        {totalRespostas > 0 && porPergunta.length > 0 && (
          <div className="space-y-5">
            {porPergunta.map((q) => (
              <div key={q.perguntaId} className="rounded-lg border p-4">
                <p className="text-sm font-medium">
                  {q.ordem}. {q.enunciado}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {q.respondentes} resposta(s)
                  {q.media !== null && ` · média ${q.media.toFixed(1)}`}
                </p>

                {q.distribuicao.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {q.distribuicao.map((fatia) => (
                      <li key={fatia.rotulo} className="space-y-1">
                        <div className="flex items-baseline justify-between gap-3 text-xs">
                          <span>{fatia.rotulo}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {fatia.quantidade} · {fatia.percentual}%
                          </span>
                        </div>
                        {/* Barra em vez de gráfico: são poucas opções por
                            pergunta, e a proporção se lê direto. */}
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${fatia.percentual}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {q.textos.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {q.textos.map((t, i) => (
                      <li key={i} className="rounded-md bg-muted/40 p-2 text-xs">
                        {t}
                      </li>
                    ))}
                  </ul>
                )}

                {q.distribuicao.length === 0 && q.textos.length === 0 && (
                  <p className="mt-3 text-xs text-muted-foreground">Ninguém respondeu esta pergunta.</p>
                )}
              </div>
            ))}
          </div>
        )}

        {totalRespostas === 0 ? (
          <p className="text-sm text-muted-foreground">Ainda não há respostas.</p>
        ) : resultadoEnps ? (
          <div className="rounded-lg border p-6 text-center">
            <p className="text-sm text-muted-foreground">eNPS</p>
            <p className="text-5xl font-bold" style={{ color: resultadoEnps.zona?.cor }}>
              {resultadoEnps.score}
            </p>
            {resultadoEnps.zona && (
              <p className="mt-1 text-sm font-medium" style={{ color: resultadoEnps.zona.cor }}>
                {resultadoEnps.zona.rotulo}
              </p>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              {resultadoEnps.promotores} promotor(es) · {resultadoEnps.neutros} neutro(s) · {resultadoEnps.detratores} detrator(es) —{" "}
              {resultadoEnps.total} nota(s)
            </p>
          </div>
        ) : (
          <>
            <div className="h-72">
              <p className="mb-2 text-sm font-medium">Média por dimensão GPTW</p>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={mediaPorDimensao} margin={{ left: 0, right: 16 }}>
                  <XAxis dataKey="dimensao" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={estiloTooltip} formatter={(v) => Number(v).toFixed(2)} />
                  <Bar dataKey="media" name="Média" fill="var(--chart-2)" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="h-72">
              <p className="mb-2 text-sm font-medium">Média por setor</p>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={mediaPorSetor} layout="vertical" margin={{ left: 24 }}>
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="setor" type="category" tick={{ fontSize: 12 }} width={100} />
                  <Tooltip contentStyle={estiloTooltip} formatter={(v) => Number(v).toFixed(2)} />
                  <Bar dataKey="media" name="Média" fill="var(--chart-4)" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
