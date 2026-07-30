"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Mail, KeyRound, Link2, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  vincularEmpresaUsuario,
  desativarVinculoUsuario,
  reativarVinculoUsuario,
  criarConviteUsuario,
} from "@/lib/actions/usuarios";
import { ROLES, ROLE_LABEL, type ActionResult } from "@/lib/constants";

type EmpresaResumo = { id: string; nome: string; ativo: boolean };
type SetorResumo = { id: string; nome: string; empresaId: string; ativo: boolean };

type Vinculo = {
  empresaId: string;
  empresaNome: string;
  empresaAtiva: boolean;
  role: string;
  setorId: string | null;
  setorNome: string | null;
  ativo: boolean;
  papelPrincipal: boolean;
};

type Usuario = {
  id: string;
  nome: string;
  username: string;
  email: string | null;
  telefone: string | null;
  role: string;
  ativo: boolean;
  empresas: Vinculo[];
};

const initialState: ActionResult = { ok: true };

const PAPEL_LABEL: Record<string, string> = {
  RH_MANAGER: "RH",
  GESTOR_SETOR: "Setor",
};

export function UsuariosTable({
  usuarios,
  empresas,
  setores,
  currentUserId,
}: {
  usuarios: Usuario[];
  empresas: EmpresaResumo[];
  setores: SetorResumo[];
  currentUserId: string;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editUsuario, setEditUsuario] = useState<Usuario | null>(null);
  const [conviteUsuario, setConviteUsuario] = useState<Usuario | null>(null);
  const [resetUsuario, setResetUsuario] = useState<Usuario | null>(null);
  const [vincularUsuario, setVincularUsuario] = useState<Usuario | null>(null);

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
              <TableHead>E-mail</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Empresas</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-44 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuarios.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
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
                <TableCell className="text-muted-foreground">{u.email ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={u.role === "ADMIN" ? "default" : "secondary"}>
                    {ROLE_LABEL[u.role] ?? u.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {u.empresas.length === 0 && (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                    {u.empresas.map((v) => (
                      <Badge
                        key={v.empresaId}
                        variant={v.ativo ? "outline" : "outline"}
                        className={!v.ativo ? "opacity-50 line-through" : undefined}
                        title={
                          v.setorNome
                            ? `${v.empresaNome} · ${PAPEL_LABEL[v.role] ?? v.role} · ${v.setorNome}${v.papelPrincipal ? " (principal)" : ""}`
                            : `${v.empresaNome} · ${PAPEL_LABEL[v.role] ?? v.role}${v.papelPrincipal ? " (principal)" : ""}`
                        }
                      >
                        {v.empresaNome}
                        {v.papelPrincipal ? " ★" : ""}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={u.ativo ? "outline" : "destructive"}>
                    {u.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Editar"
                      onClick={() => setEditUsuario(u)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Vincular empresa"
                      onClick={() => setVincularUsuario(u)}
                    >
                      <Link2 className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Convidar por e-mail"
                      onClick={() => setConviteUsuario(u)}
                    >
                      <Mail className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Redefinir senha"
                      onClick={() => setResetUsuario(u)}
                    >
                      <KeyRound className="size-4" />
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
              empresas={empresas}
              setores={setores}
              defaultValues={editUsuario}
              onSuccess={() => setEditUsuario(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetUsuario} onOpenChange={(open) => !open && setResetUsuario(null)}>
        <DialogContent>
          {resetUsuario && (
            <ResetSenhaForm
              usuario={resetUsuario}
              onSuccess={() => setResetUsuario(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!vincularUsuario} onOpenChange={(open) => !open && setVincularUsuario(null)}>
        <DialogContent className="max-w-2xl">
          {vincularUsuario && (
            <VincularForm
              usuario={vincularUsuario}
              empresas={empresas}
              setores={setores}
              onSuccess={() => setVincularUsuario(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!conviteUsuario} onOpenChange={(open) => !open && setConviteUsuario(null)}>
        <DialogContent className="max-w-2xl">
          {conviteUsuario && (
            <ConviteForm
              usuario={conviteUsuario}
              empresas={empresas}
              setores={setores}
              onSuccess={() => setConviteUsuario(null)}
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
  empresas,
  setores,
  onSuccess,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  title: string;
  defaultValues?: Usuario;
  empresas: EmpresaResumo[];
  setores: SetorResumo[];
  onSuccess: () => void;
}) {
  const isEdit = !!defaultValues;
  const [role, setRole] = useState<string>(defaultValues?.role ?? "DIRETORIA");
  const [empresaId, setEmpresaId] = useState<string>(
    defaultValues?.empresas.find((v) => v.papelPrincipal)?.empresaId ?? "",
  );
  const [setorId, setSetorId] = useState<string>("");

  const precisaEmpresa = role === "RH_MANAGER" || role === "GESTOR_SETOR";
  const precisaSetor = role === "GESTOR_SETOR";

  const setoresFiltrados = setores.filter((s) => s.empresaId === empresaId);

  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await action(prev, fd);
    if (result.ok) {
      toast.success(isEdit ? "Usuário atualizado." : "Usuário criado.");
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
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={defaultValues?.email ?? ""}
            autoComplete="off"
            placeholder="opcional, mas habilita convite"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="telefone">Telefone</Label>
          <Input
            id="telefone"
            name="telefone"
            defaultValue={defaultValues?.telefone ?? ""}
            autoComplete="off"
          />
        </div>
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
          minLength={isEdit ? 0 : 8}
        />
      </div>
      <div className="space-y-2">
        <Label>Papel de acesso</Label>
        <Select
          value={role}
          onValueChange={(v) => {
            setRole(v ?? "DIRETORIA");
            if (v !== "GESTOR_SETOR") setSetorId("");
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
            items={Object.fromEntries(
              empresas.filter((e) => e.ativo).map((e) => [e.id, e.nome]),
            )}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione a empresa" />
            </SelectTrigger>
            <SelectContent>
              {empresas
                .filter((e) => e.ativo)
                .map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {precisaSetor && empresaId && (
        <div className="space-y-2">
          <Label>Setor</Label>
          <Select
            value={setorId}
            onValueChange={(v) => setSetorId(v ?? "")}
            name="setorId"
            items={Object.fromEntries(
              setoresFiltrados.filter((s) => s.ativo).map((s) => [s.id, s.nome]),
            )}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione o setor" />
            </SelectTrigger>
            <SelectContent>
              {setoresFiltrados
                .filter((s) => s.ativo)
                .map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nome}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {isEdit && (
        <div className="flex items-center gap-2">
          <Checkbox id="ativo" name="ativo" defaultChecked={defaultValues?.ativo ?? true} />
          <Label htmlFor="ativo">Usuário ativo (desmarque para bloquear o login)</Label>
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

function ResetSenhaForm({
  usuario,
  onSuccess,
}: {
  usuario: Usuario;
  onSuccess: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    async (prev: ActionResult, fd: FormData) => {
      const result = await resetSenhaUsuario(usuario.id, prev, fd);
      if (result.ok) {
        toast.success("Senha redefinida.");
        onSuccess();
      }
      return result;
    },
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Redefinir senha de {usuario.nome}</DialogTitle>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="senha">Nova senha</Label>
        <Input id="senha" name="senha" type="password" autoComplete="new-password" required minLength={8} autoFocus />
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

function VincularForm({
  usuario,
  empresas,
  setores,
  onSuccess,
}: {
  usuario: Usuario;
  empresas: EmpresaResumo[];
  setores: SetorResumo[];
  onSuccess: () => void;
}) {
  const empresasDisponiveis = empresas.filter(
    (e) => e.ativo && !usuario.empresas.some((v) => v.empresaId === e.id && v.ativo),
  );
  const [empresaId, setEmpresaId] = useState<string>(empresasDisponiveis[0]?.id ?? "");
  const [role, setRole] = useState<"RH_MANAGER" | "GESTOR_SETOR">("RH_MANAGER");
  const [setorId, setSetorId] = useState<string>("");
  const [papelPrincipal, setPapelPrincipal] = useState<boolean>(false);

  const setoresFiltrados = setores.filter((s) => s.empresaId === empresaId && s.ativo);

  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await vincularEmpresaUsuario(prev, fd);
    if (result.ok) {
      toast.success("Vínculo salvo.");
      onSuccess();
    }
    return result;
  }, initialState);

  // Vínculos desativados (reativar inline)
  const desativados = usuario.empresas.filter((v) => !v.ativo);

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4">
        <DialogHeader>
          <DialogTitle>Vincular {usuario.nome} a uma empresa</DialogTitle>
        </DialogHeader>
        <input type="hidden" name="userId" value={usuario.id} />
        {empresasDisponiveis.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Este usuário já está vinculado a todas as empresas ativas do grupo.
            {desativados.length > 0 && " Use a lista abaixo para reativar um vínculo desativado."}
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <Label>Empresa</Label>
              <Select
                value={empresaId}
                onValueChange={(v) => {
                  setEmpresaId(v ?? "");
                  setSetorId("");
                }}
                name="empresaId"
                items={Object.fromEntries(empresasDisponiveis.map((e) => [e.id, e.nome]))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {empresasDisponiveis.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Papel</Label>
              <Select
                value={role}
                onValueChange={(v) => {
                  setRole((v ?? "RH_MANAGER") as "RH_MANAGER" | "GESTOR_SETOR");
                  if (v !== "GESTOR_SETOR") setSetorId("");
                }}
                name="role"
                items={{
                  RH_MANAGER: "Gestor(a) de RH",
                  GESTOR_SETOR: "Gestor(a) de Setor",
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RH_MANAGER">Gestor(a) de RH</SelectItem>
                  <SelectItem value="GESTOR_SETOR">Gestor(a) de Setor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {role === "GESTOR_SETOR" && (
              <div className="space-y-2">
                <Label>Setor</Label>
                <Select
                  value={setorId}
                  onValueChange={(v) => setSetorId(v ?? "")}
                  name="setorId"
                  items={Object.fromEntries(setoresFiltrados.map((s) => [s.id, s.nome]))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o setor" />
                  </SelectTrigger>
                  <SelectContent>
                    {setoresFiltrados.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Checkbox
                id="papelPrincipal"
                name="papelPrincipal"
                checked={papelPrincipal}
                onCheckedChange={(v) => setPapelPrincipal(!!v)}
              />
              <Label htmlFor="papelPrincipal">
                Marcar como empresa principal (será a aberta por padrão após login)
              </Label>
            </div>
          </>
        )}
        {!state.ok && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        {empresasDisponiveis.length > 0 && (
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : "Vincular"}
            </Button>
          </DialogFooter>
        )}
      </form>

      {/* Lista de vínculos existentes — permite desativar/reativar. */}
      <div className="space-y-2 border-t pt-4">
        <h3 className="text-sm font-medium">Vínculos atuais</h3>
        {usuario.empresas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum vínculo ainda.</p>
        ) : (
          <ul className="divide-y">
            {usuario.empresas.map((v) => (
              <li
                key={v.empresaId}
                className="flex items-center justify-between gap-2 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">
                    {v.empresaNome}{" "}
                    {v.papelPrincipal && <span className="text-xs text-amber-600">(principal)</span>}
                    {!v.ativo && <span className="ml-2 text-xs text-muted-foreground">(desativado)</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {PAPEL_LABEL[v.role] ?? v.role}
                    {v.setorNome && ` · ${v.setorNome}`}
                  </div>
                </div>
                <div className="flex gap-1">
                  {v.ativo ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        const r = await desativarVinculoUsuario(usuario.id, v.empresaId);
                        if (r.ok) toast.success("Vínculo desativado.");
                        else toast.error(r.error);
                      }}
                      title="Desativar vínculo"
                    >
                      <Link2Off className="size-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        const r = await reativarVinculoUsuario(usuario.id, v.empresaId);
                        if (r.ok) toast.success("Vínculo reativado.");
                        else toast.error(r.error);
                      }}
                      title="Reativar vínculo"
                    >
                      <Link2 className="size-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ConviteForm({
  usuario,
  empresas,
  setores,
  onSuccess,
}: {
  usuario: Usuario;
  empresas: EmpresaResumo[];
  setores: SetorResumo[];
  onSuccess: () => void;
}) {
  // Convite usa o e-mail do cadastro; só permite escolher empresa/setor.
  // Pré-seleciona a principal; se o user não tem pivô (ADMIN/DIRETORIA),
  // cai na primeira empresa ativa.
  const inicial =
    usuario.empresas.find((v) => v.papelPrincipal)?.empresaId ??
    usuario.empresas[0]?.empresaId ??
    empresas.find((e) => e.ativo)?.id ??
    "";
  const [empresaId, setEmpresaId] = useState<string>(inicial);
  const [role, setRole] = useState<"RH_MANAGER" | "GESTOR_SETOR">("RH_MANAGER");
  const [setorId, setSetorId] = useState<string>("");

  const setoresFiltrados = setores.filter((s) => s.empresaId === empresaId && s.ativo);

  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await criarConviteUsuario(prev, fd);
    if (result.ok) {
      toast.success("Convite enviado.");
      onSuccess();
    } else if (result.error.startsWith("Convite criado")) {
      // Caso o convite tenha sido gravado mas o SMTP tenha falhado — alerta
      // amarelo para o admin saber que precisa reenviar ou configurar e-mail.
      toast.warning(result.error);
      onSuccess();
    }
    return result;
  }, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Convidar por e-mail</DialogTitle>
      </DialogHeader>
      <p className="text-sm text-muted-foreground">
        Será enviado um link para {usuario.email ?? "definir e-mail primeiro"} definir a
        senha e entrar. O link expira em 7 dias.
      </p>
      {!usuario.email && (
        <Alert variant="destructive">
          <AlertDescription>
            Este usuário não tem e-mail cadastrado. Edite o cadastro para incluir antes de convidar.
          </AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="nome" value={usuario.nome} />
      <input type="hidden" name="email" value={usuario.email ?? ""} />
      <div className="space-y-2">
        <Label>Empresa</Label>
        <Select
          value={empresaId}
          onValueChange={(v) => {
            setEmpresaId(v ?? "");
            setSetorId("");
          }}
          name="empresaId"
          items={Object.fromEntries(empresas.filter((e) => e.ativo).map((e) => [e.id, e.nome]))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            {empresas
              .filter((e) => e.ativo)
              .map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.nome}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Papel</Label>
        <Select
          value={role}
          onValueChange={(v) => {
            setRole((v ?? "RH_MANAGER") as "RH_MANAGER" | "GESTOR_SETOR");
            if (v !== "GESTOR_SETOR") setSetorId("");
          }}
          name="role"
          items={{
            RH_MANAGER: "Gestor(a) de RH",
            GESTOR_SETOR: "Gestor(a) de Setor",
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="RH_MANAGER">Gestor(a) de RH</SelectItem>
            <SelectItem value="GESTOR_SETOR">Gestor(a) de Setor</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {role === "GESTOR_SETOR" && (
        <div className="space-y-2">
          <Label>Setor</Label>
          <Select
            value={setorId}
            onValueChange={(v) => setSetorId(v ?? "")}
            name="setorId"
            items={Object.fromEntries(setoresFiltrados.map((s) => [s.id, s.nome]))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione o setor" />
            </SelectTrigger>
            <SelectContent>
              {setoresFiltrados.map((s) => (
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
        <Button type="submit" disabled={isPending || !usuario.email}>
          {isPending ? "Enviando..." : "Enviar convite"}
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
      toast.success("Usuário excluído (ou desativado, se há registros vinculados).");
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
    <Button variant="ghost" size="icon" onClick={() => setConfirming(true)} title="Excluir">
      <Trash2 className="size-4" />
    </Button>
  );
}