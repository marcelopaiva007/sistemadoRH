"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { criarMeta, atualizarMeta, excluirMeta } from "@/lib/actions/rh-metas";
import { STATUS_META, statusMetaLabel } from "@/lib/constants-metas";
import { formatarData } from "@/lib/datas";
import type { ActionResult } from "@/lib/constants";
import { Indicador } from "@/components/indicador";

const initialState: ActionResult = { ok: true };
const classeSelect =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

type Meta = {
  id: string;
  titulo: string;
  descricao: string | null;
  dataInicio: Date;
  dataFim: Date;
  progresso: number;
  status: string;
  colaborador: { id: string; nome: string } | null;
  setor: { id: string; nome: string } | null;
};

const variantePorStatus: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  EM_ANDAMENTO: "outline",
  ATINGIDA: "default",
  NAO_ATINGIDA: "destructive",
  CANCELADA: "secondary",
};

export function MetasView({
  empresaId,
  metas,
  colaboradores,
  setores,
}: {
  empresaId: string;
  metas: Meta[];
  colaboradores: { id: string; nome: string }[];
  setores: { id: string; nome: string }[];
}) {
  const [criarAberto, setCriarAberto] = useState(false);
  const [editar, setEditar] = useState<Meta | null>(null);

  const emAndamento = metas.filter((m) => m.status === "EM_ANDAMENTO").length;
  const atingidas = metas.filter((m) => m.status === "ATINGIDA").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Metas</h2>
          <p className="text-sm text-muted-foreground">
            Individuais ou de setor. PDI (plano de desenvolvimento) fica na ficha de cada pessoa.
          </p>
        </div>
        <Dialog open={criarAberto} onOpenChange={setCriarAberto}>
          <DialogTrigger render={<Button />}>
            <Plus className="size-4" />
            Nova meta
          </DialogTrigger>
          <DialogContent>
            <NovaMetaForm
              empresaId={empresaId}
              colaboradores={colaboradores}
              setores={setores}
              onSuccess={() => setCriarAberto(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Indicador rotulo="Total de metas" valor={metas.length} />
        <Indicador rotulo="Em andamento" valor={emAndamento} />
        <Indicador rotulo="Atingidas" valor={atingidas} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registros</CardTitle>
          <CardDescription>Prazo mais próximo primeiro.</CardDescription>
        </CardHeader>
        <CardContent>
          {metas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma meta cadastrada ainda.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Meta</TableHead>
                    <TableHead>Alvo</TableHead>
                    <TableHead>Prazo</TableHead>
                    <TableHead>Progresso</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metas.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.titulo}</TableCell>
                      <TableCell>
                        {m.colaborador ? (
                          <Link href={`/rh/${empresaId}/colaboradores/${m.colaborador.id}`} className="hover:underline">
                            {m.colaborador.nome}
                          </Link>
                        ) : (
                          <span>Setor {m.setor?.nome}</span>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap">
                        {formatarData(m.dataInicio)} a {formatarData(m.dataFim)}
                      </TableCell>
                      <TableCell className="w-40">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full bg-primary transition-[width]"
                              style={{ width: `${m.progresso}%` }}
                            />
                          </div>
                          <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">{m.progresso}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={variantePorStatus[m.status] ?? "outline"}>{statusMetaLabel(m.status)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => setEditar(m)}>
                          Editar
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

      <Dialog open={!!editar} onOpenChange={(open) => !open && setEditar(null)}>
        <DialogContent>
          {editar && (
            <EditarMetaForm empresaId={empresaId} meta={editar} onSuccess={() => setEditar(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


function NovaMetaForm({
  empresaId,
  colaboradores,
  setores,
  onSuccess,
}: {
  empresaId: string;
  colaboradores: { id: string; nome: string }[];
  setores: { id: string; nome: string }[];
  onSuccess: () => void;
}) {
  const [tipo, setTipo] = useState<"colaborador" | "setor">("colaborador");
  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await criarMeta(empresaId, prev, fd);
    if (result.ok) {
      toast.success("Meta criada.");
      onSuccess();
    }
    return result;
  }, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Nova meta</DialogTitle>
      </DialogHeader>
      <div className="space-y-2">
        <Label>Tipo</Label>
        <select
          name="tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as "colaborador" | "setor")}
          className={classeSelect}
        >
          <option value="colaborador">Individual</option>
          <option value="setor">Setor</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="alvoId">{tipo === "colaborador" ? "Colaborador" : "Setor"}</Label>
        <select id="alvoId" name="alvoId" required defaultValue="" className={classeSelect}>
          <option value="" disabled>
            {tipo === "colaborador" ? "Escolha o colaborador" : "Escolha o setor"}
          </option>
          {(tipo === "colaborador" ? colaboradores : setores).map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="titulo">Título</Label>
        <Input id="titulo" name="titulo" required autoFocus />
      </div>
      <div className="space-y-2">
        <Label htmlFor="descricao">Descrição</Label>
        <Textarea id="descricao" name="descricao" rows={2} />
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
          {isPending ? "Criando..." : "Criar meta"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function EditarMetaForm({ empresaId, meta, onSuccess }: { empresaId: string; meta: Meta; onSuccess: () => void }) {
  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await atualizarMeta(empresaId, meta.id, prev, fd);
    if (result.ok) {
      toast.success("Meta atualizada.");
      onSuccess();
    }
    return result;
  }, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{meta.titulo}</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <select id="status" name="status" defaultValue={meta.status} className={classeSelect}>
            {STATUS_META.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="progresso">Progresso (%)</Label>
          <Input id="progresso" name="progresso" type="number" min={0} max={100} defaultValue={meta.progresso} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="descricao">Descrição</Label>
        <Textarea id="descricao" name="descricao" rows={2} defaultValue={meta.descricao ?? ""} />
      </div>
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <DialogFooter className="justify-between">
        <ExcluirMetaButton empresaId={empresaId} metaId={meta.id} onSuccess={onSuccess} />
        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ExcluirMetaButton({ empresaId, metaId, onSuccess }: { empresaId: string; metaId: string; onSuccess: () => void }) {
  const [confirmando, setConfirmando] = useState(false);

  if (confirmando) {
    return (
      <div className="flex gap-1">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={async () => {
            const r = await excluirMeta(empresaId, metaId);
            if (r.ok) {
              toast.success("Meta excluída.");
              onSuccess();
            } else toast.error(r.error);
          }}
        >
          Confirmar exclusão
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(false)}>
          Cancelar
        </Button>
      </div>
    );
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(true)}>
      Excluir
    </Button>
  );
}
