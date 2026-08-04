"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Indicador } from "@/components/indicador";
import { formatarReais } from "@/lib/constants-beneficios";
import type {
  LinhaAbsenteismo,
  LinhaCusto,
  LinhaFaixaEtaria,
  LinhaHeadcount,
  ResultadoTurnover,
} from "@/lib/bi";

// Cores validadas contra daltonismo e contraste (validador do guia de
// dataviz, todos os pares PASS):
//   série única/azul  #2563eb   (= --chart-1 do tema)
//   admissões         #0d9488   × desligamentos #dc2626  (ΔE deutan 13.1)
//   folha             #2563eb   × benefícios    #d97706  (ΔE protan 32.3)
// Texto de rótulo/tooltip fica nos tokens de texto do tema, nunca na cor da
// série — a cor mora só na marca do gráfico.
const COR = {
  primaria: "#2563eb",
  admissoes: "#0d9488",
  desligamentos: "#dc2626",
  folha: "#2563eb",
  beneficios: "#d97706",
} as const;

const eixoTick = { fontSize: 11, fill: "var(--muted-foreground)" } as const;

export function PainelView({
  qtdEmpresas,
  totalAtivos,
  turnover,
  movimento,
  evolucao,
  headcount,
  absenteismo,
  custo,
  faixaEtaria,
  tempoDeCasa,
}: {
  qtdEmpresas: number;
  totalAtivos: number;
  turnover: ResultadoTurnover;
  movimento: { mes: string; admissoes: number; desligamentos: number }[];
  evolucao: { mes: string; total: number }[];
  headcount: LinhaHeadcount[];
  absenteismo: LinhaAbsenteismo[];
  custo: LinhaCusto[];
  faixaEtaria: LinhaFaixaEtaria[];
  tempoDeCasa: { anos: number; comData: number };
}) {
  const custoTotal = custo.reduce((t, c) => t + c.total, 0);
  const absenteismoGeral =
    absenteismo.length > 0
      ? absenteismo.reduce((t, a) => t + a.taxaPct, 0) / absenteismo.length
      : 0;
  const saldo12m = turnover.admissoes - turnover.desligados;

  // Top 8 setores no gráfico; o resto agregado — barra de "Outros" no fim em
  // vez de um gráfico com 20 categorias ilegíveis (regra do guia: não cicla
  // cor nem categoria; excedente vira "Outros").
  const TOP_SETORES = 8;
  const headcountTop = headcount.slice(0, TOP_SETORES);
  const resto = headcount.slice(TOP_SETORES).reduce((t, h) => t + h.total, 0);
  const headcountGrafico =
    resto > 0 ? [...headcountTop, { setor: "Outros", total: resto }] : headcountTop;

  const custoGrafico = (() => {
    const top = custo.slice(0, TOP_SETORES);
    const restoCusto = custo.slice(TOP_SETORES);
    if (restoCusto.length === 0) return top;
    const folha = restoCusto.reduce((t, c) => t + c.folha, 0);
    const beneficios = restoCusto.reduce((t, c) => t + c.beneficios, 0);
    return [...top, { setor: "Outros", folha, beneficios, total: folha + beneficios }];
  })();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Dashboard</h2>
        <p className="text-sm text-muted-foreground">
          A visão executiva do grupo — mesmos números da tela de Indicadores, em curvas.
          {qtdEmpresas > 1 && ` Consolidado com os ${qtdEmpresas} CNPJs da marca.`}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador
          variante="cartao"
          rotulo="Colaboradores ativos"
          valor={`${totalAtivos}`}
          complemento={
            saldo12m === 0
              ? "quadro estável em 12 meses"
              : `${saldo12m > 0 ? "+" : ""}${saldo12m} em 12 meses`
          }
        />
        <Indicador
          variante="cartao"
          rotulo="Turnover (12 meses)"
          valor={`${turnover.taxaPct.toFixed(1)}%`}
          complemento={`${turnover.desligados} saída(s) · ${turnover.admissoes} admissão(ões)`}
          alerta={turnover.taxaPct > 20}
        />
        <Indicador
          variante="cartao"
          rotulo="Tempo médio de casa"
          valor={`${tempoDeCasa.anos.toFixed(1)} ano(s)`}
          complemento={
            tempoDeCasa.comData < totalAtivos
              ? `${tempoDeCasa.comData} de ${totalAtivos} com admissão preenchida`
              : "toda a base com admissão preenchida"
          }
        />
        <Indicador
          variante="cartao"
          rotulo="Custo de pessoal/mês"
          valor={formatarReais(custoTotal)}
          complemento="folha + benefícios vigentes"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evolução do quadro (12 meses)</CardTitle>
            <CardDescription>Colaboradores ativos no fim de cada mês.</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={evolucao} margin={{ left: -16, right: 8 }}>
                <defs>
                  <linearGradient id="grad-headcount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COR.primaria} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={COR.primaria} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="mes" tick={eixoTick} tickLine={false} axisLine={false} />
                <YAxis
                  allowDecimals={false}
                  tick={eixoTick}
                  tickLine={false}
                  axisLine={false}
                  domain={["dataMin - 2", "dataMax + 2"]}
                />
                <Tooltip formatter={v => [`${v}`, "Ativos"]} />
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Admissões × desligamentos</CardTitle>
            <CardDescription>Movimentação mês a mês nos últimos 12 meses.</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={movimento} margin={{ left: -16, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="mes" tick={eixoTick} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={eixoTick} tickLine={false} axisLine={false} />
                <Tooltip />
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
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Colaboradores por setor</CardTitle>
            <CardDescription>
              {headcount.length > TOP_SETORES
                ? `Os ${TOP_SETORES} maiores setores; os demais somados em "Outros".`
                : "Todos os setores com gente ativa."}
            </CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {headcountGrafico.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Nenhum colaborador ativo.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={headcountGrafico} layout="vertical" margin={{ left: 16, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={eixoTick} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="setor" width={110} tick={eixoTick} tickLine={false} axisLine={false} />
                  <Tooltip formatter={v => [`${v}`, "Colaboradores"]} />
                  <Bar dataKey="total" fill={COR.primaria} radius={[0, 4, 4, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Faixa etária</CardTitle>
            <CardDescription>Distribuição de idade dos ativos.</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={faixaEtaria} margin={{ left: -16, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="faixa" tick={eixoTick} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={eixoTick} tickLine={false} axisLine={false} />
                <Tooltip formatter={v => [`${v}`, "Colaboradores"]} />
                <Bar dataKey="total" fill={COR.primaria} radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Custo de pessoal por setor</CardTitle>
          <CardDescription>
            Folha (salário base) + benefícios vigentes, por mês.
            {absenteismoGeral > 0 &&
              ` Absenteísmo médio do grupo nos últimos 30 dias: ${absenteismoGeral.toFixed(1)}%.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {custoGrafico.length === 0 ? (
            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Nenhum salário ou benefício cadastrado ainda.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={custoGrafico} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="setor" tick={eixoTick} tickLine={false} axisLine={false} />
                <YAxis
                  tick={eixoTick}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => `${Math.round(Number(v) / 1000)}k`}
                />
                <Tooltip formatter={(v, nome) => [formatarReais(Number(v)), nome]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="folha" name="Folha" stackId="custo" fill={COR.folha} maxBarSize={40} />
                <Bar
                  dataKey="beneficios"
                  name="Benefícios"
                  stackId="custo"
                  fill={COR.beneficios}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
