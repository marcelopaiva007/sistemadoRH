"use client";

import { useActionState, useMemo, useState } from "react";
import { toast } from "sonner";
import { BookOpen, Check, Award, Clock, Pencil, Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { criarTreinamento, editarTreinamento, alternarTreinamentoAtivo } from "@/lib/actions/rh-treinamentos";
import { competenciaLabel } from "@/lib/constants-avaliacao";
import type { OpcaoCatalogo } from "@/lib/catalogos";
import type { ActionResult } from "@/lib/constants";
import { Paginacao } from "@/components/paginacao";
import { usePaginacao } from "@/lib/use-paginacao";
import { cn } from "@/lib/utils";

const initialState: ActionResult = { ok: true };

type Treinamento = {
  id: string;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  cargaHoraria: number | null;
  competencias: string[];
  ativo: boolean;
  _count: { participacoes: number };
};

type LinhaMatriz = { colaboradorId: string; nome: string; competencias: string[] };

function KpiCard({
  rotulo,
  valor,
  icone: Icone,
}: {
  rotulo: string;
  valor: number | string;
  icone: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-3.5 py-3 shadow-xs">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/20">
        <Icone className="size-4.5" />
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-xs text-muted-foreground">{rotulo}</p>
        <p className="text-lg font-semibold tabular-nums">{valor}</p>
      </div>
    </div>
  );
}

export function TreinamentosView({
  empresaId,
  treinamentos,
  matriz,
  competenciasDisponiveis,
}: {
  empresaId: string;
  treinamentos: Treinamento[];
  matriz: LinhaMatriz[];
  competenciasDisponiveis: OpcaoCatalogo[];
}) {
  const [criarAberto, setCriarAberto] = useState(false);
  const [editTreinamento, setEditTreinamento] = useState<Treinamento | null>(null);
  const [buscaCatalogo, setBuscaCatalogo] = useState("");
  const [buscaMatriz, setBuscaMatriz] = useState("");

  const totais = useMemo(() => {
    const ativos = treinamentos.filter((t) => t.ativo).length;
    const totalParticipacoes = treinamentos.reduce((acc, t) => acc + t._count.participacoes, 0);
    const mediaCarga =
      treinamentos.filter((t) => t.cargaHoraria).length > 0
        ? Math.round(
            treinamentos.reduce((acc, t) => acc + (t.cargaHoraria ?? 0), 0) /
              treinamentos.filter((t) => t.cargaHoraria).length,
          )
        : 0;
    return { total: treinamentos.length, ativos, totalParticipacoes, mediaCarga };
  }, [treinamentos]);

  const treinamentosFiltrados = useMemo(() => {
    const termo = buscaCatalogo.trim().toLowerCase();
    if (!termo) return treinamentos;
    return treinamentos.filter(
      (t) =>
        t.nome.toLowerCase().includes(termo) ||
        (t.categoria && t.categoria.toLowerCase().includes(termo)) ||
        (t.descricao && t.descricao.toLowerCase().includes(termo)),
    );
  }, [treinamentos, buscaCatalogo]);

  const matrizFiltrada = useMemo(() => {
    const termo = buscaMatriz.trim().toLowerCase();
    if (!termo) return matriz;
    return matriz.filter((m) => m.nome.toLowerCase().includes(termo));
  }, [matriz, buscaMatriz]);

  const { itensDaPagina: matrizNaPagina, ...paginacaoMatriz } = usePaginacao(matrizFiltrada);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>Treinamentos & trilhas</h1>
          <p className="text-sm text-muted-foreground">
            Capacitação de desenvolvimento geral — a obrigatória de segurança (NRs) fica em
            Conformidade.
          </p>
        </div>
        <Dialog open={criarAberto} onOpenChange={setCriarAberto}>
          <DialogTrigger render={<Button />}>
            <Plus className="size-4" />
            Novo treinamento
          </DialogTrigger>
          <DialogContent>
            <NovoTreinamentoForm
              empresaId={empresaId}
              competenciasDisponiveis={competenciasDisponiveis}
              onSuccess={() => setCriarAberto(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard rotulo="Total no catálogo" valor={totais.total} icone={BookOpen} />
        <KpiCard rotulo="Ativos" valor={totais.ativos} icone={Award} />
        <KpiCard rotulo="Total participações" valor={totais.totalParticipacoes} icone={Users} />
        <KpiCard rotulo="Carga média" valor={`${totais.mediaCarga}h`} icone={Clock} />
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Catálogo</CardTitle>
            <CardDescription>Participação de cada pessoa é registrada na ficha dela.</CardDescription>
          </div>
          <div className="relative w-full max-w-xs sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar treinamento ou categoria..."
              value={buscaCatalogo}
              onChange={(e) => setBuscaCatalogo(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
        </CardHeader>
        <CardContent>
          {treinamentosFiltrados.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {buscaCatalogo ? "Nenhum treinamento encontrado." : "Nenhum treinamento cadastrado ainda."}
            </p>
          ) : (
            <div className="rounded-md border">
              <Table compacta>
                <TableHeader>
                  <TableRow>
                    <TableHead>Treinamento</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Carga</TableHead>
                    <TableHead>Competências</TableHead>
                    <TableHead>Participações</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-16 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {treinamentosFiltrados.map((t) => (
                    <TableRow key={t.id} className={t.ativo ? "" : "opacity-60"}>
                      <TableCell className="font-medium">{t.nome}</TableCell>
                      <TableCell className="text-muted-foreground">{t.categoria ?? "—"}</TableCell>
                      <TableCell className="tabular-nums">{t.cargaHoraria ? `${t.cargaHoraria}h` : "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {t.competencias.length === 0
                            ? "—"
                            : t.competencias.map((c) => (
                                <Badge key={c} variant="outline" className="text-xs">
                                  {competenciaLabel(c)}
                                </Badge>
                              ))}
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums">{t._count.participacoes}</TableCell>
                      <TableCell>
                        <button
                          onClick={async () => {
                            const r = await alternarTreinamentoAtivo(empresaId, t.id);
                            if (r.ok) toast.success(t.ativo ? "Treinamento desativado." : "Treinamento ativado.");
                            else toast.error(r.error);
                          }}
                        >
                          <Badge variant={t.ativo ? "default" : "secondary"}>{t.ativo ? "Ativo" : "Inativo"}</Badge>
                        </button>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => setEditTreinamento(t)}
                          title="Editar treinamento"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
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
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Matriz de competências</CardTitle>
            <CardDescription>
              Quem já foi treinado em cada competência, a partir dos treinamentos com presença confirmada.
            </CardDescription>
          </div>
          <div className="relative w-full max-w-xs sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar colaborador..."
              value={buscaMatriz}
              onChange={(e) => setBuscaMatriz(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
        </CardHeader>
        <CardContent>
          {matrizFiltrada.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {buscaMatriz
                ? "Nenhum colaborador encontrado na matriz."
                : "Ninguém tem participação registrada em treinamento com competência associada ainda."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table compacta>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    {competenciasDisponiveis.map((c) => (
                      <TableHead key={c.value} className="text-center">
                        {c.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matrizNaPagina.map((linha) => (
                    <TableRow key={linha.colaboradorId}>
                      <TableCell className="font-medium whitespace-nowrap">{linha.nome}</TableCell>
                      {competenciasDisponiveis.map((c) => (
                        <TableCell key={c.value} className="text-center">
                          {linha.competencias.includes(c.value) && (
                            <Check className="mx-auto size-4 text-success" />
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="mt-4">
            <Paginacao
              total={paginacaoMatriz.total}
              porPagina={paginacaoMatriz.porPagina}
              paginaAtual={paginacaoMatriz.paginaAtual}
              totalPaginas={paginacaoMatriz.totalPaginas}
              onMudarPagina={paginacaoMatriz.irPara}
            />
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editTreinamento} onOpenChange={(o) => !o && setEditTreinamento(null)}>
        <DialogContent>
          {editTreinamento && (
            <EditarTreinamentoForm
              empresaId={empresaId}
              treinamento={editTreinamento}
              competenciasDisponiveis={competenciasDisponiveis}
              onSuccess={() => setEditTreinamento(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NovoTreinamentoForm({
  empresaId,
  competenciasDisponiveis,
  onSuccess,
}: {
  empresaId: string;
  competenciasDisponiveis: OpcaoCatalogo[];
  onSuccess: () => void;
}) {
  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await criarTreinamento(empresaId, prev, fd);
    if (result.ok) {
      toast.success("Treinamento adicionado ao catálogo.");
      onSuccess();
    }
    return result;
  }, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Novo treinamento</DialogTitle>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="nome">Nome</Label>
        <Input id="nome" name="nome" required autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="categoria">Categoria</Label>
          <Input id="categoria" name="categoria" placeholder="Ex.: Técnico, Liderança" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cargaHoraria">Carga horária (h)</Label>
          <Input id="cargaHoraria" name="cargaHoraria" type="number" min={1} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="descricao">Descrição</Label>
        <Textarea id="descricao" name="descricao" rows={2} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Competências desenvolvidas</Label>
        <div className="grid grid-cols-2 gap-2">
          {competenciasDisponiveis.map((c) => (
            <label key={c.value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="competencias"
                value={c.value}
                className="size-4 rounded border-input accent-primary"
              />
              {c.label}
            </label>
          ))}
        </div>
      </div>
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Criando..." : "Criar treinamento"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function EditarTreinamentoForm({
  empresaId,
  treinamento,
  competenciasDisponiveis,
  onSuccess,
}: {
  empresaId: string;
  treinamento: Treinamento;
  competenciasDisponiveis: OpcaoCatalogo[];
  onSuccess: () => void;
}) {
  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await editarTreinamento(empresaId, treinamento.id, prev, fd);
    if (result.ok) {
      toast.success("Treinamento atualizado.");
      onSuccess();
    }
    return result;
  }, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Editar treinamento</DialogTitle>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="nome">Nome</Label>
        <Input id="nome" name="nome" defaultValue={treinamento.nome} required autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="categoria">Categoria</Label>
          <Input
            id="categoria"
            name="categoria"
            defaultValue={treinamento.categoria ?? ""}
            placeholder="Ex.: Técnico, Liderança"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cargaHoraria">Carga horária (h)</Label>
          <Input
            id="cargaHoraria"
            name="cargaHoraria"
            type="number"
            min={1}
            defaultValue={treinamento.cargaHoraria ?? ""}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="descricao">Descrição</Label>
        <Textarea id="descricao" name="descricao" rows={2} defaultValue={treinamento.descricao ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Competências desenvolvidas</Label>
        <div className="grid grid-cols-2 gap-2">
          {competenciasDisponiveis.map((c) => (
            <label key={c.value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="competencias"
                value={c.value}
                defaultChecked={treinamento.competencias.includes(c.value)}
                className="size-4 rounded border-input accent-primary"
              />
              {c.label}
            </label>
          ))}
        </div>
      </div>
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando..." : "Salvar alterações"}
        </Button>
      </DialogFooter>
    </form>
  );
}