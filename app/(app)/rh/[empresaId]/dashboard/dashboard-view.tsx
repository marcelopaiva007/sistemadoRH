"use client";

import { useRouter } from "next/navigation";
import { FileDown, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
} from "recharts";
import { NIVEIS_RISCO, type ResultadoGrupo, type ResultadoNR01 } from "@/lib/nr01";
import { DIMENSOES_NR01, type DimensaoNR01 } from "@/lib/nr01-modelo";
import { AMOSTRA_MINIMA_ANONIMATO } from "@/lib/constants-rh";

type PesquisaResumo = { id: string; titulo: string; status: string };

const DIMENSOES = Object.keys(DIMENSOES_NR01) as DimensaoNR01[];

// Célula colorida da matriz/heatmap: fundo pastel do nível + texto escuro fixo
// (os pastéis não mudam com o tema; texto claro ficaria ilegível no amarelo).
function CelulaNivel({ nr, nivel, detalhe }: { nr: number; nivel: keyof typeof NIVEIS_RISCO; detalhe?: string }) {
  const cfg = NIVEIS_RISCO[nivel];
  return (
    <div
      className="rounded px-2 py-1 text-center text-xs font-semibold"
      style={{ backgroundColor: cfg.corBg, color: "#1f2937" }}
      title={detalhe}
    >
      {nr} · {cfg.label}
    </div>
  );
}

function BadgeNivel({ nivel }: { nivel: keyof typeof NIVEIS_RISCO }) {
  const cfg = NIVEIS_RISCO[nivel];
  return (
    <span
      className="inline-block rounded-full px-3 py-1 text-sm font-semibold"
      style={{ backgroundColor: cfg.corBg, color: "#1f2937" }}
    >
      {cfg.label}
    </span>
  );
}

