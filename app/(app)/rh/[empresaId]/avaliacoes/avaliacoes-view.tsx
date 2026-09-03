"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Plus, LayoutDashboard, AlertTriangle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { criarCiclo } from "@/lib/actions/rh-avaliacao";
import { TIPOS_CICLO, tipoCicloLabel } from "@/lib/constants-avaliacao";
import { formatarData } from "@/lib/datas";
import { LIMIAR_GAP_ALTO, PISO_PARES_POR_LIDER, type CoberturaCampanha } from "@/lib/avaliacao-cobertura";
import type { ActionResult } from "@/lib/constants";

const initialState: ActionResult = { ok: true };
const classeSelect =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

type Ciclo = {
  id: string;
  nome: string;
  tipo: string;
  dataInicio: Date;
  dataFim: Date;
  encerrado: boolean;
  progresso: { total: number; concluidas: number };
};

export function AvaliacoesView({
  empresaId,
  ciclos,
  cobertura,
}: {
  empresaId: string;
  ciclos: Ciclo[];
  cobertura: CoberturaCampanha | null;
}) {
  const [criarAberto, setCriarAberto] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>Avaliação de desempenho</h1>
          <p className="text-sm text-muted-foreground">
            Ciclos 90° (só gestor), 180° (autoavaliação + gestor) e 360° (múltiplas fontes), com
            competências e nine-box.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/rh/${empresaId}/avaliacoes/painel`}>
            <Button variant="outline">
              <LayoutDashboard className="size-4" />
              Painel
            </Button>
          </Link>
          <Dialog open={criarAberto} onOpenChange={setCriarAberto}>
            <DialogTrigger render={<Button />}>
              <Plus className="size-4" />
              Novo ciclo
            </DialogTrigger>
            <DialogContent>
              <NovoCicloForm empresaId={empresaId} onSuccess={() => setCriarAberto(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {cobertura && <PlacarCampanha cobertura={cobertura} />}

      {ciclos.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum ciclo de avaliação criado ainda.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ciclos.map((c) => (
            <Link key={c.id} href={`/rh/${empresaId}/avaliacoes/${c.id}`}>
              <Card className="h-full transition-colors hover:bg-accent/40">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{c.nome}</CardTitle>
                    <Badge variant={c.encerrado ? "secondary" : "default"}>
                      {c.encerrado ? "Encerrado" : "Aberto"}
                    </Badge>
                  </div>
                  <CardDescription>
                    {tipoCicloLabel(c.tipo)} · {formatarData(c.dataInicio)} a {formatarData(c.dataFim)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">
                    {c.progresso.total === 0
                      ? "Nenhuma avaliação gerada ainda"
                      : `${c.progresso.concluidas}/${c.progresso.total} avaliações concluídas`}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// Placar da campanha atual (grupo inteiro)
// ---------------------------------------------------------------

const MAX_AVALIADORES_VISIVEIS = 8;
const MAX_PARES_VISIVEIS = 10;

function PlacarCampanha({ cobertura }: { cobertura: CoberturaCampanha }) {
  const { totais, filaEquipe, gap } = cobertura;
  const top2 = filaEquipe.avaliadores.slice(0, 2);
  // Concentração ≥ 50% em duas pessoas é problema de desenho do ciclo, não de
  // disciplina — é o que o texto de leitura aponta.
  const filaConcentrada =
    filaEquipe.concentracaoTop2Pct !== null && filaEquipe.concentracaoTop2Pct >= 50 && top2.length === 2;
  const nomeAvaliador = (nome: string | null) => nome ?? "Avaliador removido";
  const ritmoDia = (pendentes: number) =>
    cobertura.emAndamento ? Math.ceil(pendentes / Math.max(cobertura.diasRestantes, 1)) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold">Placar da campanha · {cobertura.campanha}</h3>
        <Badge variant={cobertura.encerrada ? "secondary" : "default"}>
          {cobertura.encerrada
            ? "Encerrada"
            : cobertura.emAndamento
              ? `Faltam ${cobertura.diasRestantes} dia(s)`
              : "Prazo vencido, ciclos abertos"}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {formatarData(cobertura.dataInicio)} a {formatarData(cobertura.dataFim)} · grupo inteiro,
          todos os CNPJs com ciclo
        </span>
      </div>

      {/* Correção de leitura: pendência no meio de um ciclo curto é andamento,
          não travamento — o que trava é fila concentrada em pouca gente. */}
      {cobertura.emAndamento && totais.pendentes > 0 && (
        <p className="text-sm text-muted-foreground">
          {totais.pendentes} avaliações pendentes com {cobertura.diasRestantes} dia(s) restante(s) de
          um ciclo de {cobertura.duracaoDias} dias é ciclo em andamento, não ciclo travado — e{" "}
          {totais.pendentesAuto} delas são autoavaliações, fila do próprio colaborador.
          {filaConcentrada && (
            <>
              {" "}
              O ponto de atenção é o desenho: {nomeAvaliador(top2[0].avaliadorNome)} (
              {top2[0].pendentes}) e {nomeAvaliador(top2[1].avaliadorNome)} ({top2[1].pendentes})
              carregam {filaEquipe.concentracaoTop2Pct}% da fila de gestor — ninguém avalia{" "}
              {top2[0].pendentes} pessoas em {cobertura.diasRestantes} dia(s). Redistribuir
              avaliadores resolve mais que cobrar prazo.
            </>
          )}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CardPlacar
          titulo="Concluídas / geradas"
          valor={`${totais.concluidas}/${totais.geradas}`}
          apoio={`${totais.colaboradoresNoProcesso} de ${totais.ativosNoGrupo} ativos no processo`}
        />
        <CardPlacar
          titulo="Fila de gestor"
          valor={String(totais.pendentesEquipe)}
          apoio={`${filaEquipe.avaliadores.length} avaliador(es) com pendência`}
        />
        <CardPlacar
          titulo="Fila de autoavaliação"
          valor={String(totais.pendentesAuto)}
          apoio="pendência do próprio colaborador"
        />
        <CardPlacar
          titulo="Potenciais preenchidos"
          valor={`${totais.potenciaisPreenchidos}/${totais.gestorGeradas}`}
          apoio="marcados na avaliação de gestor — insumo do nine-box"
        />
      </div>

      {cobertura.semAvaliacaoGerada.length > 0 && (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertDescription>
            Ciclo aberto sem nenhuma avaliação gerada:{" "}
            {cobertura.semAvaliacaoGerada.map((e) => `${e.empresaNome} (${e.ativos} ativos)`).join(", ")}{" "}
            — {cobertura.ativosForaDoProcesso} pessoas fora do processo. Gerar as avaliações é um
            botão no detalhe do ciclo de cada CNPJ.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cobertura por CNPJ</CardTitle>
            <CardDescription>Pior cobertura primeiro. Só CNPJs com avaliação gerada.</CardDescription>
          </CardHeader>
          <CardContent>
            {cobertura.porEmpresa.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma avaliação gerada em nenhum CNPJ desta campanha.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>CNPJ</TableHead>
                    <TableHead className="text-right">Concluídas</TableHead>
                    <TableHead className="text-right">De gestor</TableHead>
                    <TableHead className="text-right">Potenciais</TableHead>
                    <TableHead className="text-right">No processo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cobertura.porEmpresa.map((l) => (
                    <TableRow key={l.empresaId}>
                      <TableCell className="font-medium">{l.empresaNome}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {l.concluidas}/{l.geradas}{" "}
                        <span className="text-muted-foreground">({l.concluidasPct}%)</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {l.gestorConcluidas}/{l.gestorGeradas}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{l.potenciaisPreenchidos}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {l.colaboradoresNoProcesso}/{l.ativos}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4" />
              Quem segura a fila de gestor
            </CardTitle>
            <CardDescription>
              A fila pessoal de cada avaliador já aparece no portal do gestor — este contador é para
              o RH enxergar o desenho, não para cobrar pessoa a pessoa.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filaEquipe.avaliadores.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma avaliação de gestor pendente nesta campanha.
              </p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Avaliador</TableHead>
                      <TableHead className="text-right">Pendentes</TableHead>
                      <TableHead className="text-right">% da fila</TableHead>
                      {cobertura.emAndamento && <TableHead className="text-right">Ritmo p/ fechar</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filaEquipe.avaliadores.slice(0, MAX_AVALIADORES_VISIVEIS).map((f) => (
                      <TableRow key={f.avaliadorId}>
                        <TableCell className="font-medium">{nomeAvaliador(f.avaliadorNome)}</TableCell>
                        <TableCell className="text-right tabular-nums">{f.pendentes}</TableCell>
                        <TableCell className="text-right tabular-nums">{f.pctDaFila}%</TableCell>
                        {cobertura.emAndamento && (
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            ≈ {ritmoDia(f.pendentes)}/dia
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {filaEquipe.avaliadores.length > MAX_AVALIADORES_VISIVEIS && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    + {filaEquipe.avaliadores.length - MAX_AVALIADORES_VISIVEIS} avaliador(es) com
                    fila menor.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <GapAutoGestor gap={gap} />

      {cobertura.avisos.length > 0 && (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {cobertura.avisos.map((a) => (
            <li key={a}>• {a}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GapAutoGestor({ gap }: { gap: CoberturaCampanha["gap"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Gap autoavaliação × gestor</CardTitle>
        <CardDescription>
          Diferença entre como a pessoa se vê e como o gestor a vê (escala 1–5). Gap alto individual
          é expectativa desalinhada — gatilho de conversa, preditor de saída. Gap alto consistente na
          equipe de um líder sugere feedback que não chega. Só entram pares: a MESMA pessoa com
          autoavaliação e avaliação de gestor concluídas no mesmo ciclo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <CardPlacar
            titulo="Gap médio (pares)"
            valor={gap.gapMedio !== null ? gap.gapMedio.toFixed(2) : "—"}
            apoio={
              gap.pares > 0
                ? `${gap.pares} par(es) · ${gap.paresComGapAlto} com gap ≥ ${LIMIAR_GAP_ALTO.toFixed(1)}`
                : "sem pares concluídos ainda"
            }
          />
          <CardPlacar
            titulo="Média das autoavaliações"
            valor={gap.mediaAutoTodas !== null ? gap.mediaAutoTodas.toFixed(2) : "—"}
            apoio={`${gap.concluidasAuto} concluída(s) com nota — todas, sem parear`}
          />
          <CardPlacar
            titulo="Média das notas de gestor"
            valor={gap.mediaGestorTodas !== null ? gap.mediaGestorTodas.toFixed(2) : "—"}
            apoio={`${gap.concluidasGestor} concluída(s) com nota — todas, sem parear`}
          />
        </div>

        {gap.pares > 0 && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-medium">Maiores gaps individuais</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead className="text-right">Auto</TableHead>
                    <TableHead className="text-right">Gestor</TableHead>
                    <TableHead className="text-right">Gap</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gap.lista.slice(0, MAX_PARES_VISIVEIS).map((p) => (
                    <TableRow key={`${p.colaboradorId}:${p.avaliadorId}`}>
                      <TableCell className="font-medium">{p.colaboradorNome}</TableCell>
                      <TableCell className="text-muted-foreground">{p.empresaNome}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.notaAuto.toFixed(2)}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.notaGestor.toFixed(2)}</TableCell>
                      <TableCell
                        className={`text-right font-semibold tabular-nums ${
                          p.gap >= LIMIAR_GAP_ALTO ? "text-destructive" : ""
                        }`}
                      >
                        {p.gap > 0 ? "+" : ""}
                        {p.gap.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {gap.lista.length > MAX_PARES_VISIVEIS && (
                <p className="mt-2 text-xs text-muted-foreground">
                  + {gap.lista.length - MAX_PARES_VISIVEIS} par(es) com gap menor.
                </p>
              )}
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Por líder (mínimo {PISO_PARES_POR_LIDER} pares)</p>
              {gap.porLider.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum líder atingiu {PISO_PARES_POR_LIDER} pares concluídos — o recorte por líder
                  aparece quando houver amostra
                  {gap.lideresForaDoPiso > 0 ? ` (${gap.lideresForaDoPiso} líder(es) abaixo do piso)` : ""}.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Líder</TableHead>
                      <TableHead className="text-right">Pares</TableHead>
                      <TableHead className="text-right">Gap médio da equipe</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gap.porLider.map((l) => (
                      <TableRow key={l.avaliadorId}>
                        <TableCell className="font-medium">{l.avaliadorNome ?? "Avaliador removido"}</TableCell>
                        <TableCell className="text-right tabular-nums">{l.pares}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {l.gapMedio > 0 ? "+" : ""}
                          {l.gapMedio.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CardPlacar({ titulo, valor, apoio }: { titulo: string; valor: string; apoio: string }) {
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

function NovoCicloForm({ empresaId, onSuccess }: { empresaId: string; onSuccess: () => void }) {
  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await criarCiclo(empresaId, prev, fd);
    if (result.ok) {
      toast.success("Ciclo criado.");
      onSuccess();
    }
    return result;
  }, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Novo ciclo de avaliação</DialogTitle>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="nome">Nome</Label>
        <Input id="nome" name="nome" placeholder='Ex.: "1º Semestre 2026"' required autoFocus />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tipo">Tipo</Label>
        <select id="tipo" name="tipo" required defaultValue="" className={classeSelect}>
          <option value="" disabled>
            Escolha o tipo
          </option>
          {TIPOS_CICLO.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="dataInicio">Início</Label>
          <Input id="dataInicio" name="dataInicio" type="date" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dataFim">Fim</Label>
          <Input id="dataFim" name="dataFim" type="date" required />
        </div>
      </div>
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Criando..." : "Criar ciclo"}
        </Button>
      </DialogFooter>
    </form>
  );
}
