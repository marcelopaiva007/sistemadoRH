"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { salvarNotasAvaliacao } from "@/lib/actions/rh-avaliacao";
import {
  NIVEIS_POTENCIAL,
  tipoAvaliadorLabel,
  tipoCicloLabel,
} from "@/lib/constants-avaliacao";
import type { OpcaoCatalogo } from "@/lib/catalogos";
import type { ActionResult } from "@/lib/constants";

const initialState: ActionResult = { ok: true };
const classeSelect =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

type Avaliacao = {
  id: string;
  tipoAvaliador: string;
  avaliadorNome: string | null;
  notaFinal: number | null;
  potencial: string | null;
  pontosFortes: string | null;
  pontosDesenvolvimento: string | null;
  comentarios: string | null;
  status: string;
  concluidaEm: Date | null;
  ciclo: { id: string; nome: string; tipo: string; encerrado: boolean };
  notas: { competencia: string; nota: number }[];
};

export function DesempenhoCard({
  empresaId,
  colaboradorId,
  avaliacoes,
  competenciasDisponiveis,
}: {
  empresaId: string;
  colaboradorId: string;
  avaliacoes: Avaliacao[];
  competenciasDisponiveis: OpcaoCatalogo[];
}) {
  const [preencher, setPreencher] = useState<Avaliacao | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Avaliações de desempenho</CardTitle>
        <CardDescription>
          Uma linha por ciclo/avaliador. Ciclos são gerenciados em{" "}
          <Link href={`/rh/${empresaId}/avaliacoes`} className="underline">
            Avaliações
          </Link>
          .
        </CardDescription>
      </CardHeader>
      <CardContent>
        {avaliacoes.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhuma avaliação registrada para esta pessoa ainda.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ciclo</TableHead>
                  <TableHead>Avaliador</TableHead>
                  <TableHead>Nota</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-28 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {avaliacoes.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link href={`/rh/${empresaId}/avaliacoes/${a.ciclo.id}`} className="font-medium hover:underline">
                        {a.ciclo.nome}
                      </Link>
                      <div className="text-xs text-muted-foreground">{tipoCicloLabel(a.ciclo.tipo)}</div>
                    </TableCell>
                    <TableCell>
                      {tipoAvaliadorLabel(a.tipoAvaliador)}
                      {a.avaliadorNome && <span className="ml-1.5 text-muted-foreground">({a.avaliadorNome})</span>}
                    </TableCell>
                    <TableCell className="tabular-nums">{a.notaFinal ? a.notaFinal.toFixed(1) : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={a.status === "CONCLUIDA" ? "default" : "outline"}>
                        {a.status === "CONCLUIDA" ? "Concluída" : "Pendente"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {!a.ciclo.encerrado && (
                        <Button variant="ghost" size="sm" onClick={() => setPreencher(a)}>
                          {a.status === "CONCLUIDA" ? "Ver / editar" : "Preencher"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!preencher} onOpenChange={(open) => !open && setPreencher(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          {preencher && (
            <PreencherForm
              empresaId={empresaId}
              colaboradorId={colaboradorId}
              avaliacao={preencher}
              competenciasDisponiveis={competenciasDisponiveis}
              onSuccess={() => setPreencher(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function PreencherForm({
  empresaId,
  avaliacao,
  competenciasDisponiveis,
  onSuccess,
}: {
  empresaId: string;
  colaboradorId: string;
  avaliacao: Avaliacao;
  competenciasDisponiveis: OpcaoCatalogo[];
  onSuccess: () => void;
}) {
  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await salvarNotasAvaliacao(empresaId, avaliacao.id, prev, fd);
    if (result.ok) {
      toast.success("Avaliação salva.");
      onSuccess();
    }
    return result;
  }, initialState);

  const notaDe = (competencia: string) => avaliacao.notas.find((n) => n.competencia === competencia)?.nota ?? "";

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>
          {avaliacao.ciclo.nome} — {tipoAvaliadorLabel(avaliacao.tipoAvaliador)}
        </DialogTitle>
      </DialogHeader>

      <div className="grid gap-3 sm:grid-cols-2">
        {competenciasDisponiveis.map((c) => (
          <div key={c.value} className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">{c.label}</Label>
            <select name={`nota_${c.value}`} required defaultValue={notaDe(c.value)} className={classeSelect}>
              <option value="" disabled>
                Nota
              </option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {avaliacao.tipoAvaliador === "GESTOR" && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            Potencial (alimenta o nine-box)
          </Label>
          <select name="potencial" defaultValue={avaliacao.potencial ?? ""} className={classeSelect}>
            <option value="">Não informar</option>
            {NIVEIS_POTENCIAL.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Pontos fortes</Label>
        <Textarea name="pontosFortes" rows={2} defaultValue={avaliacao.pontosFortes ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Pontos de desenvolvimento</Label>
        <Textarea name="pontosDesenvolvimento" rows={2} defaultValue={avaliacao.pontosDesenvolvimento ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Comentários</Label>
        <Textarea name="comentarios" rows={2} defaultValue={avaliacao.comentarios ?? ""} />
      </div>

      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </form>
  );
}
