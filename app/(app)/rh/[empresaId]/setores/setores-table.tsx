"use client";

import { useActionState, useState, useMemo } from "react";
import Link from "next/link";
import { useFiltroEmpresas } from "../filtro-empresas";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Users,
  Building2,
  CheckCircle2,
  Layers,
  Search,
  Briefcase,
} from "lucide-react";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createSetor, updateSetor, deleteSetor, toggleSetorAtivo } from "@/lib/actions/rh-setores";
import type { ActionResult } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Empresa = { id: string; nome: string };
type Setor = {
  id: string;
  nome: string;
  ativo: boolean;
  empresaId: string;
  empresa: Empresa;
  _count: { colaboradores: number; vagas?: number; metas?: number };
};

const initialState: ActionResult = { ok: true };

function KpiCard({
  rotulo,
  valor,
  subtitulo,
  icone: Icone,
}: {
  rotulo: string;
  valor: number | string;
  subtitulo?: string;
  icone: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-3.5 py-3 shadow-xs">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/20">
        <Icone className="size-4.5" />
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-xs text-muted-foreground">{rotulo}</p>
        <p className="text-lg font-semibold tabular-nums">{valor}</p>
        {subtitulo && <p className="truncate text-[11px] text-muted-foreground">{subtitulo}</p>}
      </div>
    </div>
  );
}

function SetorAvatar({ nome, id }: { nome: string; id: string }) {
  const partes = nome.trim().split(/\s+/);
  const iniciais = (partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "");
  const codigo = [...id].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const cores = [
    "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
    "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
    "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300",
  ];
  const cor = cores[codigo % cores.length];

  return (
    <Avatar size="sm">
      <AvatarFallback className={cn("text-[10px] font-semibold", cor)}>
        {iniciais.toUpperCase() || "ST"}
      </AvatarFallback>
    </Avatar>
  );
}

