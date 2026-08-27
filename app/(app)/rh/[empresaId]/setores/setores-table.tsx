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
  Sparkles,
  GitMerge,
  Wand2,
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
  createSetor,
  updateSetor,
  deleteSetor,
  toggleSetorAtivo,
  unificarSetores,
  unificarGrupoSetores,
  limparDuplicatasSetoresAuto,
  removerSetoresSemColaboradores,
} from "@/lib/actions/rh-setores";
import { agruparSetoresSemelhantes, type GrupoSetorSemelhante } from "@/lib/setores-semelhantes";
import type { ActionResult } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Empresa = { id: string; nome: string; marcaId: string };
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
  empresas = [],
}: {
  empresaId: string;
  empresasDoUsuario: string[];
  setores: Setor[];
  empresas?: Empresa[];
}) {
  const empresasSelecionadas = useFiltroEmpresas(empresasDoUsuario);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "ativos" | "inativos">("todos");
  const [createOpen, setCreateOpen] = useState(false);
  const [editSetor, setEditSetor] = useState<Setor | null>(null);
  const [unificarSetorOrigem, setUnificarSetorOrigem] = useState<Setor | null>(null);
  const [painelSemelhantesAberto, setPainelSemelhantesAberto] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [isRemovingSemColab, setIsRemovingSemColab] = useState(false);

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

  // Identificação de duplicatas por nome
  const contagemDuplicatas = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const s of setoresFiltrados) {
      const chave = `${s.empresaId}:${s.nome.trim().toLowerCase()}`;
      contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
    }
    let duplicados = 0;
    for (const count of contagem.values()) {
      if (count > 1) duplicados += count - 1;
    }
    return duplicados;
  }, [setoresFiltrados]);

  // Análise semântica de setores semelhantes (ex: Vendas vs Comercial, TI vs Tecnologia)
  const gruposSemelhantes = useMemo(() => {
    const formatados = setoresFiltrados.map((s) => ({
      id: s.id,
      nome: s.nome,
      // A marca vem junto: o agrupador precisa dela para cada grupo nascer
      // dentro de uma marca só, e assim ser unificável de verdade.
      marcaId: s.empresa.marcaId,
      colaboradoresCount: s._count?.colaboradores ?? 0,
      vagasCount: s._count?.vagas ?? 0,
      metasCount: s._count?.metas ?? 0,
      ativo: s.ativo,
    }));
    return agruparSetoresSemelhantes(formatados);
  }, [setoresFiltrados]);

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

  const setoresSemColabCount = useMemo(() => {
    return setoresFiltrados.filter((s) => (s._count?.colaboradores ?? 0) === 0).length;
  }, [setoresFiltrados]);

  async function handleRemoverSemColaboradores() {
    setIsRemovingSemColab(true);
    try {
      const res = await removerSetoresSemColaboradores(empresaId);
      if (res.ok) {
        toast.success(
          res.removidos > 0
            ? `${res.removidos} setor(es) sem colaboradores removido(s) com sucesso!`
            : "Nenhum setor sem colaboradores para remover.",
        );
      } else {
        toast.error(res.error || "Erro ao remover setores sem colaboradores.");
      }
    } catch {
      toast.error("Erro inesperado ao remover setores sem colaboradores.");
    } finally {
      setIsRemovingSemColab(false);
    }
  }

  async function handleAutoLimpeza() {
    setIsCleaning(true);
    try {
      const res = await limparDuplicatasSetoresAuto(empresaId);
      if (res.ok) {
        toast.success(
          res.removidos > 0
            ? `${res.removidos} setor(es) duplicado(s) unificado(s) e limpos com sucesso!`
            : "Nenhum setor duplicado encontrado para limpeza automática.",
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
            Setores & Departamentos
          </h1>
          <p className="text-xs text-muted-foreground">
            Estrutura de setores e áreas organizacionais das empresas do grupo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {gruposSemelhantes.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-violet-300 bg-violet-50 text-violet-900 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-200"
              onClick={() => setPainelSemelhantesAberto(true)}
            >
              <Wand2 className="size-3.5 text-violet-600 dark:text-violet-400" />
              Análise de Setores Semelhantes ({gruposSemelhantes.length})
            </Button>
          )}

          {contagemDuplicatas > 0 && (
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5 border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
              onClick={handleAutoLimpeza}
              disabled={isCleaning}
            >
              <Sparkles className="size-3.5 text-amber-600 dark:text-amber-400" />
              {isCleaning ? "Unificando..." : `Limpar ${contagemDuplicatas} Exatas`}
            </Button>
          )}

          {setoresSemColabCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-rose-300 bg-rose-50 text-rose-900 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200"
              onClick={handleRemoverSemColaboradores}
              disabled={isRemovingSemColab}
            >
              <Trash2 className="size-3.5 text-rose-600 dark:text-rose-400" />
              {isRemovingSemColab ? "Removendo..." : `Remover ${setoresSemColabCount} Sem Funcionários`}
            </Button>
          )}

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
                defaultEmpresaId={empresaId}
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
              <TableHead className="text-center">Colaboradores</TableHead>
              <TableHead className="text-center">Vagas / Metas</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="w-28 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {setoresFiltrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Nenhum setor encontrado com os filtros aplicados.
                </TableCell>
              </TableRow>
            ) : (
              setoresFiltrados.map((s) => {
                const pctColaboradores =
                  kpis.totalColaboradores > 0
                    ? Math.round(((s._count?.colaboradores ?? 0) / kpis.totalColaboradores) * 100)
                    : 0;

                const temDuplicataNominal = setoresFiltrados.some(
                  (outro) =>
                    outro.id !== s.id &&
                    outro.empresaId === s.empresaId &&
                    outro.nome.trim().toLowerCase() === s.nome.trim().toLowerCase(),
                );

                return (
                  <TableRow key={s.id} className={s.ativo ? "" : "opacity-60"}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2.5">
                        <SetorAvatar nome={s.nome} id={s.id} />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-foreground">{s.nome}</p>
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
                            ID: {s.id.slice(-6)}
                          </p>
                        </div>
                      </div>
                    </TableCell>

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
                          } else {
                            toast.error(result.error || "Erro ao alterar o status do setor.");
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
                          onClick={() => setUnificarSetorOrigem(s)}
                          title="Unificar / Mesclar com outro setor"
                        >
                          <GitMerge className="size-4 text-muted-foreground hover:text-foreground" />
                        </Button>
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
              onSuccess={() => setEditSetor(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Unificação Manual */}
      <Dialog open={!!unificarSetorOrigem} onOpenChange={(open) => !open && setUnificarSetorOrigem(null)}>
        <DialogContent>
          {unificarSetorOrigem && (
            <UnificarSetorModal
              empresaId={empresaId}
              setorOrigem={unificarSetorOrigem}
              todosSetores={setores}
              onSuccess={() => setUnificarSetorOrigem(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Análise Semântica de Setores Semelhantes */}
      <Dialog open={painelSemelhantesAberto} onOpenChange={setPainelSemelhantesAberto}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="size-5 text-violet-600 dark:text-violet-400" />
              Análise & Unificação Semântica de Setores
            </DialogTitle>
          </DialogHeader>

          <p className="text-xs text-muted-foreground">
            O algoritmo identificou setores equivalentes (ex: Comercial ↔ Vendas, RH ↔ Recursos Humanos).
            Escolha o setor principal para consolidar os colaboradores, vagas e metas.
          </p>

          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            {gruposSemelhantes.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Nenhum grupo de setores semelhantes encontrado! Todos os setores estão padronizados.
              </p>
            ) : (
              gruposSemelhantes.map((grupo, idx) => (
                <GrupoSetorSemelhanteCard
                  key={grupo.chaveStem || idx}
                  empresaId={empresaId}
                  grupo={grupo}
                />
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPainelSemelhantesAberto(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GrupoSetorSemelhanteCard({
  empresaId,
  grupo,
}: {
  empresaId: string;
  grupo: GrupoSetorSemelhante;
}) {
  const [destinoId, setDestinoId] = useState(grupo.setores[0]?.id ?? "");
  const [nomeCustomizado, setNomeCustomizado] = useState(grupo.sugestaoNome);
  const [isPending, setIsPending] = useState(false);

  async function handleUnificarGrupo() {
    if (!destinoId) {
      toast.error("Selecione o setor de destino.");
      return;
    }
    setIsPending(true);
    try {
      const todosIds = grupo.setores.map((s) => s.id);
      const res = await unificarGrupoSetores(empresaId, todosIds, destinoId, nomeCustomizado);
      if (res.ok) {
        toast.success(`Setores unificados com sucesso para "${nomeCustomizado}"!`);
      } else {
        toast.error(res.error || "Erro ao unificar setores.");
      }
    } catch {
      toast.error("Erro inesperado ao unificar setores.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3.5 text-xs shadow-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-semibold text-violet-700 bg-violet-50 border-violet-200 dark:text-violet-300 dark:bg-violet-950/50 dark:border-violet-800">
            {grupo.setores.length} setores equivalentes encontrados
          </Badge>
          <span className="text-muted-foreground font-medium">
            ({grupo.totalColaboradores} colaboradores afetados)
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-1.5 rounded-md bg-muted/40 p-2.5">
        {grupo.setores.map((s) => (
          <div key={s.id} className="flex items-center justify-between font-medium">
            <span className="flex items-center gap-1.5">
              <span>• {s.nome}</span>
              {s.id === destinoId && (
                <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-400 bg-emerald-50 dark:text-emerald-300 dark:border-emerald-700 dark:bg-emerald-950/50">
                  Principal Escolhido
                </Badge>
              )}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {s.colaboradoresCount} colab(s)
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <Label className="text-[11px]">Setor Principal (Receberá os dados)</Label>
          <Select value={destinoId} onValueChange={(v) => setDestinoId(v ?? "")}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {grupo.setores.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.nome} ({s.colaboradoresCount} colabs)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-[11px]">Nome Final Padronizado</Label>
          <Input
            className="h-8 text-xs"
            value={nomeCustomizado}
            onChange={(e) => setNomeCustomizado(e.target.value)}
            placeholder="Ex: Vendas"
          />
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <Button
          size="sm"
          className="h-8 gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs"
          onClick={handleUnificarGrupo}
          disabled={isPending || !destinoId}
        >
          <GitMerge className="size-3.5" />
          {isPending ? "Unificando..." : "Unificar este Grupo"}
        </Button>
      </div>
    </div>
  );
}

function SetorForm({
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
  const [empresaSelecionada, setEmpresaSelecionada] = useState(defaultEmpresaId);
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

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>

      {empresas.length > 1 && (
        <div className="space-y-2">
          <Label>Empresa</Label>
          {/* A lista mostra o grupo inteiro, então o setor novo também pode
              nascer em qualquer CNPJ visível — sem trocar de tela. */}
          <input type="hidden" name="empresaId" value={empresaSelecionada} />
          <Select value={empresaSelecionada} onValueChange={(v) => setEmpresaSelecionada(v ?? defaultEmpresaId)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione a empresa..." />
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
          placeholder="Ex: Vendas, Financeiro, TI"
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

function UnificarSetorModal({
  empresaId,
  setorOrigem,
  todosSetores,
  onSuccess,
}: {
  empresaId: string;
  setorOrigem: Setor;
  todosSetores: Setor[];
  onSuccess: () => void;
}) {
  const [destinoId, setDestinoId] = useState("");
  const [isPending, setIsPending] = useState(false);

  const opcoesDestino = useMemo(() => {
    return todosSetores.filter(
      (s) => s.id !== setorOrigem.id && s.empresaId === setorOrigem.empresaId,
    );
  }, [todosSetores, setorOrigem]);

  async function handleUnificar() {
    if (!destinoId) {
      toast.error("Selecione o setor de destino.");
      return;
    }
    setIsPending(true);
    try {
      const res = await unificarSetores(empresaId, setorOrigem.id, destinoId);
      if (res.ok) {
        toast.success("Setores unificados com sucesso!");
        onSuccess();
      } else {
        toast.error(res.error || "Erro ao unificar setores.");
      }
    } catch {
      toast.error("Erro inesperado ao unificar setores.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>Unificar Setor</DialogTitle>
      </DialogHeader>

      <p className="text-xs text-muted-foreground">
        Migre todos os colaboradores, vagas e metas de{" "}
        <strong className="text-foreground font-semibold">{setorOrigem.nome}</strong> para o setor
        principal escolhido abaixo. O setor de origem será excluído em seguida.
      </p>

      <div className="space-y-2">
        <Label>Setor Principal (Destino)</Label>
        <Select value={destinoId} onValueChange={(val) => setDestinoId(val ?? "")}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione o setor de destino..." />
          </SelectTrigger>
          <SelectContent>
            {opcoesDestino.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.nome} ({s._count?.colaboradores ?? 0} colaboradores)
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
