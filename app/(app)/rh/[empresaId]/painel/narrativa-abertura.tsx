"use client";

import Link from "next/link";
import { ArrowRight, TriangleAlert, TrendingUp, Waypoints } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Narrativa, GravidadeFato, DestinoFato } from "@/lib/narrativa";

/**
 * "O que aconteceu" — a abertura em prosa do Painel, acima da grade de KPI.
 *
 * A grade de números continua abaixo: ela dá o contexto contínuo (quanto),
 * este bloco dá a notícia do período (o que mudou e por quê vale olhar). Os
 * fatos já vêm prontos de `lib/narrativa.ts` — a tela só decide a cor do badge
 * e a rota do botão, nunca recalcula nem reescreve a frase.
 */

const COR_GRAVIDADE: Record<GravidadeFato, string> = {
  critica: "border-destructive/40 bg-destructive/5",
  alta: "border-border bg-card",
  media: "border-border bg-card",
};

const ICONE_FAMILIA = {
  pico: TriangleAlert,
  saldo: TrendingUp,
  lideranca: Waypoints,
} as const;

function hrefDoDestino(empresaId: string, destino: DestinoFato): string {
  switch (destino.tipo) {
    case "plano-acao":
      return `/rh/${destino.empresaId}/planos-acao`;
    case "placar":
      return `/rh/${empresaId}/placar`;
    case "lideranca":
      return `/rh/${empresaId}/lideranca`;
  }
}

export function NarrativaAbertura({
  empresaId,
  narrativa,
}: {
  empresaId: string;
  narrativa: Narrativa;
}) {
  if (narrativa.fatos.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 py-6 text-sm">
          <TrendingUp className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground">{narrativa.fraseSemFatos}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">O que aconteceu</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {narrativa.fatos.map(f => {
          const Icone = ICONE_FAMILIA[f.familia];
          return (
            <div
              key={f.chave}
              className={cn("rounded-lg border p-3 text-sm", COR_GRAVIDADE[f.gravidade])}
            >
              <div className="flex items-start gap-2">
                <Icone
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    f.gravidade === "critica" ? "text-destructive" : "text-muted-foreground"
                  )}
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <p>{f.fato}</p>
                  <p className="text-xs text-muted-foreground">{f.causaProvavel}</p>
                </div>
                <Badge variant={f.gravidade === "critica" ? "destructive" : "outline"} className="shrink-0">
                  {f.gravidade === "critica" ? "Crítica" : f.gravidade === "alta" ? "Alta" : "Média"}
                </Badge>
              </div>
              <Link
                href={hrefDoDestino(empresaId, f.destino)}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                {f.destino.rotulo}
                <ArrowRight className="size-3" />
              </Link>
            </div>
          );
        })}
        {narrativa.totalCandidatos > narrativa.fatos.length && (
          <p className="text-xs text-muted-foreground">
            {narrativa.totalCandidatos - narrativa.fatos.length} outro(s) fato(s) de menor gravidade
            não entraram na lista — o Radar de desvio e a Malha de liderança abaixo têm o detalhe
            completo.
          </p>
        )}
        {narrativa.avisos.map((a, i) => (
          <p key={i} className="text-xs text-muted-foreground">
            {a}
          </p>
        ))}
      </CardContent>
    </Card>
  );
}
