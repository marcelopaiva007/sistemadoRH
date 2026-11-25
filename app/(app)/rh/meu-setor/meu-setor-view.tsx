"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AMOSTRA_MINIMA_ANONIMATO } from "@/lib/constants-rh";

const estiloTooltip = {
  backgroundColor: "var(--card)",
  borderColor: "var(--border)",
  color: "var(--card-foreground)",
  borderRadius: 0,
  boxShadow: "none",
} as const;

type Resultado = {
  id: string;
  titulo: string;
  totalRespostas: number;
  // Decidido no servidor (26/11/2026): abaixo do piso de anonimato as médias
  // nem chegam aqui — `mediaPorDimensao` vem null.
  amostraInsuficiente: boolean;
  mediaPorDimensao: { dimensao: string; media: number }[] | null;
};

export function MeuSetorView({ resultados }: { resultados: Resultado[] }) {
  if (resultados.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma pesquisa ativa ou encerrada ainda.</p>;
  }

  return (
    <div className="space-y-4">
      {resultados.map((r) => (
        <Card key={r.id}>
          <CardHeader>
            <CardTitle className="text-base">{r.titulo}</CardTitle>
          </CardHeader>
          <CardContent>
            {r.amostraInsuficiente || !r.mediaPorDimensao ? (
              <p className="text-sm text-muted-foreground">
                Amostra insuficiente para exibir resultados ({r.totalRespostas} de {AMOSTRA_MINIMA_ANONIMATO} respostas
                mínimas necessárias para preservar o anonimato).
              </p>
            ) : r.mediaPorDimensao.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma pergunta de escala 1 a 5 com respostas suficientes para exibir média.
              </p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={r.mediaPorDimensao} margin={{ left: 0, right: 16 }}>
                    <XAxis dataKey="dimensao" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip contentStyle={estiloTooltip} formatter={(v) => Number(v).toFixed(2)} />
                    <Bar dataKey="media" name="Média" fill="var(--chart-2)" radius={4} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
