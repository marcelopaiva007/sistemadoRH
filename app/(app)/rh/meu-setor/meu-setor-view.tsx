"use client";

import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AMOSTRA_MINIMA_ANONIMATO } from "@/lib/constants-rh";

type Resultado = {
  id: string;
  titulo: string;
  totalRespostas: number;
  mediaPorDimensao: { dimensao: string; media: number }[];
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
            {r.totalRespostas < AMOSTRA_MINIMA_ANONIMATO ? (
              <p className="text-sm text-muted-foreground">
                Amostra insuficiente para exibir resultados ({r.totalRespostas} de {AMOSTRA_MINIMA_ANONIMATO} respostas
                mínimas necessárias para preservar o anonimato).
              </p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={r.mediaPorDimensao} margin={{ left: 0, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="dimensao" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v) => Number(v).toFixed(2)} />
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
