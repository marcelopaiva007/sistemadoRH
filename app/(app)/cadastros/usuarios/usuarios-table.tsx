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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  vincularMarcaUsuario,
  desativarVinculoMarca,
  reativarVinculoMarca,
  criarConviteUsuario,
} from "@/lib/actions/usuarios";
import { ROLES, ROLE_LABEL, type ActionResult } from "@/lib/constants";
import { FichaVinculada } from "./ficha-vinculada";

type EmpresaResumo = { id: string; nome: string; ativo: boolean; marcaId: string };
type SetorResumo = { id: string; nome: string; empresaId: string; ativo: boolean };
type MarcaResumo = { id: string; nome: string };

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

// Vínculo com a marca inteira: não tem setor nem papelPrincipal porque não
// aponta para um CNPJ — o papel é sempre RH e a empresa de entrada continua
// saindo dos vínculos por CNPJ.
type VinculoMarca = {
  marcaId: string;
  marcaNome: string;
  ativo: boolean;
};

// A ficha de colaborador que este login representa, quando existe. `null` é o
// caso comum: ADMIN e RH em geral não têm ficha na empresa que administram.
export type FichaDoUsuario = {
  id: string;
  nome: string;
  empresaNome: string;
  setorNome: string;
};

export type Usuario = {
  id: string;
  nome: string;
  username: string;
  email: string | null;
  telefone: string | null;
  role: string;
  ativo: boolean;
  empresas: Vinculo[];
  marcasVinculadas: VinculoMarca[];
  ficha: FichaDoUsuario | null;
};

const initialState: ActionResult = { ok: true };

const PAPEL_LABEL: Record<string, string> = {
  RH_MANAGER: "RH",
  GESTOR_SETOR: "Setor",
};

// O acesso vem por UM dos dois: a marca inteira (dinâmica, CNPJ novo entra
// sozinho) ou um CNPJ específico. É escolha exclusiva porque o servidor recusa
// os dois juntos — ver as validações em lib/actions/usuarios.ts.
type Escopo = "MARCA" | "CNPJ";

// Agrupa os CNPJs pela marca a que pertencem para o select ficar legível.
// Empresa ativa cuja marca foi desativada não pode sumir da lista, então cai
// num grupo sem rótulo de marca em vez de virar opção invisível.
function agruparPorMarca(empresas: EmpresaResumo[], marcas: MarcaResumo[]) {
  const grupos = marcas
    .map((m) => ({
      id: m.id,
      nome: m.nome,
      empresas: empresas.filter((e) => e.marcaId === m.id),
    }))
    .filter((g) => g.empresas.length > 0);

  const semMarca = empresas.filter((e) => !marcas.some((m) => m.id === e.marcaId));
  if (semMarca.length > 0) {
    grupos.push({ id: "__sem_marca", nome: "Outras", empresas: semMarca });
  }
  return grupos;
}

