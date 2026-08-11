"use client";

import { useActionState, useState, useMemo } from "react";
import { useFiltroEmpresas } from "../filtro-empresas";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  createTipoBeneficio,
  updateTipoBeneficio,
  deleteTipoBeneficio,
  toggleTipoBeneficioAtivo,
} from "@/lib/actions/rh-tipos-beneficio";
import { TIPOS_BENEFICIO } from "@/lib/constants-beneficios";
import type { ActionResult } from "@/lib/constants";

type Empresa = { id: string; nome: string };
type TipoBeneficio = { id: string; nome: string; ativo: boolean; empresaId: string; empresa: Empresa };

const initialState: ActionResult = { ok: true };

export function TiposBeneficioTable({
  empresaId,
  empresasDoUsuario,
  tipos,
}: {
  empresaId: string;
  empresasDoUsuario: string[];
  tipos: TipoBeneficio[];
}) {
  const empresasSelecionadas = useFiltroEmpresas(empresasDoUsuario);
  const tiposFiltrados = useMemo(
    () => tipos.filter(t => empresasSelecionadas.includes(t.empresaId)),
    [tipos, empresasSelecionadas],
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [editTipo, setEditTipo] = useState<TipoBeneficio | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Tipos de benefício</h2>
        <p className="text-sm text-muted-foreground">
          O catálogo padrão ({TIPOS_BENEFICIO.length} tipos — vale-transporte, plano de saúde etc.)
          continua disponível sempre. Cadastre aqui só o que essa empresa oferece e não está no
          padrão.
        </p>
      </div>

      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="size-4" />
            Novo tipo
          </DialogTrigger>
          <DialogContent>
            <TipoBeneficioForm
              action={createTipoBeneficio.bind(null, empresaId)}
              title="Novo tipo de benefício"
              onSuccess={() => setCreateOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tiposFiltrados.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                  Nenhum tipo adicional cadastrado — o catálogo padrão segue disponível na tela de
                  Benefícios.
                </TableCell>
              </TableRow>
            )}
            {tiposFiltrados.map(t => (
              <TableRow key={t.id} className={t.ativo ? "" : "opacity-60"}>
                <TableCell className="font-medium">{t.nome}</TableCell>
                <TableCell>
                  <button
                    onClick={async () => {
                      const result = await toggleTipoBeneficioAtivo(empresaId, t.id, !t.ativo);
                      if (result.ok) toast.success(t.ativo ? "Tipo desativado." : "Tipo ativado.");
                    }}
                  >
                    <Badge variant={t.ativo ? "default" : "secondary"}>
                      {t.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  </button>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditTipo(t)}>
                      <Pencil className="size-4" />
                    </Button>
                    <DeleteTipoBeneficioButton empresaId={empresaId} tipo={t} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editTipo} onOpenChange={open => !open && setEditTipo(null)}>
        <DialogContent>
          {editTipo && (
            <TipoBeneficioForm
              action={updateTipoBeneficio.bind(null, empresaId, editTipo.id)}
              title="Editar tipo de benefício"
              defaultNome={editTipo.nome}
              onSuccess={() => setEditTipo(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TipoBeneficioForm({
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
      toast.success("Tipo de benefício salvo.");
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
        <Label htmlFor="nome">Nome do tipo</Label>
        <Input
          id="nome"
          name="nome"
          defaultValue={defaultNome}
          placeholder="Ex.: Auxílio-home-office"
          required
          autoFocus
        />
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

function DeleteTipoBeneficioButton({ empresaId, tipo }: { empresaId: string; tipo: TipoBeneficio }) {
  const [confirming, setConfirming] = useState(false);

  async function handleDelete() {
    const result = await deleteTipoBeneficio(empresaId, tipo.id);
    if (result.ok) {
      toast.success("Tipo excluído.");
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
