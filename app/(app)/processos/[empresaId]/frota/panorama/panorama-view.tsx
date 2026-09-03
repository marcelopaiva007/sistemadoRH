"use client";

import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type Fatia = { rotulo: string; valor: number };

// Um gráfico só, reusado em toda quebra da frota (idade, categoria, motorização,
// propriedade, cidade, setor). Client component apenas por causa do recharts —
// todo número já chega pronto do servidor; aqui não se calcula nada. Barra
// horizontal porque os rótulos são texto (placa de cidade, "Combustão"), e
// texto lê melhor deitado do que virado no eixo X.
const AZUL = "var(--chart-1)";

function veiculos(v: number): string {
  return `${v.toLocaleString("pt-BR")} ${v === 1 ? "veículo" : "veículos"}`;
}

export function GraficoBarras({
  titulo,
  descricao,
  dados,
  cor = AZUL,
}: {
  titulo: string;
  descricao?: string;
  dados: Fatia[];
  cor?: string;
}) {
  // Altura cresce com o número de barras — evita barras espremidas quando há
  // muitas cidades e evita um card oco quando há três motorizações.
  const altura = Math.max(132, dados.length * 40 + 28);
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-base">{titulo}</CardTitle>
        {descricao && <CardDescription>{descricao}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={altura}>
          <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 44, left: 8, bottom: 0 }}>
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="rotulo"
              width={132}
              fontSize={12}
              tickLine={false}
              axisLine={false}
              interval={0}
            />
            <Tooltip
              formatter={(v: unknown) => [veiculos(Number(v ?? 0)), ""] as [string, string]}
              cursor={{ fill: "currentColor", opacity: 0.06 }}
            />
            <Bar dataKey="valor" fill={cor} radius={[0, 3, 3, 0]}>
              <LabelList dataKey="valor" position="right" fontSize={11} className="fill-muted-foreground" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