export function UsuariosTable({
  usuarios,
  empresas,
  setores,
  marcas,
  currentUserId,
}: {
  usuarios: Usuario[];
  empresas: EmpresaResumo[];
  setores: SetorResumo[];
  marcas: MarcaResumo[];
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
              marcas={marcas}
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
              {/* "Acesso" e não "Empresas": a coluna mistura marca e CNPJ. */}
              <TableHead>Acesso</TableHead>
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
                  {/* Mostrado só quando a ficha tem outro nome: repetir o mesmo
                      nome duas vezes na célula não informa nada. O que importa
                      aqui é ver de relance quem NÃO tem ficha ligada. */}
                  {u.ficha && (
                    <p className="text-xs font-normal text-muted-foreground">
                      ficha: {u.ficha.nome === u.nome ? u.ficha.setorNome : u.ficha.nome}
                    </p>
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
                    {u.empresas.length === 0 && u.marcasVinculadas.length === 0 && (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                    {/* Marca primeiro, com variante própria: esse vínculo cobre
                        CNPJs que nem aparecem nos badges ao lado. */}
                    {u.marcasVinculadas.map((v) => (
                      <Badge
                        key={`marca-${v.marcaId}`}
                        variant="secondary"
                        className={!v.ativo ? "opacity-50 line-through" : undefined}
                        title={`${v.marcaNome} · marca — todos os CNPJs, inclusive os cadastrados depois`}
                      >
                        {v.marcaNome} · marca
                      </Badge>
                    ))}
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
              marcas={marcas}
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
              marcas={marcas}
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
  marcas,
  onSuccess,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  title: string;
  defaultValues?: Usuario;
  empresas: EmpresaResumo[];
  setores: SetorResumo[];
  marcas: MarcaResumo[];
  onSuccess: () => void;
}) {
  const isEdit = !!defaultValues;
  const [role, setRole] = useState<string>(defaultValues?.role ?? "DIRETORIA");
  const [escopo, setEscopo] = useState<Escopo>(
    defaultValues?.marcasVinculadas.some((m) => m.ativo) ? "MARCA" : "CNPJ",
  );
  const [marcaId, setMarcaId] = useState<string>(
    defaultValues?.marcasVinculadas.find((m) => m.ativo)?.marcaId ?? "",
  );
  const [empresaId, setEmpresaId] = useState<string>(
    defaultValues?.empresas.find((v) => v.papelPrincipal)?.empresaId ?? "",
  );
  const [setorId, setSetorId] = useState<string>("");

  // Só na criação. `updateUsuario` não lê marca/empresa/setor — quem altera
  // acesso de quem já existe é o diálogo "Vincular". Mostrar os campos aqui na
  // edição seria oferecer um controle que não faz nada.
  const precisaEmpresa = !isEdit && (role === "RH_MANAGER" || role === "GESTOR_SETOR");
  const precisaSetor = role === "GESTOR_SETOR";

  // Gestor de setor não tem escopo de marca — setor pertence a um CNPJ. Forçar
  // aqui evita mandar o formulário para o servidor só para ele recusar.
  const escopoEfetivo: Escopo = precisaSetor ? "CNPJ" : escopo;

  const empresasAtivas = empresas.filter((e) => e.ativo);
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
          <Label>Escopo do acesso</Label>
          <RadioGroup
            value={escopoEfetivo}
            onValueChange={(v) => setEscopo((v ?? "CNPJ") as Escopo)}
            className="gap-2"
          >
            <div className="flex items-start gap-2">
              <RadioGroupItem
                value="MARCA"
                id="escopo-marca"
                disabled={precisaSetor}
                className="mt-0.5"
              />
              <div>
                <Label htmlFor="escopo-marca" className="font-normal">
                  Marca inteira
                </Label>
                <p className="text-xs text-muted-foreground">
                  Dá acesso a todos os CNPJs da marca, inclusive os cadastrados depois.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <RadioGroupItem value="CNPJ" id="escopo-cnpj" className="mt-0.5" />
              <div>
                <Label htmlFor="escopo-cnpj" className="font-normal">
                  CNPJ específico
                </Label>
                <p className="text-xs text-muted-foreground">
                  Acesso só à empresa escolhida.
                </p>
              </div>
            </div>
          </RadioGroup>
          {precisaSetor && (
            <p className="text-xs text-muted-foreground">
              Gestor(a) de Setor é sempre por CNPJ: o setor pertence a um CNPJ, não à marca.
            </p>
          )}
        </div>
      )}
      {/* Marca e empresa são montadas uma OU outra — esconder por CSS deixaria
          o campo escondido no FormData e cairia no "escolha marca ou CNPJ". */}
      {precisaEmpresa && escopoEfetivo === "MARCA" && (
        <div className="space-y-2">
          <Label>Marca</Label>
          <Select
            value={marcaId}
            onValueChange={(v) => setMarcaId(v ?? "")}
            name="marcaId"
            items={Object.fromEntries(marcas.map((m) => [m.id, m.nome]))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione a marca" />
            </SelectTrigger>
            <SelectContent>
              {marcas.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {precisaEmpresa && escopoEfetivo === "CNPJ" && (
        <div className="space-y-2">
          <Label>Empresa</Label>
          <Select
            value={empresaId}
            onValueChange={(v) => {
              setEmpresaId(v ?? "");
              setSetorId("");
            }}
            name="empresaId"
            items={Object.fromEntries(empresasAtivas.map((e) => [e.id, e.nome]))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione a empresa" />
            </SelectTrigger>
            <SelectContent>
              {agruparPorMarca(empresasAtivas, marcas).map((g) => (
                <SelectGroup key={g.id}>
                  <SelectLabel>{g.nome}</SelectLabel>
                  {g.empresas.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {precisaSetor && escopoEfetivo === "CNPJ" && empresaId && (
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
      {isEdit && (role === "RH_MANAGER" || role === "GESTOR_SETOR") && (
        <p className="text-xs text-muted-foreground">
          Marca e CNPJs não se alteram por aqui — use &ldquo;Vincular&rdquo; na linha do usuário.
        </p>
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
  marcas,
  onSuccess,
}: {
  usuario: Usuario;
  empresas: EmpresaResumo[];
  setores: SetorResumo[];
  marcas: MarcaResumo[];
  onSuccess: () => void;
}) {
  // Empresa com vínculo ATIVO não some da lista: selecioná-la vira EDIÇÃO do
  // vínculo (a action já faz upsert de papel/setor). O filtro que as excluía
  // criava um beco sem saída — o estado que a tela Meu Setor manda consertar
  // aqui (vínculo ativo sem setor) era justamente o que este formulário se
  // recusava a mostrar, e desativar-para-revincular é barrado quando o vínculo
  // é o único ativo.
  const vinculoAtivoPorEmpresa = new Map(
    usuario.empresas.filter((v) => v.ativo).map((v) => [v.empresaId, v]),
  );
  const empresasDisponiveis = empresas.filter((e) => e.ativo);
  // Marca já vinculada e ativa sai da lista: revincular a mesma marca não
  // acrescenta acesso nenhum (vínculo de marca não tem papel nem setor a editar).
  const marcasDisponiveis = marcas.filter(
    (m) => !usuario.marcasVinculadas.some((v) => v.marcaId === m.id && v.ativo),
  );

  // Começa na primeira empresa SEM vínculo (o caso comum: dar acesso novo);
  // quando todas já têm, começa na primeira mesmo — aí o form abre em edição.
  const empresaInicial = (
    empresasDisponiveis.find((e) => !vinculoAtivoPorEmpresa.has(e.id)) ?? empresasDisponiveis[0]
  )?.id ?? "";
  const vinculoInicial = vinculoAtivoPorEmpresa.get(empresaInicial);

  const [escopo, setEscopo] = useState<Escopo>("CNPJ");
  const [marcaId, setMarcaId] = useState<string>(marcasDisponiveis[0]?.id ?? "");
  const [empresaId, setEmpresaId] = useState<string>(empresaInicial);
  // Editar começa do que está salvo. Sem este prefill, salvar uma empresa já
  // vinculada com o papel default (RH) apagaria o setor de um gestor sem
  // ninguém perceber.
  const [role, setRole] = useState<"RH_MANAGER" | "GESTOR_SETOR">(
    vinculoInicial?.role === "GESTOR_SETOR" ? "GESTOR_SETOR" : "RH_MANAGER",
  );
  const [setorId, setSetorId] = useState<string>(vinculoInicial?.setorId ?? "");
  const [papelPrincipal, setPapelPrincipal] = useState<boolean>(
    vinculoInicial?.papelPrincipal ?? false,
  );

  const vinculoSelecionado = vinculoAtivoPorEmpresa.get(empresaId);

  const setoresFiltrados = setores.filter((s) => s.empresaId === empresaId && s.ativo);

  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await vincularEmpresaUsuario(prev, fd);
    if (result.ok) {
      toast.success("Vínculo salvo.");
      onSuccess();
    }
    return result;
  }, initialState);

  // Form próprio para a marca em vez de trocar a action: cada `useActionState`
  // amarra um form a uma action, e o payload da marca é outro (sem setor, sem
  // empresa principal).
  const [stateMarca, formActionMarca, isPendingMarca] = useActionState(
    async (prev: ActionResult, fd: FormData) => {
      const result = await vincularMarcaUsuario(prev, fd);
      if (result.ok) {
        toast.success("Vínculo salvo.");
        onSuccess();
      }
      return result;
    },
    initialState,
  );

  // Vínculos desativados (reativar inline)
  const desativados = usuario.empresas.filter((v) => !v.ativo);

  return (
    <div className="space-y-6">
      <DialogHeader>
        <DialogTitle>Vincular {usuario.nome}</DialogTitle>
      </DialogHeader>

      {/* Primeiro QUEM a pessoa é, depois ONDE ela mexe. Nesta ordem porque o
          vínculo com a ficha é o que decide se ela enxerga o próprio time —
          o acesso por empresa/marca já existia e não responde essa pergunta. */}
      <FichaVinculada usuario={usuario} onSuccess={onSuccess} />

      <div className="border-t" />

      {/* O seletor fica fora dos dois forms — ele escolhe qual form aparece,
          não é campo enviado. */}
      <div className="space-y-2">
        <Label>Escopo do acesso</Label>
        <RadioGroup
          value={escopo}
          onValueChange={(v) => setEscopo((v ?? "CNPJ") as Escopo)}
          className="gap-2"
        >
          <div className="flex items-start gap-2">
            <RadioGroupItem value="MARCA" id="vincular-escopo-marca" className="mt-0.5" />
            <div>
              <Label htmlFor="vincular-escopo-marca" className="font-normal">
                Marca inteira
              </Label>
              <p className="text-xs text-muted-foreground">
                Dá acesso a todos os CNPJs da marca, inclusive os cadastrados depois.
                Sempre como Gestor(a) de RH.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <RadioGroupItem value="CNPJ" id="vincular-escopo-cnpj" className="mt-0.5" />
            <div>
              <Label htmlFor="vincular-escopo-cnpj" className="font-normal">
                CNPJ específico
              </Label>
              <p className="text-xs text-muted-foreground">
                Acesso só à empresa escolhida — é o único escopo que comporta gestor de setor.
              </p>
            </div>
          </div>
        </RadioGroup>
      </div>

      {escopo === "MARCA" ? (
        <form action={formActionMarca} className="space-y-4">
          <input type="hidden" name="userId" value={usuario.id} />
          {/* Vínculo por marca é sempre RH — setor pertence a um CNPJ. */}
          <input type="hidden" name="role" value="RH_MANAGER" />
          {marcasDisponiveis.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Este usuário já tem acesso a todas as marcas ativas do grupo.
              {usuario.marcasVinculadas.some((v) => !v.ativo) &&
                " Use a lista abaixo para reativar um vínculo desativado."}
            </p>
          ) : (
            <div className="space-y-2">
              <Label>Marca</Label>
              <Select
                value={marcaId}
                onValueChange={(v) => setMarcaId(v ?? "")}
                name="marcaId"
                items={Object.fromEntries(marcasDisponiveis.map((m) => [m.id, m.nome]))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {marcasDisponiveis.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {!stateMarca.ok && (
            <Alert variant="destructive">
              <AlertDescription>{stateMarca.error}</AlertDescription>
            </Alert>
          )}
          {marcasDisponiveis.length > 0 && (
            <DialogFooter>
              <Button type="submit" disabled={isPendingMarca}>
                {isPendingMarca ? "Salvando..." : "Vincular"}
              </Button>
            </DialogFooter>
          )}
        </form>
      ) : (
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="userId" value={usuario.id} />
          {empresasDisponiveis.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma empresa ativa no grupo para vincular.
              {desativados.length > 0 && " Use a lista abaixo para reativar um vínculo desativado."}
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Empresa</Label>
                <Select
                  value={empresaId}
                  onValueChange={(v) => {
                    const id = v ?? "";
                    setEmpresaId(id);
                    // Trocar de empresa recarrega papel/setor do vínculo dela
                    // (edição) ou zera (vínculo novo) — nunca carrega o setor
                    // de uma empresa para dentro de outra.
                    const atual = vinculoAtivoPorEmpresa.get(id);
                    setRole(atual?.role === "GESTOR_SETOR" ? "GESTOR_SETOR" : "RH_MANAGER");
                    setSetorId(atual?.setorId ?? "");
                    setPapelPrincipal(atual?.papelPrincipal ?? false);
                  }}
                  name="empresaId"
                  items={Object.fromEntries(
                    empresasDisponiveis.map((e) => [
                      e.id,
                      vinculoAtivoPorEmpresa.has(e.id) ? `${e.nome} · já vinculado` : e.nome,
                    ]),
                  )}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {agruparPorMarca(empresasDisponiveis, marcas).map((g) => (
                      <SelectGroup key={g.id}>
                        <SelectLabel>{g.nome}</SelectLabel>
                        {g.empresas.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {vinculoAtivoPorEmpresa.has(e.id) ? `${e.nome} · já vinculado` : e.nome}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                {vinculoSelecionado && (
                  <p className="text-xs text-muted-foreground">
                    Já vinculado como{" "}
                    {vinculoSelecionado.role === "GESTOR_SETOR"
                      ? `Gestor(a) de Setor${
                          vinculoSelecionado.setorNome
                            ? ` — ${vinculoSelecionado.setorNome}`
                            : " (sem setor)"
                        }`
                      : "Gestor(a) de RH"}
                    . Salvar atualiza este vínculo.
                  </p>
                )}
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
                {isPending ? "Salvando..." : vinculoSelecionado ? "Atualizar vínculo" : "Vincular"}
              </Button>
            </DialogFooter>
          )}
        </form>
      )}

      {/* Lista de vínculos existentes — permite desativar/reativar. */}
      <div className="space-y-2 border-t pt-4">
        <h3 className="text-sm font-medium">Vínculos atuais</h3>
        {usuario.empresas.length === 0 && usuario.marcasVinculadas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum vínculo ainda.</p>
        ) : (
          <ul className="divide-y">
            {/* Marca vem primeiro e rotulada: sem isso, quem lê a lista acha
                que o acesso é só o dos CNPJs listados logo abaixo. */}
            {usuario.marcasVinculadas.map((v) => (
              <li
                key={`marca-${v.marcaId}`}
                className="flex items-center justify-between gap-2 py-2 text-sm"
              >
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    <Badge variant="secondary">marca</Badge>
                    {v.marcaNome}
                    {!v.ativo && (
                      <span className="text-xs font-normal text-muted-foreground">(desativado)</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Todos os CNPJs da marca · {PAPEL_LABEL.RH_MANAGER}
                  </div>
                </div>
                <div className="flex gap-1">
                  {v.ativo ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        const r = await desativarVinculoMarca(usuario.id, v.marcaId);
                        if (r.ok) toast.success("Vínculo desativado.");
                        else toast.error(r.error);
                      }}
                      title="Desativar vínculo com a marca"
                    >
                      <Link2Off className="size-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        const r = await reativarVinculoMarca(usuario.id, v.marcaId);
                        if (r.ok) toast.success("Vínculo reativado.");
                        else toast.error(r.error);
                      }}
                      title="Reativar vínculo com a marca"
                    >
                      <Link2 className="size-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
            {usuario.empresas.map((v) => (
              <li
                key={v.empresaId}
                className="flex items-center justify-between gap-2 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">
                    {v.empresaNome}{" "}
                    {v.papelPrincipal && <span className="text-xs text-amber-600 dark:text-amber-400">(principal)</span>}
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