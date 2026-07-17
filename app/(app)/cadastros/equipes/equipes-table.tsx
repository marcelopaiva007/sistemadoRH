"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { createEquipe, updateEquipe, deleteEquipe } from "@/lib/actions/cadastros";
import type { ActionResult } from "@/lib/constants";

type Funcionario = { id: string; nome: string };
type Equipe = {
  id: string;
  nome: string;
  supervisorId: string | null;
  supervisor: Funcionario | null;
  tamanhoTier: number | null;
  _count: { membros: number };
};

const initialState: ActionResult = { ok: true };

export function EquipesTable({
  equipes,
  supervisores,
}: {
  equipes: Equipe[];
  supervisores: Funcionario[];
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editEquipe, setEditEquipe] = useState<Equipe | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="size-4" />
            Nova Equipe
          </DialogTrigger>
          <DialogContent>
            <EquipeForm
              action={createEquipe}
              title="Nova Equipe"
              supervisores={supervisores}
              onSuccess={() => setCreateOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Equipe</TableHead>
              <TableHead>Supervisor</TableHead>
              <TableHead>Membros</TableHead>
              <TableHead>Tamanho (bônus)</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {equipes.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Nenhuma equipe cadastrada ainda.
                </TableCell>
              </TableRow>
            )}
            {equipes.map((equipe) => (
              <TableRow key={equipe.id}>
                <TableCell className="font-medium">{equipe.nome}</TableCell>
                <TableCell>{equipe.supervisor?.nome ?? "—"}</TableCell>
                <TableCell>{equipe._count.membros}</TableCell>
                <TableCell>
                  {equipe.supervisor ? (
                    <Badge variant="secondary">{equipe._count.membros + 1} pessoas</Badge>
                  ) : (
                    <span className="text-muted-foreground">sem supervisor</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditEquipe(equipe)}>
                      <Pencil className="size-4" />
                    </Button>
                    <DeleteEquipeButton equipe={equipe} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editEquipe} onOpenChange={(open) => !open && setEditEquipe(null)}>
        <DialogContent>
          {editEquipe && (
            <EquipeForm
              action={updateEquipe.bind(null, editEquipe.id)}
              title="Editar Equipe"
              supervisores={supervisores}
              defaultValues={editEquipe}
              onSuccess={() => setEditEquipe(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EquipeForm({
  action,
  title,
  supervisores,
  defaultValues,
  onSuccess,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  title: string;
  supervisores: Funcionario[];
  defaultValues?: Equipe;
  onSuccess: () => void;
}) {
  const [supervisorId, setSupervisorId] = useState(defaultValues?.supervisorId ?? "");

  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await action(prev, fd);
    if (result.ok) {
      toast.success("Equipe salva com sucesso.");
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
        <Label htmlFor="nome">Nome da equipe</Label>
        <Input id="nome" name="nome" defaultValue={defaultValues?.nome ?? ""} required autoFocus />
      </div>
      <div className="space-y-2">
        <Label>Supervisor</Label>
        <Select
          value={supervisorId}
          onValueChange={(v) => setSupervisorId(v ?? "")}
          name="supervisorId"
          items={Object.fromEntries(supervisores.map((s) => [s.id, s.nome]))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione um supervisor" />
          </SelectTrigger>
          <SelectContent>
            {supervisores.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">
        O tamanho da equipe usado no bônus do supervisor é contado automaticamente
        (membros ativos + o supervisor) — não é mais necessário informar a faixa.
      </p>
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

function DeleteEquipeButton({ equipe }: { equipe: Equipe }) {
  const [confirming, setConfirming] = useState(false);

  async function handleDelete() {
    const result = await deleteEquipe(equipe.id);
    if (result.ok) {
      toast.success("Equipe excluída.");
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