export function SetoresTable({
  empresaId,
  empresasDoUsuario,
  setores,
  empresas,
}: {
  empresaId: string;
  empresasDoUsuario: string[];
  setores: Setor[];
  empresas: Empresa[];
}) {
  const empresasSelecionadas = useFiltroEmpresas(empresasDoUsuario);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "ativos" | "inativos">("todos");
  const [createOpen, setCreateOpen] = useState(false);
  const [editSetor, setEditSetor] = useState<Setor | null>(null);

  const setoresFiltrados = useMemo(() => {
    return setores.filter((s) => {
      const matchEmpresa = empresasSelecionadas.includes(s.empresaId);
      const matchBusca = busca === "" || s.nome.toLowerCase().includes(busca.toLowerCase());
      const matchStatus =
        filtroStatus === "todos"
          ? true
          : filtroStatus === "ativos"
          ? s.ativo
          : !s.ativo;
      return matchEmpresa && matchBusca && matchStatus;
    });
  }, [setores, empresasSelecionadas, busca, filtroStatus]);

  // Cálculos de KPIs
  const kpis = useMemo(() => {
    const totalSetores = setoresFiltrados.length;
    const setoresAtivos = setoresFiltrados.filter((s) => s.ativo).length;
    const totalColaboradores = setoresFiltrados.reduce(
      (acc, s) => acc + (s._count?.colaboradores ?? 0),
      0,
    );

    const maiorSetor = [...setoresFiltrados].sort(
      (a, b) => (b._count?.colaboradores ?? 0) - (a._count?.colaboradores ?? 0),
    )[0];

    return {
      totalSetores,
      setoresAtivos,
      totalColaboradores,
      maiorSetorNome: maiorSetor?.nome ?? "Nenhum",
      maiorSetorCount: maiorSetor?._count?.colaboradores ?? 0,
    };
  }, [setoresFiltrados]);

  const exibeMultiEmpresa = empresas.length > 1;

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Setores & Departamentos
          </h1>
          <p className="text-xs text-muted-foreground">
            Estrutura de setores e áreas organizacionais das empresas do grupo.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/rh/${empresaId}/posicoes`}>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Briefcase className="size-3.5" />
              Ver Cargos e Funções
            </Button>
          </Link>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger render={<Button size="sm" className="gap-1.5" />}>
              <Plus className="size-3.5" />
              Novo Setor
            </DialogTrigger>
            <DialogContent>
              <SetorForm
                action={createSetor.bind(null, empresaId)}
                title="Novo Setor"
                empresas={empresas}
                empresaIdDefault={empresaId}
                onSuccess={() => setCreateOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard rotulo="Total de Setores" valor={kpis.totalSetores} icone={Layers} />
        <KpiCard rotulo="Setores Ativos" valor={kpis.setoresAtivos} icone={CheckCircle2} />
        <KpiCard rotulo="Colaboradores Alocados" valor={kpis.totalColaboradores} icone={Users} />
        <KpiCard
          rotulo="Maior Setor"
          valor={kpis.maiorSetorNome}
          subtitulo={`${kpis.maiorSetorCount} colaborador(es)`}
          icone={Building2}
        />
      </div>

      {/* Barra de Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por setor..."
            className="pl-8"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={filtroStatus}
            onValueChange={(v) => setFiltroStatus(v as "todos" | "ativos" | "inativos")}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="ativos">Apenas ativos</SelectItem>
              <SelectItem value="inativos">Apenas inativos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabela de Setores */}
      <div className="rounded-md border bg-background shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Setor</TableHead>
              {exibeMultiEmpresa && <TableHead>Empresa</TableHead>}
              <TableHead className="text-center">Colaboradores</TableHead>
              <TableHead className="text-center">Vagas / Metas</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {setoresFiltrados.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={exibeMultiEmpresa ? 6 : 5}
                  className="py-8 text-center text-muted-foreground"
                >
                  Nenhum setor encontrado com os filtros aplicados.
                </TableCell>
              </TableRow>
            ) : (
              setoresFiltrados.map((s) => {
                const pctColaboradores =
                  kpis.totalColaboradores > 0
                    ? Math.round(((s._count?.colaboradores ?? 0) / kpis.totalColaboradores) * 100)
                    : 0;

                return (
                  <TableRow key={s.id} className={s.ativo ? "" : "opacity-60"}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2.5">
                        <SetorAvatar nome={s.nome} id={s.id} />
                        <div>
                          <p className="font-semibold text-foreground">{s.nome}</p>
                          <p className="text-[11px] text-muted-foreground">
                            ID: {s.id.slice(-6)}
                          </p>
                        </div>
                      </div>
                    </TableCell>

                    {exibeMultiEmpresa && (
                      <TableCell>
                        <Badge variant="outline" className="text-[11px]">
                          {s.empresa.nome}
                        </Badge>
                      </TableCell>
                    )}

                    <TableCell className="text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="font-medium tabular-nums">
                          {s._count?.colaboradores ?? 0}
                        </span>
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${pctColaboradores}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {pctColaboradores}% do total
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                        <span title="Vagas em aberto">
                          🎯 {s._count?.vagas ?? 0} vaga(s)
                        </span>
                        <span>•</span>
                        <span title="Metas ativas">
                          📌 {s._count?.metas ?? 0} meta(s)
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="text-center">
                      <button
                        type="button"
                        className="cursor-pointer"
                        onClick={async () => {
                          const result = await toggleSetorAtivo(empresaId, s.id, !s.ativo);
                          if (result.ok) {
                            toast.success(s.ativo ? "Setor desativado." : "Setor ativado.");
                          }
                        }}
                      >
                        <Badge variant={s.ativo ? "default" : "secondary"}>
                          {s.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </button>
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditSetor(s)}
                          title="Editar setor"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <DeleteSetorButton empresaId={empresaId} setor={s} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Modal de Edição */}
      <Dialog open={!!editSetor} onOpenChange={(open) => !open && setEditSetor(null)}>
        <DialogContent>
          {editSetor && (
            <SetorForm
              action={updateSetor.bind(null, empresaId, editSetor.id)}
              title="Editar Setor"
              defaultNome={editSetor.nome}
              defaultEmpresaId={editSetor.empresaId}
              empresas={empresas}
              onSuccess={() => setEditSetor(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SetorForm({
  action,
  title,
  defaultNome = "",
  defaultEmpresaId = "",
  empresas,
  empresaIdDefault = "",
  onSuccess,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  title: string;
  defaultNome?: string;
  defaultEmpresaId?: string;
  empresas: Empresa[];
  empresaIdDefault?: string;
  onSuccess: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    async (prev: ActionResult, fd: FormData) => {
      const result = await action(prev, fd);
      if (result.ok) {
        toast.success("Setor salvo com sucesso.");
        onSuccess();
      }
      return result;
    },
    initialState,
  );

  const selecionada = defaultEmpresaId || empresaIdDefault || empresas[0]?.id;

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>

      {empresas.length > 1 && (
        <div className="space-y-2">
          <Label htmlFor="empresaId">Empresa</Label>
          <Select name="empresaId" defaultValue={selecionada}>
            <SelectTrigger>
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

      <div className="space-y-2">
        <Label htmlFor="nome">Nome do setor</Label>
        <Input
          id="nome"
          name="nome"
          defaultValue={defaultNome}
          placeholder="Ex: Comercial, Financeiro, TI"
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

function DeleteSetorButton({ empresaId, setor }: { empresaId: string; setor: Setor }) {
  const [confirming, setConfirming] = useState(false);

  async function handleDelete() {
    const result = await deleteSetor(empresaId, setor.id);
    if (result.ok) {
      toast.success("Setor excluído.");
    } else {
      toast.error(result.error);
    }
    setConfirming(false);
  }

  if (confirming) {
    return (
      <div className="flex gap-1">
        <Button variant="destructive" size="sm" onClick={handleDelete}>
          Excluir
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
          Cancelar
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setConfirming(true)}
      title="Excluir setor"
    >
      <Trash2 className="size-4" />
    </Button>
  );
}
