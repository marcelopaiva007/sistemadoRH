"use client";

import { useState } from "react";
import { Bar, BarChart, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CabecalhoDePagina } from "@/components/padroes/cabecalho-de-pagina";
import { Segmentado } from "@/components/padroes/barra-de-filtros";
import type { LinhaAno, MesDaComparacao } from "@/lib/desligamentos/analises";
import type { FiltrosDaArea } from "@/lib/desligamentos/area";
import { cn } from "@/lib/utils";
import { BotaoExportarPdf, FiltrosDaAreaBarra } from "../filtros-da-area";
import { CrescimentoNegocioDialog } from "./crescimento-dialog";

const CORES = {
  admissoes: "var(--success)",
  desligamentos: "var(--chart-2)",
  quadro: "var(--chart-1)",
  clientes: "#3b5bdb",
  faturamento: "#7d7979",
};

function pct(v: number | null, sinal = false): string {
  if (v === null) return "—";
  const texto = `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  return sinal && v > 0 ? `+${texto}` : texto;
}

export function ComparacoesView({
  empresaId,
  serie24,
  anos,
  filtros,
  nomeDoRecorte,
  podeConfigurar,
  avisos,
}: {
  empresaId: string;
  serie24: MesDaComparacao[];
  anos: LinhaAno[];
  filtros: FiltrosDaArea;
  nomeDoRecorte: string | null;
  podeConfigurar: boolean;
  avisos: string[];
}) {
  const [janela, setJanela] = useState<"12" | "24">("12");
  const serie = janela === "12" ? serie24.slice(-12) : serie24;
  const atual = anos[anos.length - 1];
  const temNegocio = anos.some((a) => a.crescimentoClientesPct !== null || a.crescimentoFaturamentoPct !== null);
  const equipeNegocio = anos.map((a) => ({
    ano: String(a.ano),
    equipe: a.crescimentoQuadroPct,
    clientes: a.crescimentoClientesPct,
    faturamento: a.crescimentoFaturamentoPct,
  }));

  return (
    <div className="space-y-6">
      <CabecalhoDePagina
        titulo="Comparações"
        resumo={
          atual ? (
            <>
              Em {atual.ano}
              {nomeDoRecorte ? `, no ${nomeDoRecorte}` : ""}, o quadro{" "}
              {atual.crescimentoQuadroPct === null
                ? "não tem base de comparação com o ano anterior"
                : <>variou <b className="text-foreground">{pct(atual.crescimentoQuadroPct, true)}</b> sobre {atual.ano - 1}</>}
              {atual.crescimentoClientesPct !== null && <>; clientes {pct(atual.crescimentoClientesPct, true)}</>}
              {atual.crescimentoFaturamentoPct !== null && <>; faturamento {pct(atual.crescimentoFaturamentoPct, true)}</>}.
            </>
          ) : null
        }
        acoes={
          <>
            <BotaoExportarPdf empresaId={empresaId} />
            <CrescimentoNegocioDialog empresaId={empresaId} anos={anos} podeConfigurar={podeConfigurar} />
          </>
        }
      />

      <FiltrosDaAreaBarra filtros={filtros} mostrarPeriodo={false} />

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Admissões × desligamentos, mês a mês</CardTitle>
              <CardDescription>Transferência entre empresas do grupo fica fora das duas barras. A linha é o quadro no fim de cada mês.</CardDescription>
            </div>
            <Segmentado
              rotulo="Janela do gráfico"
              valor={janela}
              aoMudar={setJanela}
              opcoes={[
                { valor: "12", label: "12 meses" },
                { valor: "24", label: "24 meses" },
              ]}
            />
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={serie} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <XAxis dataKey="mes" fontSize={11} tickLine={false} />
              <YAxis yAxisId="mov" fontSize={11} tickLine={false} allowDecimals={false} width={32} />
              <YAxis yAxisId="quadro" orientation="right" fontSize={11} tickLine={false} allowDecimals={false} width={40} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="mov" dataKey="admissoes" name="Admissões" fill={CORES.admissoes} radius={[3, 3, 0, 0]} />
              <Bar yAxisId="mov" dataKey="desligamentos" name="Desligamentos" fill={CORES.desligamentos} radius={[3, 3, 0, 0]} />
              <Line yAxisId="quadro" type="monotone" dataKey="quadro" name="Quadro no fim do mês" stroke={CORES.quadro} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ano contra ano</CardTitle>
          <CardDescription>
            % do quadro = desligamentos ÷ quadro médio do ano. Ativos no fim do ano: em 31/12 (no ano corrente, hoje).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table compacta>
            <TableHeader>
              <TableRow>
                <TableHead>Ano</TableHead>
                <TableHead className="text-right">Desligamentos</TableHead>
                <TableHead className="text-right">Dispensas pela empresa</TableHead>
                <TableHead className="text-right">Pedidos</TableHead>
                <TableHead className="text-right">Admissões</TableHead>
                <TableHead className="text-right">Ativos no fim</TableHead>
                <TableHead className="text-right">% do quadro</TableHead>
                <TableHead className="text-right">Quadro × ano anterior</TableHead>
                <TableHead className="text-right">Clientes</TableHead>
                <TableHead className="text-right">Faturamento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {anos.map((a) => (
                <TableRow key={a.ano}>
                  <TableCell className="font-medium">
                    {a.ano}
                    {a.emAndamento && <span className="block text-xs font-normal text-muted-foreground">até hoje</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{a.desligamentos}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.dispensasEmpresa}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.pedidos}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.admissoes}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.ativosNoFim}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{pct(a.pct)}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(a.crescimentoQuadroPct, true)}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(a.crescimentoClientesPct, true)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {pct(a.crescimentoFaturamentoPct, true)}
                    {a.observacao && <span className="block text-xs text-muted-foreground">{a.observacao}</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Equipe × negócio</CardTitle>
          <CardDescription>
            Crescimento do quadro contra o crescimento de clientes e de faturamento, ano a ano. Equipe que cresce mais que o
            negócio é custo que precisa de explicação.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {temNegocio ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={equipeNegocio} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <XAxis dataKey="ano" fontSize={11} tickLine={false} />
                <YAxis fontSize={11} tickLine={false} width={40} unit="%" />
                <Tooltip formatter={(v: unknown) => (typeof v === "number" ? pct(v, true) : "—")} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="equipe" name="Quadro" fill={CORES.quadro} radius={[3, 3, 0, 0]} />
                <Bar dataKey="clientes" name="Clientes" fill={CORES.clientes} radius={[3, 3, 0, 0]} />
                <Bar dataKey="faturamento" name="Faturamento" fill={CORES.faturamento} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className={cn("py-6 text-center text-sm text-muted-foreground")}>
              {podeConfigurar
                ? "Preencha o crescimento de clientes e de faturamento em \"Crescimento do negócio\" para comparar com a equipe."
                : "A diretoria ainda não preencheu o crescimento de clientes e de faturamento."}
            </p>
          )}
        </CardContent>
      </Card>

      {avisos.length > 0 && (
        <div className="space-y-1 text-xs text-muted-foreground">
          {avisos.map((a) => (
            <p key={a}>• {a}</p>
          ))}
        </div>
      )}
    </div>
  );
}
