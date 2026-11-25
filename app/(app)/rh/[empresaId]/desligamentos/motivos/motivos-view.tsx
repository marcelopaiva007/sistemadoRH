"use client";

import Link from "next/link";
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CabecalhoDePagina } from "@/components/padroes/cabecalho-de-pagina";
import { causaDesligamentoLabel } from "@/lib/constants-dp";
import { ORDEM_DAS_CAUSAS, SEM_CAUSA, type LinhaMotivos, type Motivos } from "@/lib/desligamentos/analises";
import type { FiltrosDaArea } from "@/lib/desligamentos/area";
import { BotaoExportarPdf, FiltrosDaAreaBarra } from "../filtros-da-area";

// Uma cor por causa, fixa: a mesma causa tem a mesma cor em todo gráfico da
// área. "Sem causa registrada" fica no cinza mais claro — é ausência de dado,
// não uma categoria que compete com as outras.
const COR_DA_CAUSA: Record<string, string> = {
  DESEMPENHO: "#b42318",
  COMPORTAMENTO: "#e8590c",
  REESTRUTURACAO: "#7d7979",
  PEDIDO_COLABORADOR: "#2d6a4f",
  FIM_CONTRATO: "#3b5bdb",
  OUTROS: "#bab6b6",
  [SEM_CAUSA]: "#e2dfdf",
};

function rotuloDaCausa(c: string): string {
  return c === SEM_CAUSA ? "Sem causa registrada" : causaDesligamentoLabel(c);
}

function pct(parte: number, total: number): string {
  if (total === 0) return "—";
  return `${((parte / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
}

export function MotivosView({
  empresaId,
  motivos,
  filtros,
  nomeDoRecorte,
  avisos,
}: {
  empresaId: string;
  motivos: Motivos;
  filtros: FiltrosDaArea;
  nomeDoRecorte: string | null;
  avisos: string[];
}) {
  const { geral } = motivos;
  const semCausa = geral.porCausa[SEM_CAUSA] ?? 0;
  const causasPresentes = ORDEM_DAS_CAUSAS.filter((c) => (geral.porCausa[c] ?? 0) > 0);

  return (
    <div className="space-y-6">
      <CabecalhoDePagina
        titulo="Motivos das saídas"
        resumo={
          <>
            {geral.total} saída(s) em {filtros.periodo.rotulo}
            {nomeDoRecorte ? ` no ${nomeDoRecorte}` : ""}: <b className="text-foreground">{pct(geral.empresa, geral.total)}</b>{" "}
            por decisão da empresa e {pct(geral.pedido, geral.total)} por pedido do colaborador.
          </>
        }
        acoes={<BotaoExportarPdf empresaId={empresaId} />}
      />

      <FiltrosDaAreaBarra filtros={filtros} />

      {geral.total === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma saída no período e no recorte escolhidos.</p>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Causa da saída</CardTitle>
              <CardDescription>
                A causa gerencial, registrada junto com o desligamento desde a v1.213.0.
                {semCausa > 0 && (
                  <>
                    {" "}
                    {semCausa} de {geral.total} saídas ainda estão sem causa —{" "}
                    <Link href={`/rh/${empresaId}/desligamentos/pendencias`} className="font-medium underline-offset-2 hover:underline">
                      classifique em Pendências
                    </Link>
                    .
                  </>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {causasPresentes.map((c) => {
                  const n = geral.porCausa[c] ?? 0;
                  return (
                    <div key={c} className="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-3 text-sm">
                      <span className="truncate">{rotuloDaCausa(c)}</span>
                      <div className="h-3 bg-muted">
                        <div className="h-full" style={{ width: `${(n / geral.total) * 100}%`, background: COR_DA_CAUSA[c] }} />
                      </div>
                      <span className="tabular-nums">
                        {n} <span className="text-muted-foreground">({pct(n, geral.total)})</span>
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                Quem decidiu, pelo tipo legal: {geral.empresa} dispensa(s) pela empresa, {geral.pedido} pedido(s) de demissão e{" "}
                {geral.outros} outro(s) (acordo, fim de contrato, sem motivo...).
              </p>
            </CardContent>
          </Card>

          <MotivosPorGrupo titulo="Por setor" linhas={motivos.porSetor} />
          <MotivosPorGrupo titulo="Por gestor" linhas={motivos.porGestor} />
        </>
      )}

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

function MotivosPorGrupo({ titulo, linhas }: { titulo: string; linhas: LinhaMotivos[] }) {
  if (linhas.length === 0) return null;
  const causas = ORDEM_DAS_CAUSAS.filter((c) => linhas.some((l) => (l.porCausa[c] ?? 0) > 0));
  const dados = linhas.map((l) => ({ nome: l.nome, ...l.porCausa }));
  const altura = Math.max(160, linhas.length * 30 + 60);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{titulo}</CardTitle>
        <CardDescription>Saídas do período por causa. Mais saídas primeiro.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ResponsiveContainer width="100%" height={altura}>
          <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
            <XAxis type="number" fontSize={11} allowDecimals={false} tickLine={false} />
            <YAxis type="category" dataKey="nome" fontSize={11} width={150} tickLine={false} />
            <Tooltip />
            {/* Texto da legenda na cor do texto, não na da barra: "sem causa
                registrada" é cinza bem claro e sumia no fundo. */}
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              formatter={(valor: unknown) => <span className="text-foreground">{String(valor)}</span>}
            />
            {causas.map((c) => (
              <Bar key={c} dataKey={c} name={rotuloDaCausa(c)} stackId="causas" fill={COR_DA_CAUSA[c]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
        <Table compacta>
          <TableHeader>
            <TableRow>
              <TableHead>{titulo === "Por setor" ? "Setor" : "Gestor"}</TableHead>
              <TableHead className="text-right">Saídas</TableHead>
              {causas.map((c) => (
                <TableHead key={c} className="text-right">
                  {rotuloDaCausa(c)}
                </TableHead>
              ))}
              <TableHead className="text-right">Empresa × pedido</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((l) => (
              <TableRow key={l.chave}>
                <TableCell className="font-medium">{l.nome}</TableCell>
                <TableCell className="text-right tabular-nums">{l.total}</TableCell>
                {causas.map((c) => (
                  <TableCell key={c} className="text-right tabular-nums">
                    {l.porCausa[c] || <span className="text-muted-foreground">0</span>}
                  </TableCell>
                ))}
                <TableCell className="text-right tabular-nums">
                  {l.empresa} × {l.pedido}
                  {l.outros > 0 && <span className="text-muted-foreground"> (+{l.outros})</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