export function DashboardNR01View({
  empresaId,
  pesquisas,
  pesquisaSelecionada,
  convites,
  resultado,
}: {
  empresaId: string;
  pesquisas: PesquisaResumo[];
  pesquisaSelecionada: string | null;
  convites: number;
  resultado: ResultadoNR01 | null;
}) {
  const router = useRouter();

  if (!resultado || !pesquisaSelecionada) {
    return (
      <div className="rounded-md border bg-background p-10 text-center text-muted-foreground">
        <ShieldAlert className="mx-auto mb-3 size-8" />
        <p>Nenhuma Avaliação de Riscos Psicossociais (NR-01) criada ainda.</p>
        <p className="text-sm">Crie uma na aba Pesquisas com o botão &quot;Nova Avaliação NR-01&quot;.</p>
      </div>
    );
  }

  const geral = resultado.geral;
  const participacao = convites > 0 ? Math.round((resultado.totalRespostas / convites) * 100) : 0;
  const dimensaoCritica = [...geral.dimensoes].sort((a, b) => b.nr - a.nr)[0];
  const radarData = geral.dimensoes.map((d) => ({
    dimensao: d.label.split(" ")[0],
    labelCompleto: d.label,
    escore: Math.round(d.escore100),
  }));

  const semDados = resultado.totalRespostas === 0;
  const amostraGeralInsuficiente = geral.amostraInsuficiente;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Dashboard — Riscos Psicossociais (NR-01)</h1>
        <div className="flex items-center gap-2">
          {pesquisas.length > 1 && (
            <Select
              value={pesquisaSelecionada}
              onValueChange={(v) => v && router.push(`/rh/${empresaId}/dashboard?pesquisa=${v}`)}
              items={Object.fromEntries(pesquisas.map((p) => [p.id, p.titulo]))}
            >
              <SelectTrigger className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pesquisas.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.titulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="outline"
            size="sm"
            render={
              <a
                href={`/api/rh/${empresaId}/pesquisas/${pesquisaSelecionada}/relatorio-pdf`}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <FileDown className="size-4" />
            Relatório PDF (PGR)
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Participação</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {resultado.totalRespostas}
              <span className="text-base font-normal text-muted-foreground"> / {convites} ({participacao}%)</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Índice Geral de Risco (0-100)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {amostraGeralInsuficiente ? "—" : Math.round(geral.indiceGeral100)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Nível Geral (pior dimensão)</CardTitle>
          </CardHeader>
          <CardContent>
            {amostraGeralInsuficiente ? "—" : <BadgeNivel nivel={geral.nivelGeral} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Dimensão mais crítica</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-semibold">
              {amostraGeralInsuficiente ? "—" : dimensaoCritica.label}
            </p>
            {!amostraGeralInsuficiente && (
              <p className="text-xs text-muted-foreground">
                NR {dimensaoCritica.nr} · {NIVEIS_RISCO[dimensaoCritica.nivel].label}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {semDados ? (
        <p className="rounded-md border bg-background p-8 text-center text-sm text-muted-foreground">
          Ainda não há respostas para esta avaliação.
        </p>
      ) : amostraGeralInsuficiente ? (
        <p className="rounded-md border bg-background p-8 text-center text-sm text-muted-foreground">
          Menos de {AMOSTRA_MINIMA_ANONIMATO} respostas — os resultados ficam ocultos para
          preservar o anonimato.
        </p>
      ) : (
        <>
          {/* Radar + matriz da empresa */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Radar das 6 dimensões (0-100, maior = pior)</CardTitle>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} outerRadius="70%">
                    <PolarGrid stroke="var(--border)" />
                    <PolarAngleAxis dataKey="dimensao" tick={{ fontSize: 12 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <Radar dataKey="escore" name="Risco" stroke="#dc2626" fill="#dc2626" fillOpacity={0.35} />
                    <Tooltip
                      formatter={(v) => [`${v} / 100`, "Risco"]}
                      labelFormatter={(_, payload) =>
                        (payload?.[0]?.payload as { labelCompleto?: string })?.labelCompleto ?? ""
                      }
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Matriz de risco da empresa (P × S)</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dimensão</TableHead>
                      <TableHead className="text-center">Expostos</TableHead>
                      <TableHead className="text-center">P</TableHead>
                      <TableHead className="text-center">S</TableHead>
                      <TableHead className="w-28 text-center">NR</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {geral.dimensoes.map((d) => (
                      <TableRow key={d.dimensao}>
                        <TableCell className="text-sm">{d.label}</TableCell>
                        <TableCell className="text-center text-sm">{Math.round(d.pctExpostos)}%</TableCell>
                        <TableCell className="text-center text-sm">{d.probabilidade}</TableCell>
                        <TableCell className="text-center text-sm">{d.severidade}</TableCell>
                        <TableCell>
                          <CelulaNivel nr={d.nr} nivel={d.nivel} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <HeatmapGrupos titulo="Mapa de calor por Setor" grupos={resultado.porSetor} />
          <HeatmapGrupos titulo="Mapa de calor por Cargo" grupos={resultado.porCargo} />
        </>
      )}
    </div>
  );
}

function HeatmapGrupos({ titulo, grupos }: { titulo: string; grupos: ResultadoGrupo[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Grupo</TableHead>
              <TableHead className="text-center">Respostas</TableHead>
              {DIMENSOES.map((d) => (
                <TableHead key={d} className="text-center text-xs">
                  {DIMENSOES_NR01[d].label.split(" ")[0]}
                </TableHead>
              ))}
              <TableHead className="text-center">Geral</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grupos.map((g) => (
              <TableRow key={g.grupo}>
                <TableCell className="text-sm font-medium">{g.grupo}</TableCell>
                <TableCell className="text-center text-sm">{g.respostas}</TableCell>
                {g.amostraInsuficiente ? (
                  <TableCell colSpan={DIMENSOES.length + 1} className="text-center text-xs text-muted-foreground">
                    Amostra insuficiente (mínimo {AMOSTRA_MINIMA_ANONIMATO} respostas para preservar o anonimato)
                  </TableCell>
                ) : (
                  <>
                    {g.dimensoes.map((d) => (
                      <TableCell key={d.dimensao} className="px-1">
                        <CelulaNivel
                          nr={d.nr}
                          nivel={d.nivel}
                          detalhe={`${d.label}: média ${d.mediaRisco.toFixed(2)}/4 · ${Math.round(d.pctExpostos)}% expostos · P${d.probabilidade}×S${d.severidade}`}
                        />
                      </TableCell>
                    ))}
                    <TableCell className="px-1">
                      <CelulaNivel nr={Math.round(g.indiceGeral100)} nivel={g.nivelGeral} detalhe="Índice geral 0-100 e pior nível entre as dimensões" />
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
