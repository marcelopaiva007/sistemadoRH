"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { criarCiclo } from "@/lib/actions/rh-avaliacao";
import { TIPOS_CICLO, tipoCicloLabel } from "@/lib/constants-avaliacao";
import { formatarData } from "@/lib/datas";
import type { ActionResult } from "@/lib/constants";

const initialState: ActionResult = { ok: true };
const classeSelect =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

type Ciclo = {
  id: string;
  nome: string;
  tipo: string;
  dataInicio: Date;
  dataFim: Date;
  encerrado: boolean;
  progresso: { total: number; concluidas: number };
};

export function AvaliacoesView({ empresaId, ciclos }: { empresaId: string; ciclos: Ciclo[] }) {
  const [criarAberto, setCriarAberto] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Avaliação de desempenho</h2>
          <p className="text-sm text-muted-foreground">
            Ciclos 90° (só gestor), 180° (autoavaliação + gestor) e 360° (múltiplas fontes), com
            competências e nine-box.
          </p>
        </div>
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
