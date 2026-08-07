"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { criarTreinamento, alternarTreinamentoAtivo } from "@/lib/actions/rh-treinamentos";
import { competenciaLabel } from "@/lib/constants-avaliacao";
import type { OpcaoCatalogo } from "@/lib/catalogos";
import type { ActionResult } from "@/lib/constants";

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Treinamentos & trilhas</h2>
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

      <Card>
        <CardHeader>
          <CardTitle>Catálogo</CardTitle>
          <CardDescription>Participação de cada pessoa é registrada na ficha dela.</CardDescription>
        </CardHeader>
        <CardContent>
          {treinamentos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum treinamento cadastrado ainda.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Treinamento</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Carga</TableHead>
                    <TableHead>Competências</TableHead>
                    <TableHead>Participações</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {treinamentos.map((t) => (
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
          <CardTitle>Matriz de competências</CardTitle>
          <CardDescription>
            Quem já foi treinado em cada competência, a partir dos treinamentos com presença confirmada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {matriz.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Ninguém tem participação registrada em treinamento com competência associada ainda.
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
                  {matriz.map((linha) => (
                    <TableRow key={linha.colaboradorId}>
                      <TableCell className="font-medium whitespace-nowrap">{linha.nome}</TableCell>
                      {competenciasDisponiveis.map((c) => (
                        <TableCell key={c.value} className="text-center">
                          {linha.competencias.includes(c.value) && <Check className="mx-auto size-4 text-success" />}
                        </TableCell>
                      ))}
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
              <input type="checkbox" name="competencias" value={c.value} className="size-4 rounded border-input accent-primary" />
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
