"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type MesDeCusto = {
  mes: string;
  combustivel: number;
  manutencao: number;
  multas: number;
};

export type TopVeiculo = {
  placa: string;
  total: number;
};

// Azul do tema para combustível, âmbar para manutenção, vermelho para multa —
// multa é a única das três que é desperdício puro, e a cor diz isso sozinha.
const CORES = { combustivel: "#2563eb", manutencao: "#d97706", multas: "#dc2626" };

function real(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

/**
 * Os dois gráficos do Painel. Client component só por causa do recharts — todo
 * número já chega pronto do servidor; aqui não se calcula nada.
 */
export function GraficoCustoMensal({ dados }: { dados: MesDeCusto[] }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-base">Custo da frota, mês a mês</CardTitle>
        <CardDescription>
          Combustível/energia, manutenção e multas nos últimos 12 meses. Multa em vermelho de
          propósito: das três, é a única que é desperdício puro.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={dados} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="mes" fontSize={11} tickLine={false} />
            <YAxis fontSize={11} tickLine={false} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
            <Tooltip formatter={(v: unknown) => real(Number(v ?? 0))} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="combustivel" name="Combustível/energia" stackId="c" fill={CORES.combustivel} />
            <Bar dataKey="manutencao" name="Manutenção" stackId="c" fill={CORES.manutencao} />
            <Bar dataKey="multas" name="Multas" stackId="c" fill={CORES.multas} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function GraficoTopVeiculos({ dados }: { dados: TopVeiculo[] }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-base">Os veículos que mais custaram</CardTitle>
        <CardDescription>Total de 12 meses (combustível + manutenção + multas), os 5 maiores.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={Math.max(160, dados.length * 44)}>
          <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 0 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="placa" width={82} fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip formatter={(v: unknown) => real(Number(v ?? 0))} />
            <Bar
              dataKey="total"
              name="Total 12m"
              fill={CORES.combustivel}
              radius={[0, 3, 3, 0]}
              label={{ position: "right", fontSize: 11, formatter: (v: unknown) => real(Number(v)) }}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
