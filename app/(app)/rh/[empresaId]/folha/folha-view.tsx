"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Lock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { abrirCompetencia } from "@/lib/actions/rh-folha";
import { formatarCompetencia } from "@/lib/constants-folha";
import { formatarData } from "@/lib/datas";
import type { ActionResult } from "@/lib/constants";

const initialState: ActionResult = { ok: true };

type Competencia = {
  id: string;
  referencia: Date;
  status: string;
  fechadaEm: Date | null;
  fechadaPorNome: string | null;
  _count: { eventos: number };
};

export function FolhaView({
  empresaId,
  competencias,
}: {
  empresaId: string;
  competencias: Competencia[];
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Folha — eventos variáveis</h2>
          <p className="text-sm text-muted-foreground">
            O que muda todo mês e a contabilidade precisa receber. Este sistema não calcula folha —
            informa quantidade e valor; quem transforma em salário é o escritório.
          </p>
        </div>
        <Dialog open={aberto} onOpenChange={setAberto}>
          <DialogTrigger render={<Button />}>
            <Plus className="size-4" />
            Abrir competência
          </DialogTrigger>
          <DialogContent>
            <AbrirCompetenciaForm empresaId={empresaId} onSuccess={() => setAberto(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Competências</CardTitle>
          <CardDescription>Mais recente primeiro. Fechada não aceita mais lançamento.</CardDescription>
        </CardHeader>
        <CardContent>
          {competencias.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma competência aberta ainda.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Competência</TableHead>
                    <TableHead>Lançamentos</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Fechamento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {competencias.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link href={`/rh/${empresaId}/folha/${c.id}`} className="font-medium hover:underline">
                          {formatarCompetencia(c.referencia)}
                        </Link>
                      </TableCell>
                      <TableCell className="tabular-nums">{c._count.eventos}</TableCell>
                      <TableCell>
                        {c.status === "FECHADA" ? (
                          <Badge variant="secondary" className="gap-1">
                            <Lock className="size-3" />
                            Fechada
                          </Badge>
                        ) : (
                          <Badge variant="default">Aberta</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.fechadaEm
                          ? `${formatarData(c.fechadaEm)}${c.fechadaPorNome ? ` por ${c.fechadaPorNome}` : ""}`
                          : "—"}
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

function AbrirCompetenciaForm({ empresaId, onSuccess }: { empresaId: string; onSuccess: () => void }) {
  const agora = new Date();
  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await abrirCompetencia(empresaId, prev, fd);
    if (result.ok) {
      toast.success("Competência aberta.");
      onSuccess();
    }
    return result;
  }, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Abrir competência</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="mes">Mês</Label>
          <Input id="mes" name="mes" type="number" min={1} max={12} defaultValue={agora.getMonth() + 1} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ano">Ano</Label>
          <Input id="ano" name="ano" type="number" min={2020} max={2100} defaultValue={agora.getFullYear()} required />
        </div>
      </div>
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Abrindo..." : "Abrir"}
        </Button>
      </DialogFooter>
    </form>
  );
}
