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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createCidade, updateCidade, deleteCidade } from "@/lib/actions/cadastros";
import type { ActionResult } from "@/lib/constants";

type Cidade = {
  id: string;
  nome: string;
  _count: { funcionarios: number };
};

const initialState: ActionResult = { ok: true };

export function CidadesTable({ cidades }: { cidades: Cidade[] }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editCidade, setEditCidade] = useState<Cidade | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="size-4" />
            Nova Cidade
          </DialogTrigger>
          <DialogContent>
            <CidadeForm
              action={createCidade}
              title="Nova Cidade"
              onSuccess={() => setCreateOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cidade</TableHead>
              <TableHead>Funcionários</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cidades.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                  Nenhuma cidade cadastrada ainda.
                </TableCell>
              </TableRow>
            )}
            {cidades.map((cidade) => (
              <TableRow key={cidade.id}>
                <TableCell className="font-medium">{cidade.nome}</TableCell>
                <TableCell>{cidade._count.funcionarios}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditCidade(cidade)}>
                      <Pencil className="size-4" />
                    </Button>
                    <DeleteCidadeButton cidade={cidade} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editCidade} onOpenChange={(open) => !open && setEditCidade(null)}>
        <DialogContent>
          {editCidade && (
            <CidadeForm
              action={updateCidade.bind(null, editCidade.id)}
              title="Editar Cidade"
              defaultNome={editCidade.nome}
              onSuccess={() => setEditCidade(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CidadeForm({
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
      toast.success("Cidade salva com sucesso.");
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
        <Label htmlFor="nome">Nome da cidade</Label>
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

function DeleteCidadeButton({ cidade }: { cidade: Cidade }) {
  const [confirming, setConfirming] = useState(false);

  async function handleDelete() {
    const result = await deleteCidade(cidade.id);
    if (result.ok) {
      toast.success("Cidade excluída.");
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
