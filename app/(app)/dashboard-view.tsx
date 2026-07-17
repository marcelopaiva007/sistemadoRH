"use client";

import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  LabelList,
} from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { periodoLabel } from "@/lib/periodo";
import { CARGOS } from "@/lib/constants";

export type ResumoPeriodo = {
  vendido: number;
  bonificacao: number;
  lancadas: number;
  aprovadas: number;
  canceladas: number;
};

export type RankingLinha = {
  id: string;
  nome: string;
  cidade: string;
  cargo: string;
  aprovadas: number;
  valor: number;
  bonificacao: number;
};

const fmtMoeda = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtNum = (v: number) => v.toLocaleString("pt-BR");
const fmtPct = (v: number) =>
  `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

const cargoLabel = (cargo: string) =>
  CARGOS.find((c) => c.value === cargo)?.label ?? cargo;

function variacaoPct(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

function DeltaLinha({
  variacao,
  sufixo = "%",
  legenda,
}: {
  variacao: number | null;
  sufixo?: string;
  legenda: string;
}) {
  if (variacao === null) {
    return <p className="text-xs text-muted-foreground">Sem base de comparação</p>;
  }
  const Icone = variacao > 0.05 ? TrendingUp : variacao < -0.05 ? TrendingDown : Minus;
  const sinal = variacao > 0 ? "+" : "";
  return (
    <p className="flex items-center gap-1 text-xs text-muted-foreground">
      <Icone className="size-3.5" />
      {sinal}
      {variacao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
      {sufixo} {legenda}
    </p>
  );
}

function KpiCard({
  titulo,
  valor,
  sub,
  delta,
}: {
  titulo: string;
  valor: string;
  sub?: string;
  delta?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="text-2xl font-semibold">{valor}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        {delta}
      </CardContent>
    </Card>
  );
}

export function DashboardView({
  periodo,
  periodoAnterior,
  statusFechamento,
  totalFuncionarios,
  totalCidades,
  vendedoresComVenda,
  resumo,
  resumoAnterior,
  totalAjustes,
  tendencia,
  porCidade,
  mixProdutos,
  composicao,
  porCargo,
  ranking,
}: {
  periodo: string;
  periodoAnterior: string;
  statusFechamento: string | null;
  totalFuncionarios: number;
  totalCidades: number;
  vendedoresComVenda: number;
  resumo: ResumoPeriodo;
  resumoAnterior: ResumoPeriodo;
  totalAjustes: number;
  tendencia: { periodo: string; vendido: number; bonificacao: number }[];
  porCidade: { cidade: string; valor: number; aprovadas: number }[];
  mixProdutos: { produto: string; qtd: number }[];
  composicao: { componente: string; valor: number }[];
  porCargo: { cargo: string; vendido: number; bonificacao: number }[];
  ranking: RankingLinha[];
}) {
  const router = useRouter();
  const legendaAnterior = `vs ${periodoLabel(periodoAnterior)}`;

  const ticketMedio = resumo.aprovadas > 0 ? resumo.vendido / resumo.aprovadas : 0;
  const ticketMedioAnterior =
    resumoAnterior.aprovadas > 0 ? resumoAnterior.vendido / resumoAnterior.aprovadas : 0;
  const taxaCancelamento = resumo.lancadas > 0 ? (resumo.canceladas / resumo.lancadas) * 100 : 0;
  const taxaCancelamentoAnterior =
    resumoAnterior.lancadas > 0 ? (resumoAnterior.canceladas / resumoAnterior.lancadas) * 100 : 0;
  const pctBonificacao = resumo.vendido > 0 ? (resumo.bonificacao / resumo.vendido) * 100 : 0;

  const tendenciaData = tendencia.map((t) => ({ ...t, label: periodoLabel(t.periodo) }));
  const porCargoData = porCargo.map((c) => ({ ...c, label: cargoLabel(c.cargo) }));
  const aproveitamento = [
    { etapa: "Lançadas", qtd: resumo.lancadas },
    { etapa: "Aprovadas", qtd: resumo.aprovadas },
    { etapa: "Canceladas", qtd: resumo.canceladas },
  ];
  const composicaoVisivel = composicao.filter((c) => c.valor !== 0);

  const topBonificacao = [...ranking].sort((a, b) => b.bonificacao - a.bonificacao).slice(0, 10);
  const topVendas = [...ranking].sort((a, b) => b.valor - a.valor).slice(0, 10);

  const semDados = resumo.lancadas === 0 && resumo.vendido === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="month"
          value={periodo}
          onChange={(e) => e.target.value && router.push(`/?periodo=${e.target.value}`)}
          className="w-44"
        />
        {statusFechamento ? (
          <Badge variant={statusFechamento === "ABERTO" ? "outline" : "secondary"}>
            Fechamento {statusFechamento === "ABERTO" ? "aberto" : "fechado"}
          </Badge>
        ) : (
          <Badge variant="ghost">Sem fechamento neste período</Badge>
        )}
        {semDados && (
          <span className="text-sm text-muted-foreground">
            Nenhum lançamento em {periodoLabel(periodo)}.
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <KpiCard
          titulo="Valor vendido"
          valor={fmtMoeda(resumo.vendido)}
          delta={
            <DeltaLinha
              variacao={variacaoPct(resumo.vendido, resumoAnterior.vendido)}
              legenda={legendaAnterior}
            />
          }
        />
        <KpiCard
          titulo="Bonificação total"
          valor={fmtMoeda(resumo.bonificacao)}
          sub={resumo.vendido > 0 ? `${fmtPct(pctBonificacao)} do valor vendido` : undefined}
          delta={
            <DeltaLinha
              variacao={variacaoPct(resumo.bonificacao, resumoAnterior.bonificacao)}
              legenda={legendaAnterior}
            />
          }
        />
        <KpiCard
          titulo="Vendas aprovadas"
          valor={fmtNum(resumo.aprovadas)}
          sub={`de ${fmtNum(resumo.lancadas)} lançadas`}
          delta={
            <DeltaLinha
              variacao={variacaoPct(resumo.aprovadas, resumoAnterior.aprovadas)}
              legenda={legendaAnterior}
            />
          }
        />
        <KpiCard
          titulo="Taxa de cancelamento"
          valor={fmtPct(taxaCancelamento)}
          sub={`${fmtNum(resumo.canceladas)} canceladas`}
          delta={
            <DeltaLinha
              variacao={
                resumoAnterior.lancadas > 0 ? taxaCancelamento - taxaCancelamentoAnterior : null
              }
              sufixo=" p.p."
              legenda={legendaAnterior}
            />
          }
        />
        <KpiCard
          titulo="Ticket médio"
          valor={fmtMoeda(ticketMedio)}
          sub="por venda aprovada"
          delta={
            <DeltaLinha
              variacao={variacaoPct(ticketMedio, ticketMedioAnterior)}
              legenda={legendaAnterior}
            />
          }
        />
        <KpiCard
          titulo="Vendedores com venda"
          valor={fmtNum(vendedoresComVenda)}
          sub={`de ${fmtNum(totalFuncionarios)} funcionários ativos em ${fmtNum(totalCidades)} cidades`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tendência mensal — últimos 12 meses</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          {tendenciaData.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem histórico suficiente ainda.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tendenciaData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => fmtMoeda(Number(v))} width={90} />
                <Tooltip formatter={(v) => fmtMoeda(Number(v))} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="vendido"
                  name="Valor Vendido"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="bonificacao"
                  name="Bonificação"
                  stroke="var(--chart-4)"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Valor vendido por cidade — {periodoLabel(periodo)}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {porCidade.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem lançamentos neste período.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={porCidade} layout="vertical" margin={{ left: 24, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => fmtMoeda(Number(v))}
                  />
                  <YAxis dataKey="cidade" type="category" tick={{ fontSize: 12 }} width={90} />
                  <Tooltip
                    formatter={(v, name) =>
                      name === "Valor Vendido" ? fmtMoeda(Number(v)) : fmtNum(Number(v))
                    }
                  />
                  <Bar dataKey="valor" name="Valor Vendido" fill="var(--chart-2)" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Mix de produtos — {periodoLabel(periodo)}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {semDados ? (
              <p className="text-sm text-muted-foreground">Sem lançamentos neste período.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mixProdutos} layout="vertical" margin={{ left: 24, right: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
                  <YAxis dataKey="produto" type="category" tick={{ fontSize: 12 }} width={100} />
                  <Tooltip formatter={(v) => fmtNum(Number(v))} />
                  <Bar dataKey="qtd" name="Quantidade" fill="var(--chart-3)" radius={4}>
                    <LabelList
                      dataKey="qtd"
                      position="right"
                      className="fill-muted-foreground"
                      fontSize={12}
                      formatter={(v) => fmtNum(Number(v))}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Composição da bonificação — {periodoLabel(periodo)}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {composicaoVisivel.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sem bonificações calculadas neste período.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={composicaoVisivel}
                  layout="vertical"
                  margin={{ left: 24, right: 56 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => fmtMoeda(Number(v))}
                  />
                  <YAxis dataKey="componente" type="category" tick={{ fontSize: 12 }} width={90} />
                  <Tooltip formatter={(v) => fmtMoeda(Number(v))} />
                  <Bar dataKey="valor" name="Valor" fill="var(--chart-4)" radius={4}>
                    <LabelList
                      dataKey="valor"
                      position="right"
                      className="fill-muted-foreground"
                      fontSize={12}
                      formatter={(v) => fmtMoeda(Number(v))}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Aproveitamento de vendas — {periodoLabel(periodo)}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {semDados ? (
              <p className="text-sm text-muted-foreground">Sem lançamentos neste período.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={aproveitamento} layout="vertical" margin={{ left: 24, right: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
                  <YAxis dataKey="etapa" type="category" tick={{ fontSize: 12 }} width={90} />
                  <Tooltip formatter={(v) => fmtNum(Number(v))} />
                  <Bar dataKey="qtd" name="Quantidade" fill="var(--chart-2)" radius={4}>
                    <LabelList
                      dataKey="qtd"
                      position="right"
                      className="fill-muted-foreground"
                      fontSize={12}
                      formatter={(v) => fmtNum(Number(v))}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Desempenho por cargo — {periodoLabel(periodo)}
          </CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          {porCargoData.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem dados neste período.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porCargoData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => fmtMoeda(Number(v))} width={90} />
                <Tooltip formatter={(v) => fmtMoeda(Number(v))} />
                <Legend />
                <Bar dataKey="vendido" name="Valor Vendido" fill="var(--chart-2)" radius={4} />
                <Bar dataKey="bonificacao" name="Bonificação" fill="var(--chart-4)" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Ranking de funcionários — {periodoLabel(periodo)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="bonificacao">
            <TabsList>
              <TabsTrigger value="bonificacao">Top bonificação</TabsTrigger>
              <TabsTrigger value="vendas">Top vendas</TabsTrigger>
            </TabsList>
            <TabsContent value="bonificacao">
              <RankingTable linhas={topBonificacao} totalBonificacao={resumo.bonificacao} />
            </TabsContent>
            <TabsContent value="vendas">
              <RankingTable linhas={topVendas} totalBonificacao={resumo.bonificacao} />
            </TabsContent>
          </Tabs>
          {totalAjustes !== 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Ajustes manuais no período: {fmtMoeda(totalAjustes)} (já considerados na composição).
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RankingTable({
  linhas,
  totalBonificacao,
}: {
  linhas: RankingLinha[];
  totalBonificacao: number;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">#</TableHead>
          <TableHead>Funcionário</TableHead>
          <TableHead>Cidade</TableHead>
          <TableHead>Cargo</TableHead>
          <TableHead className="text-right">Aprovadas</TableHead>
          <TableHead className="text-right">Valor vendido</TableHead>
          <TableHead className="text-right">Bonificação</TableHead>
          <TableHead className="text-right">% da bonificação</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {linhas.length === 0 && (
          <TableRow>
            <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
              Sem dados neste período.
            </TableCell>
          </TableRow>
        )}
        {linhas.map((l, i) => (
          <TableRow key={l.id}>
            <TableCell className="text-muted-foreground">{i + 1}</TableCell>
            <TableCell className="font-medium">{l.nome}</TableCell>
            <TableCell>{l.cidade}</TableCell>
            <TableCell>{cargoLabel(l.cargo)}</TableCell>
            <TableCell className="text-right">{fmtNum(l.aprovadas)}</TableCell>
            <TableCell className="text-right">{fmtMoeda(l.valor)}</TableCell>
            <TableCell className="text-right">{fmtMoeda(l.bonificacao)}</TableCell>
            <TableCell className="text-right">
              {totalBonificacao > 0 ? fmtPct((l.bonificacao / totalBonificacao) * 100) : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
