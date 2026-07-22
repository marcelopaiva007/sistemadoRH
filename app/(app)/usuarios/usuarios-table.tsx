"use client";

import { useActionState, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, KeyRound } from "lucide-react";
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
import {
  createUsuario,
  updateUsuario,
  deleteUsuario,
  resetSenhaUsuario,
} from "@/lib/actions/usuarios";
import type { ActionResult } from "@/lib/constants";

const ROLES = [
  { value: "ADMIN", label: "Administrativo/Financeiro" },
  { value: "DIRETORIA", label: "Diretoria/Gestão" },
  { value: "RH_MANAGER", label: "RH (gestor de empresa)" },
  { value: "GESTOR_SETOR", label: "Gestor de setor" },
] as const;

const roleLabel = (role: string) => ROLES.find((r) => r.value === role)?.label ?? role;

type Empresa = { id: string; nome: string };
type Setor = { id: string; nome: string; empresaId: string };
type Usuario = {
  id: string;
  nome: string;
  username: string;
  role: string;
  empresaId: string | null;
  empresa: Empresa | null;
  setorId: string | null;
  setor: Setor | null;
};

const initialState: ActionResult = { ok: true };

export function UsuariosTable({
  usuarios,
  empresas,
  setores,
}: {
  usuarios: Usuario[];
  empresas: Empresa[];
  setores: Setor[];
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editUsuario, setEditUsuario] = useState<Usuario | null>(null);
  const [senhaUsuario, setSenhaUsuario] = useState<Usuario | null>(null);
  const [busca, setBusca] = useState("");

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return usuarios;
    return usuarios.filter(
      (u) =>
        u.nome.toLowerCase().includes(termo) ||
        u.username.toLowerCase().includes(termo) ||
        roleLabel(u.role).toLowerCase().includes(termo)
    );
  }, [usuarios, busca]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Input
          placeholder="Buscar por nome, login ou papel..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-sm"
        />
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="size-4" />
            Novo Usuário
          </DialogTrigger>
          <DialogContent>
            <UsuarioForm
              action={createUsuario}
              title="Novo Usuário"
              empresas={empresas}
              setores={setores}
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
              <TableHead>Empresa</TableHead>
              <TableHead>Setor</TableHead>
              <TableHead className="w-32 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrados.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Nenhum usuário encontrado.
                </TableCell>
              </TableRow>
            )}
            {filtrados.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.nome}</TableCell>
                <TableCell>{u.username}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{roleLabel(u.role)}</Badge>
                </TableCell>
                <TableCell>{u.empresa?.nome ?? "—"}</TableCell>
                <TableCell>{u.setor?.nome ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setSenhaUsuario(u)} title="Redefinir senha">
                      <KeyRound className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setEditUsuario(u)}>
                      <Pencil className="size-4" />
                    </Button>
                    <DeleteUsuarioButton usuario={u} />
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
              empresas={empresas}
              setores={setores}
              defaultValues={editUsuario}
              onSuccess={() => setEditUsuario(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!senhaUsuario} onOpenChange={(open) => !open && setSenhaUsuario(null)}>
        <DialogContent>
          {senhaUsuario && (
            <RedefinirSenhaForm usuario={senhaUsuario} onSuccess={() => setSenhaUsuario(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UsuarioForm({
  action,
  title,
  empresas,
  setores,
  defaultValues,
  onSuccess,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  title: string;
  empresas: Empresa[];
  setores: Setor[];
  defaultValues?: Usuario;
  onSuccess: () => void;
}) {
  const [role, setRole] = useState(defaultValues?.role ?? "DIRETORIA");
  const [empresaId, setEmpresaId] = useState(defaultValues?.empresaId ?? "");
  const [setorId, setSetorId] = useState(defaultValues?.setorId ?? "");

  const precisaEmpresa = role === "RH_MANAGER" || role === "GESTOR_SETOR";
  const precisaSetor = role === "GESTOR_SETOR";
  const setoresDaEmpresa = setores.filter((s) => s.empresaId === empresaId);

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
        <Input id="username" name="username" defaultValue={defaultValues?.username ?? ""} required />
      </div>
      {!defaultValues && (
        <div className="space-y-2">
          <Label htmlFor="senha">Senha inicial</Label>
          <Input id="senha" name="senha" type="password" minLength={8} required />
        </div>
      )}
      <div className="space-y-2">
        <Label>Papel</Label>
        <Select
          value={role}
          onValueChange={(v) => {
            setRole(v ?? "DIRETORIA");
            setEmpresaId("");
            setSetorId("");
          }}
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
      {precisaEmpresa && (
        <div className="space-y-2">
          <Label>Empresa</Label>
          <Select
            value={empresaId}
            onValueChange={(v) => {
              setEmpresaId(v ?? "");
              setSetorId("");
            }}
            name="empresaId"
            items={Object.fromEntries(empresas.map((e) => [e.id, e.nome]))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione a empresa" />
            </SelectTrigger>
            <SelectContent>
              {empresas.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {precisaSetor && (
        <div className="space-y-2">
          <Label>Setor</Label>
          <Select
            value={setorId}
            onValueChange={(v) => setSetorId(v ?? "")}
            name="setorId"
            items={Object.fromEntries(setoresDaEmpresa.map((s) => [s.id, s.nome]))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={empresaId ? "Selecione o setor" : "Selecione a empresa primeiro"} />
            </SelectTrigger>
            <SelectContent>
              {setoresDaEmpresa.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
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

function RedefinirSenhaForm({ usuario, onSuccess }: { usuario: Usuario; onSuccess: () => void }) {
  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await resetSenhaUsuario(usuario.id, prev, fd);
    if (result.ok) {
      toast.success("Senha redefinida com sucesso.");
      onSuccess();
    }
    return result;
  }, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Redefinir senha de {usuario.nome}</DialogTitle>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="senha">Nova senha</Label>
        <Input id="senha" name="senha" type="password" minLength={8} required autoFocus />
      </div>
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando..." : "Redefinir"}
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
