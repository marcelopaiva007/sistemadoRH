"use client";

import { useActionState, useState, useMemo } from "react";
import { useFiltroEmpresas } from "../filtro-empresas";
import { toast } from "sonner";
import { ChevronRight, Plus, Pencil, Trash2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/constants";

type Empresa = { id: string; nome: string };
type TipoBeneficio = { id: string; nome: string; ativo: boolean; empresaId: string; empresa: Empresa };

const initialState: ActionResult = { ok: true };

export function TiposBeneficioTable({
  empresaId,
  empresasDoUsuario,
  tipos,
  empresas = [],
}: {
  empresaId: string;
  empresasDoUsuario: string[];
  tipos: TipoBeneficio[];
  empresas?: Empresa[];
}) {
  const empresasSelecionadas = useFiltroEmpresas(empresasDoUsuario);
  const tiposFiltrados = useMemo(
    () => tipos.filter(t => empresasSelecionadas.includes(t.empresaId)),
    [tipos, empresasSelecionadas],
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [editTipo, setEditTipo] = useState<TipoBeneficio | null>(null);

  // Uma linha por NOME, CNPJs dentro — mesmo desenho de Setores/Cargos
  // (v1.126.0/v1.129.0): a tela lista o grupo e o mesmo tipo em N empresas
  // lia-se como repetição, sem nem dizer de qual CNPJ era cada linha.
  const [gruposAbertos, setGruposAbertos] = useState<Set<string>>(new Set());
  const grupos = useMemo(() => {
    const porChave = new Map<string, { chave: string; nome: string; linhas: TipoBeneficio[] }>();
    for (const t of tiposFiltrados) {
      const chave = t.nome.trim().toLowerCase().replace(/\s+/g, " ");
      let g = porChave.get(chave);
      if (!g) {
        g = { chave, nome: t.nome, linhas: [] };
        porChave.set(chave, g);
      }
      g.linhas.push(t);
    }
    return [...porChave.values()]
      .map((g) => ({ ...g, ativos: g.linhas.filter((l) => l.ativo).length }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [tiposFiltrados]);

  function alternarGrupo(chave: string) {
    setGruposAbertos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });
  }

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
              empresas={empresas}
              defaultEmpresaId={empresaId}
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
            {grupos.flatMap((g) => {
              const aberto = gruposAbertos.has(g.chave);
              const linhaDoGrupo = (
                <TableRow
                  key={g.chave}
                  className={cn("cursor-pointer", g.ativos === 0 && "opacity-60")}
                  onClick={() => alternarGrupo(g.chave)}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <ChevronRight
                        className={cn(
                          "size-4 shrink-0 text-muted-foreground transition-transform",
                          aberto && "rotate-90",
                        )}
                      />
                      <div>
                        <p className="font-semibold text-foreground">{g.nome}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {g.linhas.length === 1 ? g.linhas[0].empresa.nome : `em ${g.linhas.length} CNPJs`}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={g.ativos > 0 ? "default" : "secondary"}>
                      {g.ativos === g.linhas.length
                        ? "Ativo"
                        : g.ativos === 0
                        ? "Inativo"
                        : `${g.ativos}/${g.linhas.length} ativos`}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-xs text-muted-foreground">
                      {aberto ? "Recolher" : "Abrir CNPJs"}
                    </span>
                  </TableCell>
                </TableRow>
              );

              if (!aberto) return [linhaDoGrupo];

              const subLinhas = g.linhas.map((t) => (
                <TableRow key={t.id} className={cn("bg-muted/30", !t.ativo && "opacity-60")}>
                  <TableCell>
                    <p className="pl-8 text-sm text-foreground">{t.empresa.nome}</p>
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={async () => {
                        const result = await toggleTipoBeneficioAtivo(empresaId, t.id, !t.ativo);
                        if (result.ok) toast.success(t.ativo ? "Tipo desativado." : "Tipo ativado.");
                        else toast.error(result.error || "Erro ao alterar o status.");
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
              ));

              return [linhaDoGrupo, ...subLinhas];
            })}
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
  empresas = [],
  defaultEmpresaId = "",
  onSuccess,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  title: string;
  defaultNome?: string;
  /** Com mais de uma empresa visível, o formulário oferece o seletor de CNPJ (só na criação). */
  empresas?: Empresa[];
  defaultEmpresaId?: string;
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
      {empresas.length > 1 && (
        <div className="space-y-2">
          <Label htmlFor="empresaId">Empresa</Label>
          <select
            id="empresaId"
            name="empresaId"
            defaultValue={defaultEmpresaId}
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
          >
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>{e.nome}</option>
            ))}
          </select>
        </div>
      )}
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
