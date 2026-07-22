"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createSetor, updateSetor, deleteSetor, toggleSetorAtivo } from "@/lib/actions/rh-setores";
import type { ActionResult } from "@/lib/constants";

type Setor = {
  id: string;
  nome: string;
  ativo: boolean;
  _count: { colaboradores: number };
};

const initialState: ActionResult = { ok: true };

export function SetoresTable({ empresaId, setores }: { empresaId: string; setores: Setor[] }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editSetor, setEditSetor] = useState<Setor | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="size-4" />
            Novo Setor
          </DialogTrigger>
          <DialogContent>
            <SetorForm
              action={createSetor.bind(null, empresaId)}
              title="Novo Setor"
              onSuccess={() => setCreateOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Setor</TableHead>
              <TableHead>Colaboradores</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {setores.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  Nenhum setor cadastrado ainda.
                </TableCell>
              </TableRow>
            )}
            {setores.map((s) => (
              <TableRow key={s.id} className={s.ativo ? "" : "opacity-60"}>
                <TableCell className="font-medium">{s.nome}</TableCell>
                <TableCell>{s._count.colaboradores}</TableCell>
                <TableCell>
                  <button
                    onClick={async () => {
                      const result = await toggleSetorAtivo(empresaId, s.id, !s.ativo);
                      if (result.ok) toast.success(s.ativo ? "Setor desativado." : "Setor ativado.");
                    }}
                  >
                    <Badge variant={s.ativo ? "default" : "secondary"}>{s.ativo ? "Ativo" : "Inativo"}</Badge>
                  </button>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditSetor(s)}>
                      <Pencil className="size-4" />
                    </Button>
                    <DeleteSetorButton empresaId={empresaId} setor={s} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editSetor} onOpenChange={(open) => !open && setEditSetor(null)}>
        <DialogContent>
          {editSetor && (
            <SetorForm
              action={updateSetor.bind(null, empresaId, editSetor.id)}
              title="Editar Setor"
              defaultNome={editSetor.nome}
              onSuccess={() => setEditSetor(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SetorForm({
  action,
  title,
  defaultNome = "",
  onSuccess,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  title: string;
  defaultNome?: string;
  onSuccess: () => void;
}) {
  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await action(prev, fd);
    if (result.ok) {
      toast.success("Setor salvo com sucesso.");
      onSuccess();
    }
    return result;
  }, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="nome">Nome do setor</Label>
        <Input id="nome" name="nome" defaultValue={defaultNome} required autoFocus />
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

function DeleteSetorButton({ empresaId, setor }: { empresaId: string; setor: Setor }) {
  const [confirming, setConfirming] = useState(false);

  async function handleDelete() {
    const result = await deleteSetor(empresaId, setor.id);
    if (result.ok) {
      toast.success("Setor excluído.");
    } else {
      toast.error(result.error);
    }
    setConfirming(false);
  }

  if (confirming) {
    return (
      <div className="flex gap-1">
        <Button variant="destructive" size="sm" onClick={handleDelete}>
          Confirmar
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
          Cancelar
        </Button>
      </div>
    );
  }

  return (
    <Button variant="ghost" size="icon" onClick={() => setConfirming(true)}>
      <Trash2 className="size-4" />
    </Button>
  );
}
