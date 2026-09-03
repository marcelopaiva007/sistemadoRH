"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardList, FileDown, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { AMOSTRA_MINIMA_ANONIMATO, statusPlanoAcaoLabel } from "@/lib/constants-rh";
import { ZONAS_IRP, classificarEmZona, type ZonaIrp } from "@/lib/zonas";
import { criarPlanoAcao } from "@/lib/actions/planos-acao";
import { formatarData, hojeUTC, paraInputDate, somarDiasUTC } from "@/lib/datas";
import { normalizarTexto } from "@/lib/text";
import type { ActionResult } from "@/lib/constants";

type PesquisaResumo = { id: string; titulo: string; status: string };
type SetorResumo = { id: string; nome: string };
type PlanoAberto = { id: string; titulo: string; prazo: Date; status: string; setorId: string | null };

// Papéis da cadeia de escalonamento (lib/zonas.ts grava slugs do seed).
const ROTULO_ESCALONAMENTO: Record<string, string> = {
  gestor: "Gestor do setor",
  rh: "RH",
  diretoria: "Diretoria",
  sesmt: "SESMT",
  juridico: "Jurídico",
};

// ZONAS_IRP tem fronteiras inteiras (…24 | 25…): um índice 24,5 cairia no vão
// entre faixas — arredonda antes de classificar, igual ao número exibido.
function zonaDoIndice(indice100: number): ZonaIrp | null {
  return classificarEmZona(Math.round(indice100), ZONAS_IRP);
}

const DIMENSOES = Object.keys(DIMENSOES_NR01) as DimensaoNR01[];

// Célula colorida da matriz/heatmap: fundo pastel do nível + texto escuro fixo
// (os pastéis não mudam com o tema; texto claro ficaria ilegível no amarelo).
function CelulaNivel({ nr, nivel, detalhe }: { nr: number; nivel: keyof typeof NIVEIS_RISCO; detalhe?: string }) {
  const cfg = NIVEIS_RISCO[nivel];
  return (
    <div
      className="rounded px-2 py-1 text-center text-xs font-semibold"
      style={{ backgroundColor: cfg.corBg, color: "var(--foreground)" }}
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
      style={{ backgroundColor: cfg.corBg, color: "var(--foreground)" }}
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
  setores,
  planosAbertos,
}: {
  empresaId: string;
  pesquisas: PesquisaResumo[];
  pesquisaSelecionada: string | null;
  convites: number;
  resultado: ResultadoNR01 | null;
  setores: SetorResumo[];
  planosAbertos: PlanoAberto[];
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
  const zonaGeral = amostraGeralInsuficiente ? null : zonaDoIndice(geral.indiceGeral100);

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
            {zonaGeral && (
              <span
                className="mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold"
                style={{ backgroundColor: zonaGeral.cor, color: "var(--foreground)" }}
                title={`Zona ${zonaGeral.rotulo}: plano de ação em até ${zonaGeral.prazoPlanoDias} dias`}
              >
                Zona {zonaGeral.rotulo}
              </span>
            )}
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
                    <Radar dataKey="escore" name="Risco" stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.35} />
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
          <ZonasAcaoSetores
            empresaId={empresaId}
            pesquisaId={pesquisaSelecionada}
            grupos={resultado.porSetor}
            setores={setores}
            planosAbertos={planosAbertos}
          />
          <HeatmapGrupos titulo="Mapa de calor por Cargo" grupos={resultado.porCargo} />
        </>
      )}
    </div>
  );
}

