"use client";

import {
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
import { AlertTriangle, FileDown } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatarReais } from "@/lib/constants-beneficios";
import type { LinhaAbsenteismo, LinhaCusto, LinhaHeadcount, ResultadoTurnover } from "@/lib/bi";
import { Indicador } from "@/components/indicador";

export function IndicadoresView({
  empresaId,
  qtdEmpresas,
  headcount,
  totalAtivos,
  totalHistorico,
  turnover,
  movimento,
  absenteismo,
  custo,
  comSalarioPreenchido,
}: {
  empresaId: string;
  qtdEmpresas: number;
  headcount: LinhaHeadcount[];
  totalAtivos: number;
  totalHistorico: number;
  turnover: ResultadoTurnover;
  movimento: { mes: string; admissoes: number; desligamentos: number }[];
  absenteismo: LinhaAbsenteismo[];
  custo: LinhaCusto[];
  comSalarioPreenchido: number;
}) {
  const custoTotal = custo.reduce((t, c) => t + c.total, 0);
  const absenteismoGeral =
    absenteismo.length > 0 ? absenteismo.reduce((t, a) => t + a.taxaPct, 0) / absenteismo.length : 0;
  const piorAbsenteismo = [...absenteismo].sort((a, b) => b.taxaPct - a.taxaPct)[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Indicadores</h2>
          <p className="text-sm text-muted-foreground">
            Colaboradores ativos, turnover, absenteísmo e custo de pessoal — calculados na hora a partir da ficha,
            das ausências e dos benefícios já cadastrados.
            {qtdEmpresas > 1 && ` Consolidado com os ${qtdEmpresas} CNPJs da marca.`}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          render={<a href={`/api/rh/${empresaId}/indicadores/csv`} />}
        >
          <FileDown className="size-4" />
          Exportar CSV
        </Button>
      </div>

      {comSalarioPreenchido < totalAtivos && (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertDescription>
            Só {comSalarioPreenchido} de {totalAtivos} colaboradores ativos têm salário preenchido na
            ficha — o custo de pessoal abaixo está subestimado até a base ser completada.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador variante="cartao"
          rotulo="Colaboradores ativos"
          valor={`${totalAtivos}`}
          complemento={`${totalHistorico} já passaram pela empresa`}
        />
        <Indicador variante="cartao"
          rotulo="Turnover (12 meses)"
          valor={`${turnover.taxaPct.toFixed(1)}%`}
          complemento={`${turnover.desligados} saída(s) · ${turnover.admissoes} admissão(ões)`}
          alerta={turnover.taxaPct > 20}
        />
        <Indicador variante="cartao"
          rotulo="Absenteísmo médio"
          valor={`${absenteismoGeral.toFixed(1)}%`}
          complemento={piorAbsenteismo ? `pior: ${piorAbsenteismo.setor} (${piorAbsenteismo.taxaPct.toFixed(1)}%)` : "últimos 30 dias"}
          alerta={absenteismoGeral > 3}
        />
        <Indicador variante="cartao" rotulo="Custo de pessoal/mês" valor={formatarReais(custoTotal)} complemento="folha + benefícios vigentes" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Colaboradores por setor</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {headcount.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Nenhum colaborador ativo.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={headcount} layout="vertical" margin={{ left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="setor" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => [`${v}`, "Colaboradores"]} />
                  <Bar dataKey="total" fill="#2563eb" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Admissões x desligamentos (12 meses)</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={movimento} margin={{ left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="admissoes" name="Admissões" stroke="#0d9488" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="desligamentos" name="Desligamentos" stroke="#dc2626" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Absenteísmo por setor (últimos 30 dias)</CardTitle>
          <CardDescription>% dos dias úteis disponíveis perdidos por falta não abonada.</CardDescription>
        </CardHeader>
        <CardContent>
          {absenteismo.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum setor com colaborador ativo.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Setor</TableHead>
                    <TableHead className="text-right">Dias de falta</TableHead>
                    <TableHead className="text-right">Taxa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {absenteismo.map((a) => (
                    <TableRow key={a.setor}>
                      <TableCell className="font-medium">{a.setor}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.diasFalta}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={a.taxaPct > 5 ? "destructive" : a.taxaPct > 2 ? "secondary" : "outline"}>
                          {a.taxaPct.toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Custo de pessoal por setor</CardTitle>
          <CardDescription>Salário base cadastrado + custo de benefícios vigentes, por mês.</CardDescription>
        </CardHeader>
        <CardContent>
          {custo.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum salário ou benefício cadastrado ainda.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Setor</TableHead>
                    <TableHead className="text-right">Folha</TableHead>
                    <TableHead className="text-right">Benefícios</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>% do total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {custo.map((c) => (
                    <TableRow key={c.setor}>
                      <TableCell className="font-medium">{c.setor}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatarReais(c.folha)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatarReais(c.beneficios)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatarReais(c.total)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {custoTotal > 0 ? Math.round((c.total / custoTotal) * 100) : 0}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

