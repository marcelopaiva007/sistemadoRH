"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { FileDown, TrendingDown, TrendingUp } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PainelAvaliacao } from "@/lib/avaliacao-painel";

const classeSelect =
  "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

const CORES_FAIXA: Record<string, string> = {
  BAIXO: "#dc2626",
  MEDIO: "#f59e0b",
  ALTO: "#16a34a",
};

// Abaixo de 60% de participação a barra vira vermelha — mesmo corte visual
// que o resto do sistema usa para "precisa de atenção".
function corParticipacao(pct: number): string {
  if (pct < 60) return "#dc2626";
  if (pct < 90) return "#f59e0b";
  return "#16a34a";
}

export function PainelAvaliacaoView({
  empresaId,
  campanhas,
  campanhaSelecionada,
  dados,
}: {
  empresaId: string;
  campanhas: string[];
  campanhaSelecionada: string | null;
  dados: PainelAvaliacao | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [baixando, setBaixando] = useState(false);

  function trocarCampanha(nome: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("campanha", nome);
    router.push(`?${params.toString()}`, { scroll: false });
  }

  async function baixarRelatorio() {
    if (!campanhaSelecionada) return;
    setBaixando(true);
    try {
      const res = await fetch(
        `/api/rh/${empresaId}/avaliacoes/painel/relatorio-pdf?campanha=${encodeURIComponent(campanhaSelecionada)}`,
      );
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-avaliacao-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Erro: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBaixando(false);
    }
  }

  if (campanhas.length === 0 || !dados) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nenhum ciclo de avaliação criado ainda — o painel aparece assim que houver um.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Painel de Avaliação</h2>
          <p className="text-sm text-muted-foreground">
            Consolidado de todos os CNPJs desta campanha.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className={classeSelect}
            value={campanhaSelecionada ?? ""}
            onChange={(e) => trocarCampanha(e.target.value)}
          >
            {campanhas.map((nome) => (
              <option key={nome} value={nome}>
                {nome}
              </option>
            ))}
          </select>
          <Button variant="outline" onClick={baixarRelatorio} disabled={baixando}>
            <FileDown className="size-4" />
            {baixando ? "Gerando..." : "Relatório PDF"}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CardKpi
          titulo="Participação geral"
          valor={`${dados.participacaoPct}%`}
          apoio={`${dados.totalConcluidas} de ${dados.totalAvaliacoes} avaliações`}
        />
        <CardKpi
          titulo="Nota média (gestor)"
          valor={dados.mediaGeral !== null ? dados.mediaGeral.toFixed(2) : "—"}
          apoio={
            dados.amostraNotas > 0
              ? `${dados.amostraNotas} avaliação(ões) de gestor concluída(s)`
              : "sem avaliações de gestor concluídas"
          }
        />
        <CardKpi
          titulo="Desvio padrão"
          valor={dados.desvioPadrao !== null ? dados.desvioPadrao.toFixed(2) : "—"}
          apoio="mede o quanto as notas variam entre si"
        />
        <CardKpi
          titulo="Destaques"
          valor={String(dados.destaques.abaixoDaMedia.length + dados.destaques.acimaDaMedia.length)}
          apoio={`${dados.destaques.abaixoDaMedia.length} abaixo · ${dados.destaques.acimaDaMedia.length} acima`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Participação por CNPJ</CardTitle>
          </CardHeader>
          <CardContent>
            <GraficoParticipacao linhas={dados.porEmpresa} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Participação por setor</CardTitle>
          </CardHeader>
          <CardContent>
            <GraficoParticipacao linhas={dados.porSetor} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Distribuição de notas (avaliação do gestor)</CardTitle>
        </CardHeader>
        <CardContent>
          {dados.amostraNotas === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma avaliação de gestor concluída ainda.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dados.distribuicaoNotas} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => `${Number(v)} avaliação(ões)`} />
                <Bar dataKey="qtd" radius={[0, 4, 4, 0]}>
                  {dados.distribuicaoNotas.map((d) => (
                    <Cell key={d.faixa} fill={CORES_FAIXA[d.faixa]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <TabelaDestaque
          titulo="Abaixo da média"
          icone={<TrendingDown className="size-4 text-destructive" />}
          linhas={dados.destaques.abaixoDaMedia}
          vazio="Ninguém está estatisticamente abaixo da média."
        />
        <TabelaDestaque
          titulo="Acima da média"
          icone={<TrendingUp className="size-4 text-green-600 dark:text-green-400" />}
          linhas={dados.destaques.acimaDaMedia}
          vazio="Ninguém está estatisticamente acima da média."
        />
      </div>

      {dados.amostraNotas > 0 && dados.amostraNotas < 3 && (
        <p className="text-xs text-muted-foreground">
          Menos de 3 avaliações de gestor concluídas — média, desvio e destaques aparecem a partir
          da terceira.
        </p>
      )}
    </div>
  );
}

function CardKpi({ titulo, valor, apoio }: { titulo: string; valor: string; apoio: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 py-4">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p className="text-2xl font-semibold tabular-nums">{valor}</p>
        <p className="text-xs text-muted-foreground">{apoio}</p>
      </CardContent>
    </Card>
  );
}

function GraficoParticipacao({
  linhas,
}: {
  linhas: { chave: string; total: number; concluidas: number; participacaoPct: number }[];
}) {
  if (linhas.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem dados.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, linhas.length * 36)}>
      <BarChart data={linhas} layout="vertical" margin={{ left: 24 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} unit="%" />
        <YAxis type="category" dataKey="chave" width={140} tick={{ fontSize: 12 }} />
        <Tooltip
          formatter={(v, _n, item) => {
            const p = item?.payload as (typeof linhas)[number] | undefined;
            return p ? `${p.concluidas}/${p.total} (${p.participacaoPct}%)` : `${Number(v)}%`;
          }}
        />
        <Bar dataKey="participacaoPct" radius={[0, 4, 4, 0]}>
          {linhas.map((l) => (
            <Cell key={l.chave} fill={corParticipacao(l.participacaoPct)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function TabelaDestaque({
  titulo,
  icone,
  linhas,
  vazio,
}: {
  titulo: string;
  icone: React.ReactNode;
  linhas: { colaboradorId: string; nome: string; empresaNome: string; setor: string; notaFinal: number }[];
  vazio: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icone}
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {linhas.length === 0 ? (
          <p className="text-sm text-muted-foreground">{vazio}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Setor</TableHead>
                <TableHead className="text-right">Nota</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.colaboradorId}>
                  <TableCell className="font-medium">{l.nome}</TableCell>
                  <TableCell className="text-muted-foreground">{l.empresaNome}</TableCell>
                  <TableCell className="text-muted-foreground">{l.setor}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {l.notaFinal.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
