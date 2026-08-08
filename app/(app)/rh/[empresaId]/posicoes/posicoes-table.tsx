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
  Briefcase,
  CheckCircle2,
  Building2,
  Search,
  UsersRound,
  Sparkles,
  GitMerge,
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
import {
  createPosicao,
  updatePosicao,
  deletePosicao,
  togglePosicaoAtiva,
  unificarPosicoes,
  limparDuplicatasPosicoesAuto,
} from "@/lib/actions/rh-posicoes";
import type { ActionResult } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Empresa = { id: string; nome: string };
type Posicao = {
  id: string;
  nome: string;
  ativo: boolean;
  empresaId: string;
  empresa: Empresa;
  _count: { colaboradores: number; vagas?: number };
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

function PosicaoAvatar({ nome, id }: { nome: string; id: string }) {
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
        {iniciais.toUpperCase() || "CG"}
      </AvatarFallback>
    </Avatar>
  );
}

export function PosicoesTable({
  empresaId,
  empresasDoUsuario,
  posicoes,
  empresas,
}: {
  empresaId: string;
  empresasDoUsuario: string[];
  posicoes: Posicao[];
  empresas: Empresa[];
}) {
  const empresasSelecionadas = useFiltroEmpresas(empresasDoUsuario);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "ativos" | "inativos">("todos");
  const [createOpen, setCreateOpen] = useState(false);
  const [editPosicao, setEditPosicao] = useState<Posicao | null>(null);
  const [unificarPosicaoOrigem, setUnificarPosicaoOrigem] = useState<Posicao | null>(null);
  const [isCleaning, setIsCleaning] = useState(false);

  const posicoesFiltradas = useMemo(() => {
    return posicoes.filter((p) => {
      const matchEmpresa = empresasSelecionadas.includes(p.empresaId);
      const matchBusca = busca === "" || p.nome.toLowerCase().includes(busca.toLowerCase());
      const matchStatus =
        filtroStatus === "todos"
          ? true
          : filtroStatus === "ativos"
          ? p.ativo
          : !p.ativo;
      return matchEmpresa && matchBusca && matchStatus;
    });
  }, [posicoes, empresasSelecionadas, busca, filtroStatus]);

  // Identificação de duplicatas por nome
  const contagemDuplicatas = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const p of posicoesFiltradas) {
      const chave = `${p.empresaId}:${p.nome.trim().toLowerCase()}`;
      contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
    }
    let duplicados = 0;
    for (const count of contagem.values()) {
      if (count > 1) duplicados += count - 1;
    }
    return duplicados;
  }, [posicoesFiltradas]);

  // Cálculos de KPIs
  const kpis = useMemo(() => {
    const totalPosicoes = posicoesFiltradas.length;
    const posicoesAtivas = posicoesFiltradas.filter((p) => p.ativo).length;
    const totalColaboradores = posicoesFiltradas.reduce(
      (acc, p) => acc + (p._count?.colaboradores ?? 0),
      0,
    );

    const maiorPosicao = [...posicoesFiltradas].sort(
      (a, b) => (b._count?.colaboradores ?? 0) - (a._count?.colaboradores ?? 0),
    )[0];

    return {
      totalPosicoes,
      posicoesAtivas,
      totalColaboradores,
      maiorPosicaoNome: maiorPosicao?.nome ?? "Nenhum",
      maiorPosicaoCount: maiorPosicao?._count?.colaboradores ?? 0,
    };
  }, [posicoesFiltradas]);

  const exibeMultiEmpresa = empresas.length > 1;

  async function handleAutoLimpeza() {
    setIsCleaning(true);
    try {
      const res = await limparDuplicatasPosicoesAuto(empresaId);
      if (res.ok) {
        toast.success(
          res.removidos > 0
            ? `${res.removidos} cargo(s) duplicado(s) unificado(s) e limpos com sucesso!`
            : "Nenhum cargo duplicado encontrado para limpeza automática.",
        );
      } else {
        toast.error(res.error || "Erro ao realizar auto-limpeza.");
      }
    } catch {
      toast.error("Erro inesperado ao unificar duplicatas.");
    } finally {
      setIsCleaning(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Cargos & Funções
          </h1>
          <p className="text-xs text-muted-foreground">
            Matriz de cargos, funções e posições de trabalho ativas na empresa.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {contagemDuplicatas > 0 && (
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5 border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
              onClick={handleAutoLimpeza}
              disabled={isCleaning}
            >
              <Sparkles className="size-3.5 text-amber-600 dark:text-amber-400" />
              {isCleaning ? "Unificando..." : `Limpar ${contagemDuplicatas} Duplicatas`}
            </Button>
          )}

          <Link href={`/rh/${empresaId}/setores`}>
            <Button variant="outline" size="sm" className="gap-1.5">
              <UsersRound className="size-3.5" />
              Ver Setores
            </Button>
          </Link>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger render={<Button size="sm" className="gap-1.5" />}>
              <Plus className="size-3.5" />
              Novo Cargo
            </DialogTrigger>
            <DialogContent>
              <PosicaoForm
                action={createPosicao.bind(null, empresaId)}
                title="Novo Cargo / Função"
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
        <KpiCard rotulo="Total de Cargos" valor={kpis.totalPosicoes} icone={Briefcase} />
        <KpiCard rotulo="Cargos Ativos" valor={kpis.posicoesAtivas} icone={CheckCircle2} />
        <KpiCard rotulo="Colaboradores Vinculados" valor={kpis.totalColaboradores} icone={Users} />
        <KpiCard
          rotulo="Maior Função"
          valor={kpis.maiorPosicaoNome}
          subtitulo={`${kpis.maiorPosicaoCount} colaborador(es)`}
          icone={Building2}
        />
      </div>

      {/* Barra de Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cargo ou função..."
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

      {/* Tabela de Cargos */}
      <div className="rounded-md border bg-background shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cargo / Função</TableHead>
              {exibeMultiEmpresa && <TableHead>Empresa</TableHead>}
              <TableHead className="text-center">Colaboradores</TableHead>
              <TableHead className="text-center">Vagas Abertas</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="w-28 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {posicoesFiltradas.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={exibeMultiEmpresa ? 6 : 5}
                  className="py-8 text-center text-muted-foreground"
                >
                  Nenhum cargo/função encontrado com os filtros aplicados.
                </TableCell>
              </TableRow>
            ) : (
              posicoesFiltradas.map((p) => {
                const pctColaboradores =
                  kpis.totalColaboradores > 0
                    ? Math.round(((p._count?.colaboradores ?? 0) / kpis.totalColaboradores) * 100)
                    : 0;

                const temDuplicataNominal = posicoesFiltradas.some(
                  (outro) =>
                    outro.id !== p.id &&
                    outro.empresaId === p.empresaId &&
                    outro.nome.trim().toLowerCase() === p.nome.trim().toLowerCase(),
                );

                return (
                  <TableRow key={p.id} className={p.ativo ? "" : "opacity-60"}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2.5">
                        <PosicaoAvatar nome={p.nome} id={p.id} />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-foreground">{p.nome}</p>
                            {temDuplicataNominal && (
                              <Badge
                                variant="outline"
                                className="border-amber-400 bg-amber-50 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                              >
                                Duplicado
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            ID: {p.id.slice(-6)}
                          </p>
                        </div>
                      </div>
                    </TableCell>

                    {exibeMultiEmpresa && (
                      <TableCell>
                        <Badge variant="outline" className="text-[11px]">
                          {p.empresa.nome}
                        </Badge>
                      </TableCell>
                    )}

                    <TableCell className="text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="font-medium tabular-nums">
                          {p._count?.colaboradores ?? 0}
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
                      <span className="text-xs text-muted-foreground">
                        🎯 {p._count?.vagas ?? 0} vaga(s)
                      </span>
                    </TableCell>

                    <TableCell className="text-center">
                      <button
                        type="button"
                        className="cursor-pointer"
                        onClick={async () => {
                          const result = await togglePosicaoAtiva(empresaId, p.id, !p.ativo);
                          if (result.ok) {
                            toast.success(p.ativo ? "Cargo desativado." : "Cargo ativado.");
                          }
                        }}
                      >
                        <Badge variant={p.ativo ? "default" : "secondary"}>
                          {p.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </button>
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setUnificarPosicaoOrigem(p)}
                          title="Unificar / Mesclar com outro cargo"
                        >
                          <GitMerge className="size-4 text-muted-foreground hover:text-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditPosicao(p)}
                          title="Editar cargo"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <DeletePosicaoButton empresaId={empresaId} posicao={p} />
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
      <Dialog open={!!editPosicao} onOpenChange={(open) => !open && setEditPosicao(null)}>
        <DialogContent>
          {editPosicao && (
            <PosicaoForm
              action={updatePosicao.bind(null, empresaId, editPosicao.id)}
              title="Editar Cargo / Função"
              defaultNome={editPosicao.nome}
              defaultEmpresaId={editPosicao.empresaId}
              empresas={empresas}
              onSuccess={() => setEditPosicao(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Unificação Manual */}
      <Dialog open={!!unificarPosicaoOrigem} onOpenChange={(open) => !open && setUnificarPosicaoOrigem(null)}>
        <DialogContent>
          {unificarPosicaoOrigem && (
            <UnificarPosicaoModal
              empresaId={empresaId}
              posicaoOrigem={unificarPosicaoOrigem}
              todasPosicoes={posicoes}
              onSuccess={() => setUnificarPosicaoOrigem(null)}
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
        toast.success("Cargo salvo com sucesso.");
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
        <Label htmlFor="nome">Nome do cargo / função</Label>
        <Input
          id="nome"
          name="nome"
          defaultValue={defaultNome}
          placeholder="Ex: Analista de RH, Vendedor(a), Gerente"
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

function UnificarPosicaoModal({
  empresaId,
  posicaoOrigem,
  todasPosicoes,
  onSuccess,
}: {
  empresaId: string;
  posicaoOrigem: Posicao;
  todasPosicoes: Posicao[];
  onSuccess: () => void;
}) {
  const [destinoId, setDestinoId] = useState("");
  const [isPending, setIsPending] = useState(false);

  const opcoesDestino = useMemo(() => {
    return todasPosicoes.filter(
      (p) => p.id !== posicaoOrigem.id && p.empresaId === posicaoOrigem.empresaId,
    );
  }, [todasPosicoes, posicaoOrigem]);

  async function handleUnificar() {
    if (!destinoId) {
      toast.error("Selecione o cargo de destino.");
      return;
    }
    setIsPending(true);
    try {
      const res = await unificarPosicoes(empresaId, posicaoOrigem.id, destinoId);
      if (res.ok) {
        toast.success("Cargos unificados com sucesso!");
        onSuccess();
      } else {
        toast.error(res.error || "Erro ao unificar cargos.");
      }
    } catch {
      toast.error("Erro inesperado ao unificar cargos.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>Unificar Cargo / Função</DialogTitle>
      </DialogHeader>

      <p className="text-xs text-muted-foreground">
        Migre todos os colaboradores, requisitos de NR e vagas de{" "}
        <strong className="text-foreground font-semibold">{posicaoOrigem.nome}</strong> para o cargo
        principal escolhido abaixo. O cargo de origem será excluído em seguida.
      </p>

      <div className="space-y-2">
        <Label>Cargo Principal (Destino)</Label>
        <Select value={destinoId} onValueChange={(val) => setDestinoId(val ?? "")}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione o cargo de destino..." />
          </SelectTrigger>
          <SelectContent>
            {opcoesDestino.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nome} ({p._count?.colaboradores ?? 0} colaboradores)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onSuccess}>
          Cancelar
        </Button>
        <Button onClick={handleUnificar} disabled={isPending || !destinoId}>
          {isPending ? "Unificando..." : "Confirmar Unificação"}
        </Button>
      </DialogFooter>
    </div>
  );
}

function DeletePosicaoButton({ empresaId, posicao }: { empresaId: string; posicao: Posicao }) {
  const [confirming, setConfirming] = useState(false);

  async function handleDelete() {
    const result = await deletePosicao(empresaId, posicao.id);
    if (result.ok) {
      toast.success("Cargo excluído.");
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
      title="Excluir cargo"
    >
      <Trash2 className="size-4" />
    </Button>
  );
}
