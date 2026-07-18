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
import { createUsuario, updateUsuario, deleteUsuario } from "@/lib/actions/usuarios";
import { ROLES, type ActionResult } from "@/lib/constants";

type Usuario = {
  id: string;
  nome: string;
  username: string;
  role: string;
  createdAt: string;
};

const initialState: ActionResult = { ok: true };

const roleLabel = (role: string) => ROLES.find((r) => r.value === role)?.label ?? role;

export function UsuariosTable({
  usuarios,
  currentUserId,
}: {
  usuarios: Usuario[];
  currentUserId: string;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editUsuario, setEditUsuario] = useState<Usuario | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="size-4" />
            Novo Usuário
          </DialogTrigger>
          <DialogContent>
            <UsuarioForm
              action={createUsuario}
              title="Novo Usuário"
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
              <TableHead>Login</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuarios.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  Nenhum usuário cadastrado ainda.
                </TableCell>
              </TableRow>
            )}
            {usuarios.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">
                  {u.nome}
                  {u.id === currentUserId && (
                    <span className="ml-2 text-xs text-muted-foreground">(você)</span>
                  )}
                </TableCell>
                <TableCell>{u.username}</TableCell>
                <TableCell>
                  <Badge variant={u.role === "ADMIN" ? "default" : "secondary"}>
                    {roleLabel(u.role)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditUsuario(u)}>
                      <Pencil className="size-4" />
                    </Button>
                    {u.id !== currentUserId && <DeleteUsuarioButton usuario={u} />}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editUsuario} onOpenChange={(open) => !open && setEditUsuario(null)}>
        <DialogContent>
          {editUsuario && (
            <UsuarioForm
              action={updateUsuario.bind(null, editUsuario.id)}
              title="Editar Usuário"
              defaultValues={editUsuario}
              onSuccess={() => setEditUsuario(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UsuarioForm({
  action,
  title,
  defaultValues,
  onSuccess,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  title: string;
  defaultValues?: Usuario;
  onSuccess: () => void;
}) {
  const isEdit = !!defaultValues;
  const [role, setRole] = useState(defaultValues?.role ?? "DIRETORIA");

  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await action(prev, fd);
    if (result.ok) {
      toast.success("Usuário salvo com sucesso.");
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
        <Label htmlFor="nome">Nome</Label>
        <Input id="nome" name="nome" defaultValue={defaultValues?.nome ?? ""} required autoFocus />
      </div>
      <div className="space-y-2">
        <Label htmlFor="username">Login</Label>
        <Input
          id="username"
          name="username"
          defaultValue={defaultValues?.username ?? ""}
          placeholder="ex.: joao.silva"
          autoComplete="off"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="senha">{isEdit ? "Nova senha (opcional)" : "Senha"}</Label>
        <Input
          id="senha"
          name="senha"
          type="password"
          autoComplete="new-password"
          placeholder={isEdit ? "Deixe em branco para manter a atual" : "Mínimo 8 caracteres"}
          required={!isEdit}
        />
      </div>
      <div className="space-y-2">
        <Label>Papel de acesso</Label>
        <Select
          value={role}
          onValueChange={(v) => setRole(v ?? "DIRETORIA")}
          name="role"
          items={Object.fromEntries(ROLES.map((r) => [r.value, r.label]))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione o papel" />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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

function DeleteUsuarioButton({ usuario }: { usuario: Usuario }) {
  const [confirming, setConfirming] = useState(false);

  async function handleDelete() {
    const result = await deleteUsuario(usuario.id);
    if (result.ok) {
      toast.success("Usuário excluído.");
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
