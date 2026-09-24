/**
 * Seções de gráficos do Painel — renderizadas apenas no browser com ssr:false
 * Recharts é pesado no servidor; este arquivo evita que ele rode lá.
 */

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LinhaHeadcount, LinhaFaixaEtaria, LinhaCusto } from "@/lib/bi";
import type { ResumoTempoDeCasa, LinhaTempoDeCasaPorGrupo } from "@/lib/tempo-de-casa";
import type { LinhaCustoNaTela } from "./painel-view";

const COR = {
  primaria: "var(--chart-1)",
  admissoes: "var(--chart-3)",
  desligamentos: "var(--destructive)",
  folha: "var(--chart-1)",
  beneficios: "var(--chart-4)",
} as const;

const estiloTooltip = {
  backgroundColor: "var(--card)",
  borderColor: "var(--border)",
  color: "var(--card-foreground)",
  borderRadius: 0,
  boxShadow: "none",
} as const;

const eixoTick = { fontSize: 11, fill: "var(--muted-foreground)" } as const;
const TOP_SETORES = 8;

// --- Evolução do Quadro ---
export function GraficoEvolucaoQuadro({
  evolucao,
}: {
  evolucao: { mes: string; total: number }[];
}) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={evolucao} margin={{ left: -16, right: 8 }}>
          <defs>
            <linearGradient id="grad-headcount" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COR.primaria} stopOpacity={0.25} />
              <stop offset="100%" stopColor={COR.primaria} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="mes" tick={eixoTick} tickLine={false} axisLine={false} />
          <YAxis
            allowDecimals={false}
            tick={eixoTick}
            tickLine={false}
            axisLine={false}
            domain={["dataMin - 2", "dataMax + 2"]}
          />
          <Tooltip contentStyle={estiloTooltip} formatter={v => [`${v}`, "Ativos"]} />
          <Area
            type="monotone"
            dataKey="total"
            stroke={COR.primaria}
            strokeWidth={2}
            fill="url(#grad-headcount)"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Admissões × Desligamentos ---
export function GraficoMovimento({
  movimento,
}: {
  movimento: { mes: string; admissoes: number; desligamentos: number }[];
}) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={movimento} margin={{ left: -16, right: 8 }}>
          <XAxis dataKey="mes" tick={eixoTick} tickLine={false} axisLine={false} />
          <YAxis
            allowDecimals={false}
            tick={eixoTick}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip contentStyle={estiloTooltip} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="admissoes"
            name="Admissões"
            stroke={COR.admissoes}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="desligamentos"
            name="Desligamentos"
            stroke={COR.desligamentos}
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Colaboradores por Setor ---
function agruparOutros(headcount: LinhaHeadcount[]): LinhaHeadcount[] {
  const topo = headcount.slice(0, TOP_SETORES);
  const resto = headcount.slice(TOP_SETORES).reduce((t, h) => t + h.total, 0);
  return resto > 0 ? [...topo, { setor: "Outros", total: resto }] : topo;
}

export function GraficoHeadcount({ headcount }: { headcount: LinhaHeadcount[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={agruparOutros(headcount)}
          layout="vertical"
          margin={{ left: 16, right: 24 }}
        >
          <XAxis
            type="number"
            allowDecimals={false}
            tick={eixoTick}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="setor"
            width={110}
            tick={eixoTick}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip contentStyle={estiloTooltip} formatter={v => [`${v}`, "Colaboradores"]} />
          <Bar
            dataKey="total"
            fill={COR.primaria}
            radius={[0, 4, 4, 0]}
            maxBarSize={18}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Faixa Etária ---
export function GraficoFaixaEtaria({ faixaEtaria }: { faixaEtaria: LinhaFaixaEtaria[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={faixaEtaria} margin={{ left: -16, right: 8 }}>
          <XAxis dataKey="faixa" tick={eixoTick} tickLine={false} axisLine={false} />
          <YAxis
            allowDecimals={false}
            tick={eixoTick}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip contentStyle={estiloTooltip} formatter={v => [`${v}`, "Colaboradores"]} />
          <Bar dataKey="total" fill={COR.primaria} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Tempo de Casa ---
export function GraficoTempoDeCasa({ tempo, totalAtivos }: { tempo: ResumoTempoDeCasa; totalAtivos: number }) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={tempo.faixas} margin={{ left: -16, right: 8, bottom: 8 }}>
          <XAxis
            dataKey="faixa"
            tick={{ ...eixoTick, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval={0}
            angle={-20}
            textAnchor="end"
            height={50}
          />
          <YAxis
            allowDecimals={false}
            tick={eixoTick}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip formatter={v => [`${v}`, "Colaboradores"]} />
          <Bar dataKey="total" fill={COR.primaria} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Custo por Setor ---
function agruparOutrosCusto(custo: LinhaCustoNaTela[]): LinhaCusto[] {
  const topo = custo.slice(0, TOP_SETORES);
  const resto = custo.slice(TOP_SETORES);
  if (resto.length === 0) return topo;
  const folha = resto.reduce((t, c) => t + c.folha, 0);
  const beneficios = resto.reduce((t, c) => t + c.beneficios, 0);
  return [...topo, { setor: "Outros", folha, beneficios, total: folha + beneficios }];
}

export function GraficoCusto({ custo }: { custo: LinhaCustoNaTela[] }) {
  const confiaveis = custo.filter(c => c.folhaConfiavel);

  if (confiaveis.length === 0) return null;

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={agruparOutrosCusto(confiaveis)} margin={{ left: 8, right: 8 }}>
          <XAxis dataKey="setor" tick={eixoTick} tickLine={false} axisLine={false} />
          <YAxis
            tick={eixoTick}
            tickLine={false}
            axisLine={false}
            tickFormatter={v => `${Math.round(Number(v) / 1000)}k`}
          />
          <Tooltip formatter={(v, nome) => {
            const formatarReais = (n: number) =>
              new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
            return [formatarReais(Number(v)), nome];
          }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            dataKey="folha"
            name="Folha"
            stackId="custo"
            fill={COR.folha}
            maxBarSize={40}
          />
          <Bar
            dataKey="beneficios"
            name="Benefícios"
            stackId="custo"
            fill={COR.beneficios}
            maxBarSize={40}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
