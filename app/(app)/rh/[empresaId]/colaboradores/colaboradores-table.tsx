"use client";

import { useActionState, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
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
  createColaborador,
  updateColaborador,
  deleteColaborador,
  toggleColaboradorAtivo,
} from "@/lib/actions/rh-colaboradores";
import type { ActionResult } from "@/lib/constants";

type Setor = { id: string; nome: string };
type Posicao = { id: string; nome: string };
type Colaborador = {
  id: string;
  nome: string;
  cpf: string | null;
  email: string | null;
  telegramChatId: string | null;
  ativo: boolean;
  setorId: string;
  setor: Setor;
  posicaoId: string;
  posicao: Posicao;
};

const initialState: ActionResult = { ok: true };

export function ColaboradoresTable({
  empresaId,
  colaboradores,
  setores,
  posicoes,
}: {
  empresaId: string;
  colaboradores: Colaborador[];
  setores: Setor[];
  posicoes: Posicao[];
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editColaborador, setEditColaborador] = useState<Colaborador | null>(null);
  const [busca, setBusca] = useState("");

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return colaboradores;
    return colaboradores.filter(
      (c) =>
        c.nome.toLowerCase().includes(termo) ||
        c.setor.nome.toLowerCase().includes(termo) ||
        c.posicao.nome.toLowerCase().includes(termo)
    );
  }, [colaboradores, busca]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Input
          placeholder="Buscar por nome, setor ou posição..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-sm"
        />
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="size-4" />
            Novo Colaborador
          </DialogTrigger>
          <DialogContent>
            <ColaboradorForm
              action={createColaborador.bind(null, empresaId)}
              title="Novo Colaborador"
              setores={setores}
              posicoes={posicoes}
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
              <TableHead>Setor</TableHead>
              <TableHead>Posição</TableHead>
              <TableHead>Telegram</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrados.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Nenhum colaborador encontrado.
                </TableCell>
              </TableRow>
            )}
            {filtrados.map((c) => (
              <TableRow key={c.id} className={c.ativo ? "" : "opacity-60"}>
                <TableCell className="font-medium">{c.nome}</TableCell>
                <TableCell>{c.setor.nome}</TableCell>
                <TableCell>{c.posicao.nome}</TableCell>
                <TableCell>
                  {c.telegramChatId ? (
                    <Badge variant="secondary">Vinculado</Badge>
                  ) : (
                    <span className="text-muted-foreground">Não vinculado</span>
                  )}
                </TableCell>
                <TableCell>
                  <button
                    onClick={async () => {
                      const result = await toggleColaboradorAtivo(empresaId, c.id, !c.ativo);
                      if (result.ok) toast.success(c.ativo ? "Colaborador desativado." : "Colaborador ativado.");
                    }}
                  >
                    <Badge variant={c.ativo ? "default" : "secondary"}>{c.ativo ? "Ativo" : "Inativo"}</Badge>
                  </button>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditColaborador(c)}>
                      <Pencil className="size-4" />
                    </Button>
                    <DeleteColaboradorButton empresaId={empresaId} colaborador={c} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editColaborador} onOpenChange={(open) => !open && setEditColaborador(null)}>
        <DialogContent>
          {editColaborador && (
            <ColaboradorForm
              action={updateColaborador.bind(null, empresaId, editColaborador.id)}
              title="Editar Colaborador"
              setores={setores}
              posicoes={posicoes}
              defaultValues={editColaborador}
              onSuccess={() => setEditColaborador(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ColaboradorForm({
  action,
  title,
  setores,
  posicoes,
  defaultValues,
  onSuccess,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  title: string;
  setores: Setor[];
  posicoes: Posicao[];
  defaultValues?: Colaborador;
  onSuccess: () => void;
}) {
  const [setorId, setSetorId] = useState(defaultValues?.setorId ?? "");
  const [posicaoId, setPosicaoId] = useState(defaultValues?.posicaoId ?? "");
  const [ativo, setAtivo] = useState(defaultValues?.ativo ?? true);

  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    fd.set("ativo", ativo ? "true" : "false");
    const result = await action(prev, fd);
    if (result.ok) {
      toast.success("Colaborador salvo com sucesso.");
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
        <Label htmlFor="cpf">CPF (opcional)</Label>
        <Input id="cpf" name="cpf" defaultValue={defaultValues?.cpf ?? ""} placeholder="Somente números" maxLength={14} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">E-mail (opcional)</Label>
        <Input id="email" name="email" type="email" defaultValue={defaultValues?.email ?? ""} />
      </div>
      <div className="space-y-2">
        <Label>Setor</Label>
        <Select
          value={setorId}
          onValueChange={(v) => setSetorId(v ?? "")}
          name="setorId"
          items={Object.fromEntries(setores.map((s) => [s.id, s.nome]))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione o setor" />
          </SelectTrigger>
          <SelectContent>
            {setores.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Posição</Label>
        <Select
          value={posicaoId}
          onValueChange={(v) => setPosicaoId(v ?? "")}
          name="posicaoId"
          items={Object.fromEntries(posicoes.map((p) => [p.id, p.nome]))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione a posição" />
          </SelectTrigger>
          <SelectContent>
            {posicoes.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="telegramChatId">Chat ID do Telegram (opcional)</Label>
        <Input
          id="telegramChatId"
          name="telegramChatId"
          defaultValue={defaultValues?.telegramChatId ?? ""}
          placeholder="Ex: 123456789"
        />
        <p className="text-xs text-muted-foreground">
          Necessário para enviar o convite da pesquisa automaticamente pelo Telegram. Peça
          para o colaborador dar /start no bot e informe aqui o chat_id obtido.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="ativo" checked={ativo} onCheckedChange={(v) => setAtivo(v === true)} />
        <Label htmlFor="ativo" className="font-normal">
          Colaborador ativo
        </Label>
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

function DeleteColaboradorButton({ empresaId, colaborador }: { empresaId: string; colaborador: Colaborador }) {
  const [confirming, setConfirming] = useState(false);

  async function handleDelete() {
    const result = await deleteColaborador(empresaId, colaborador.id);
    if (result.ok) {
      toast.success("Colaborador excluído.");
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