// Zona de ação por setor (ZONAS_IRP ligada ao índice NR-01 — decisão do CEO:
// só aqui nesta fase, turnover/absenteísmo ficam de fora). O número vermelho
// deixa de ser etiqueta muda: cada setor mostra a zona, o prazo que ela exige,
// a cadeia de escalonamento e o botão de criar o plano já preenchido. Toda
// zona do seed tem prazo (até "Baixo", 60 dias — NR-01 monitora risco baixo
// também), então todo setor com amostra aparece; o corte de anonimato continua
// valendo e o rodapé diz quantos ficaram fora.
function ZonasAcaoSetores({
  empresaId,
  pesquisaId,
  grupos,
  setores,
  planosAbertos,
}: {
  empresaId: string;
  pesquisaId: string;
  grupos: ResultadoGrupo[];
  setores: SetorResumo[];
  planosAbertos: PlanoAberto[];
}) {
  // O grupo do heatmap é o NOME canônico do snapshot; o plano exige o ID da
  // linha de Setor desta empresa (nomes se repetem entre CNPJs). Cruzamento
  // por nome normalizado — rótulo sem linha correspondente (ex.: vocabulário
  // novo, "Desconhecido") fica sem botão, com aviso.
  const setoresPorNome = new Map(setores.map((s) => [normalizarTexto(s.nome), s]));
  const comAmostra = grupos.filter((g) => !g.amostraInsuficiente);
  const foraDoRecorte = grupos.length - comAmostra.length;

  if (comAmostra.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Zona de ação por setor (índice de risco NR-01)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {comAmostra.map((g) => (
          <BlocoZonaSetor
            key={g.grupo}
            empresaId={empresaId}
            pesquisaId={pesquisaId}
            grupo={g}
            setor={setoresPorNome.get(normalizarTexto(g.grupo)) ?? null}
            planosAbertos={planosAbertos}
          />
        ))}
        {foraDoRecorte > 0 && (
          <p className="text-xs text-muted-foreground">
            {foraDoRecorte} {foraDoRecorte === 1 ? "setor ficou fora" : "setores ficaram fora"} deste
            recorte por amostra menor que {AMOSTRA_MINIMA_ANONIMATO} respostas (anonimato).
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function BlocoZonaSetor({
  empresaId,
  pesquisaId,
  grupo,
  setor,
  planosAbertos,
}: {
  empresaId: string;
  pesquisaId: string;
  grupo: ResultadoGrupo;
  setor: SetorResumo | null;
  planosAbertos: PlanoAberto[];
}) {
  const [criarAberto, setCriarAberto] = useState(false);
  const zona = zonaDoIndice(grupo.indiceGeral100);
  if (!zona) return null; // índice fora de 0-100 não acontece com o motor atual

  const dimensaoCritica = [...grupo.dimensoes].sort((a, b) => b.nr - a.nr)[0];
  const planoAberto = setor ? (planosAbertos.find((p) => p.setorId === setor.id) ?? null) : null;
  const prazoSugerido = somarDiasUTC(hojeUTC(), zona.prazoPlanoDias);
  const cadeia = zona.escalonamento.map((papel) => ROTULO_ESCALONAMENTO[papel] ?? papel).join(" → ");

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{grupo.grupo}</span>
          <span
            className="rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{ backgroundColor: zona.cor, color: "var(--foreground)" }}
          >
            Zona {zona.rotulo} · índice {Math.round(grupo.indiceGeral100)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Plano de ação em até <span className="font-medium text-foreground">{zona.prazoPlanoDias} dias</span>{" "}
          ({formatarData(prazoSugerido)})
          {zona.reavaliacaoDias ? ` · reavaliação em ${zona.reavaliacaoDias} dias` : ""} · Escalonamento: {cadeia}
        </p>
        {dimensaoCritica.perguntaCritica && (
          <p className="text-xs text-muted-foreground">
            Dimensão crítica: <span className="font-medium text-foreground">{dimensaoCritica.label}</span> — &quot;
            {dimensaoCritica.perguntaCritica.enunciado}&quot; (risco médio{" "}
            {dimensaoCritica.perguntaCritica.mediaRisco.toFixed(2)}/4)
          </p>
        )}
      </div>

      {planoAberto ? (
        <div className="text-right text-xs">
          <Badge variant="default">{statusPlanoAcaoLabel(planoAberto.status)}</Badge>
          <p className="mt-1 max-w-56 truncate font-medium" title={planoAberto.titulo}>
            {planoAberto.titulo}
          </p>
          <p className="text-muted-foreground">Prazo {formatarData(planoAberto.prazo)}</p>
          <a href={`/rh/${empresaId}/planos-acao`} className="text-primary underline-offset-2 hover:underline">
            Acompanhar
          </a>
        </div>
      ) : setor ? (
        <Dialog open={criarAberto} onOpenChange={setCriarAberto}>
          <DialogTrigger render={<Button size="sm" variant="outline" />}>
            <ClipboardList className="size-4" />
            Criar plano de ação
          </DialogTrigger>
          <DialogContent>
            <NovoPlanoZonaForm
              empresaId={empresaId}
              pesquisaId={pesquisaId}
              setor={setor}
              zona={zona}
              grupo={grupo}
              dimensaoCritica={dimensaoCritica}
              prazoSugerido={prazoSugerido}
              cadeia={cadeia}
              onSuccess={() => setCriarAberto(false)}
            />
          </DialogContent>
        </Dialog>
      ) : (
        <p className="max-w-52 text-right text-xs text-muted-foreground">
          Sem setor cadastrado com este nome nesta empresa — crie o plano na tela Planos de ação.
        </p>
      )}
    </div>
  );
}

const initialState: ActionResult = { ok: true };

function NovoPlanoZonaForm({
  empresaId,
  pesquisaId,
  setor,
  zona,
  grupo,
  dimensaoCritica,
  prazoSugerido,
  cadeia,
  onSuccess,
}: {
  empresaId: string;
  pesquisaId: string;
  setor: SetorResumo;
  zona: ZonaIrp;
  grupo: ResultadoGrupo;
  dimensaoCritica: ResultadoGrupo["dimensoes"][number];
  prazoSugerido: Date;
  cadeia: string;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await criarPlanoAcao(empresaId, prev, fd);
    if (result.ok) {
      toast.success("Plano de ação criado.");
      onSuccess();
      // A action revalida só /planos-acao; o dashboard precisa rebuscar os
      // planos abertos para trocar o botão pelo estado do plano.
      router.refresh();
    }
    return result;
  }, initialState);

  const descricaoSugerida = dimensaoCritica.perguntaCritica
    ? `Pergunta mais crítica (${dimensaoCritica.perguntaCritica.codigo}): "${dimensaoCritica.perguntaCritica.enunciado}" — risco médio ${dimensaoCritica.perguntaCritica.mediaRisco.toFixed(2)}/4. Zona ${zona.rotulo} (índice ${Math.round(grupo.indiceGeral100)}): prazo de ${zona.prazoPlanoDias} dias, escalonamento ${cadeia}.`
    : `Zona ${zona.rotulo} (índice ${Math.round(grupo.indiceGeral100)}): prazo de ${zona.prazoPlanoDias} dias, escalonamento ${cadeia}.`;

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Plano de ação — {setor.nome}</DialogTitle>
      </DialogHeader>
      {/* setorId é o ID da linha (nome repete entre CNPJs); dimensaoCodigo usa
          o código da dimensão do motor NR-01, mesmo vocabulário do relatório. */}
      <input type="hidden" name="setorId" value={setor.id} />
      <input type="hidden" name="pesquisaId" value={pesquisaId} />
      <input type="hidden" name="dimensaoCodigo" value={dimensaoCritica.dimensao} />
      <div className="space-y-2">
        <Label htmlFor="zona-titulo">Ação</Label>
        <Input
          id="zona-titulo"
          name="titulo"
          defaultValue={`NR-01 · ${setor.nome}: ${dimensaoCritica.label}`}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="zona-descricao">Descrição</Label>
        <Textarea id="zona-descricao" name="descricao" rows={4} defaultValue={descricaoSugerida} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="zona-responsavel">Responsável</Label>
          <Input id="zona-responsavel" name="responsavelNome" placeholder={`Ex.: ${cadeia.split(" → ")[0]}`} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="zona-prazo">Prazo (zona {zona.rotulo}: {zona.prazoPlanoDias} dias)</Label>
          <Input id="zona-prazo" name="prazo" type="date" defaultValue={paraInputDate(prazoSugerido)} required />
        </div>
      </div>
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Criando..." : "Criar plano"}
        </Button>
      </DialogFooter>
    </form>
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
