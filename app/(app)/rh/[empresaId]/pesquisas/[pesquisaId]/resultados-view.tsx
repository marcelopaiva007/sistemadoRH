"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { participacaoPct } from "@/lib/pesquisa-numeros";

export function ResultadosView({
  totalRespostas,
  convites,
  anonima,
  mediaPorDimensao,
  mediaPorSetor,
}: {
  totalRespostas: number;
  convites: number;
  anonima: boolean;
  mediaPorDimensao: { dimensao: string; media: number; respostas: number }[];
  mediaPorSetor: { setor: string; media: number; respostas: number }[];
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
        {totalRespostas === 0 ? (
          <p className="text-sm text-muted-foreground">Ainda não há respostas.</p>
        ) : (
          <>
            <div className="h-72">
              <p className="mb-2 text-sm font-medium">Média por dimensão GPTW</p>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={mediaPorDimensao} margin={{ left: 0, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="dimensao" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => Number(v).toFixed(2)} />
                  <Bar dataKey="media" name="Média" fill="var(--chart-2)" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="h-72">
              <p className="mb-2 text-sm font-medium">Média por setor</p>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={mediaPorSetor} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="setor" type="category" tick={{ fontSize: 12 }} width={100} />
                  <Tooltip formatter={(v) => Number(v).toFixed(2)} />
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
