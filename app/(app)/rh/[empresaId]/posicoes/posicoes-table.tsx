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
import { createPosicao, updatePosicao, deletePosicao, togglePosicaoAtiva } from "@/lib/actions/rh-posicoes";
import type { ActionResult } from "@/lib/constants";

type Posicao = {
  id: string;
  nome: string;
  ativo: boolean;
  _count: { colaboradores: number };
};

const initialState: ActionResult = { ok: true };

export function PosicoesTable({ empresaId, posicoes }: { empresaId: string; posicoes: Posicao[] }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editPosicao, setEditPosicao] = useState<Posicao | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="size-4" />
            Nova Posição
          </DialogTrigger>
          <DialogContent>
            <PosicaoForm
              action={createPosicao.bind(null, empresaId)}
              title="Nova Posição"
              onSuccess={() => setCreateOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Posição</TableHead>
              <TableHead>Colaboradores</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {posicoes.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  Nenhuma posição cadastrada ainda.
                </TableCell>
              </TableRow>
            )}
            {posicoes.map((p) => (
              <TableRow key={p.id} className={p.ativo ? "" : "opacity-60"}>
                <TableCell className="font-medium">{p.nome}</TableCell>
                <TableCell>{p._count.colaboradores}</TableCell>
                <TableCell>
                  <button
                    onClick={async () => {
                      const result = await togglePosicaoAtiva(empresaId, p.id, !p.ativo);
                      if (result.ok) toast.success(p.ativo ? "Posição desativada." : "Posição ativada.");
                    }}
                  >
                    <Badge variant={p.ativo ? "default" : "secondary"}>{p.ativo ? "Ativa" : "Inativa"}</Badge>
                  </button>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditPosicao(p)}>
                      <Pencil className="size-4" />
                    </Button>
                    <DeletePosicaoButton empresaId={empresaId} posicao={p} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editPosicao} onOpenChange={(open) => !open && setEditPosicao(null)}>
        <DialogContent>
          {editPosicao && (
            <PosicaoForm
              action={updatePosicao.bind(null, empresaId, editPosicao.id)}
              title="Editar Posição"
              defaultNome={editPosicao.nome}
              onSuccess={() => setEditPosicao(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PosicaoForm({
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
      toast.success("Posição salva com sucesso.");
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
        <Label htmlFor="nome">Nome da posição</Label>
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

function DeletePosicaoButton({ empresaId, posicao }: { empresaId: string; posicao: Posicao }) {
  const [confirming, setConfirming] = useState(false);

  async function handleDelete() {
    const result = await deletePosicao(empresaId, posicao.id);
    if (result.ok) {
      toast.success("Posição excluída.");
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
