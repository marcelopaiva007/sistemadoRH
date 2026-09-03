"use client";

import { useActionState, useState, useMemo } from "react";
import Link from "next/link";
import { useFiltroEmpresas } from "../filtro-empresas";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  ChevronRight,
  Trash2,
  Users,
  Briefcase,
  CheckCircle2,
  Building2,
  Search,
  UsersRound,
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
  createPosicao,
  updatePosicao,
  deletePosicao,
  togglePosicaoAtiva,
  unificarPosicoes,
  unificarGrupoPosicoes,
  limparDuplicatasPosicoesAuto,
  removerPosicoesSemColaboradores,
} from "@/lib/actions/rh-posicoes";
import { agruparCargosSemelhantes, type GrupoCargoSemelhante } from "@/lib/cargos-semelhantes";
import type { ActionResult } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Empresa = { id: string; nome: string; marcaId: string };
type Posicao = {
  id: string;
  nome: string;
  ativo: boolean;
  empresaId: string;
  empresa: Empresa;
  /** Contagens de ATIVOS (a tela não conta desligado). */
  _count: { colaboradores: number; vagas?: number };
  /** Vínculos TOTAIS (ativos + desligados) — decide só a elegibilidade de remoção. */
  vinculadosTotais: number;
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
    "bg-card text-foreground",
    "bg-card text-success",
    "bg-card text-foreground",
    "bg-card text-muted-foreground",
    "bg-accent text-destructive",
    "bg-card text-foreground",
    "bg-card text-success",
    "bg-fuchsia-100 text-fuchsia-700",
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
}: {
  empresaId: string;
  empresasDoUsuario: string[];
  posicoes: Posicao[];
  empresas?: Empresa[];
}) {
  const empresasSelecionadas = useFiltroEmpresas(empresasDoUsuario);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "ativos" | "inativos">("todos");
  const [createOpen, setCreateOpen] = useState(false);
  const [editPosicao, setEditPosicao] = useState<Posicao | null>(null);
  const [unificarPosicaoOrigem, setUnificarPosicaoOrigem] = useState<Posicao | null>(null);
  const [painelSemelhantesAberto, setPainelSemelhantesAberto] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [isRemovingSemColab, setIsRemovingSemColab] = useState(false);

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

  // ── Agrupamento por NOME ──────────────────────────────────────────────
  // Mesmo desenho da tela de Setores (v1.126.0): Posicao é uma linha por CNPJ
  // e o mesmo cargo legítimo em várias empresas lia-se como repetição. Uma
  // linha por nome, CNPJs dentro, expansíveis.
  const [gruposAbertos, setGruposAbertos] = useState<Set<string>>(new Set());
  const grupos = useMemo(() => {
    const porChave = new Map<string, { chave: string; nome: string; linhas: Posicao[] }>();
    for (const p of posicoesFiltradas) {
      const chave = p.nome.trim().toLowerCase().replace(/\s+/g, " ");
      let g = porChave.get(chave);
      if (!g) {
        g = { chave, nome: p.nome, linhas: [] };
        porChave.set(chave, g);
      }
      g.linhas.push(p);
    }
    return [...porChave.values()]
      .map((g) => ({
        ...g,
        colab: g.linhas.reduce((a, l) => a + (l._count?.colaboradores ?? 0), 0),
        vagas: g.linhas.reduce((a, l) => a + (l._count?.vagas ?? 0), 0),
        ativos: g.linhas.filter((l) => l.ativo).length,
      }))
      .sort((a, b) => b.colab - a.colab || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [posicoesFiltradas]);

  function alternarGrupo(chave: string) {
    setGruposAbertos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });
  }

  // Identificação de duplicatas por nome idêntico (trim + lowercase)
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

  // Análise semântica de cargos com grafias/gênero/sinônimos parecidos
  const gruposSemelhantes = useMemo(() => {
    const formatadas = posicoesFiltradas.map((p) => ({
      id: p.id,
      nome: p.nome,
      // A marca vem junto: cada grupo nasce dentro de uma marca só, e assim é
      // unificável de verdade (ver lib/actions/guarda-unificacao.ts).
      marcaId: p.empresa.marcaId,
      colaboradoresCount: p._count?.colaboradores ?? 0,
      vagasCount: p._count?.vagas ?? 0,
      ativo: p.ativo,
    }));
    return agruparCargosSemelhantes(formatadas);
  }, [posicoesFiltradas]);

  // Cálculos de KPIs — contam CARGOS (nomes), não registros por CNPJ.
  const kpis = useMemo(() => {
    const totalPosicoes = grupos.length;
    const totalRegistros = posicoesFiltradas.length;
    const posicoesAtivas = grupos.filter((g) => g.ativos > 0).length;
    const totalColaboradores = grupos.reduce((acc, g) => acc + g.colab, 0);
    const maiorPosicao = grupos[0]
      ? { nome: grupos[0].nome, _count: { colaboradores: grupos[0].colab } }
      : undefined;

    return {
      totalPosicoes,
      totalRegistros,
      posicoesAtivas,
      totalColaboradores,
      maiorPosicaoNome: maiorPosicao?.nome ?? "Nenhum",
      maiorPosicaoCount: maiorPosicao?._count?.colaboradores ?? 0,
    };
  }, [grupos, posicoesFiltradas]);

  // Contagem de cargos sem nenhum colaborador cadastrado
  const cargosSemColabCount = useMemo(() => {
    // Elegível para remoção = sem vínculo NENHUM (nem desligado) — mesma
    // régua do servidor (colaboradores: { none: {} }).
    return posicoesFiltradas.filter((p) => p.vinculadosTotais === 0).length;
  }, [posicoesFiltradas]);

  async function handleRemoverSemColaboradores() {
    setIsRemovingSemColab(true);
    try {
      const res = await removerPosicoesSemColaboradores(empresaId);
      if (res.ok) {
        toast.success(
          res.removidos > 0
            ? `${res.removidos} cargo(s) sem colaboradores removido(s) com sucesso!`
            : "Nenhum cargo sem colaboradores para remover.",
        );
      } else {
        toast.error(res.error || "Erro ao remover cargos sem colaboradores.");
      }
    } catch {
      toast.error("Erro inesperado ao remover cargos sem colaboradores.");
    } finally {
      setIsRemovingSemColab(false);
    }
  }

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
            Matriz de cargos, funções e posições de trabalho da marca.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {gruposSemelhantes.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-border bg-card text-foreground hover:bg-card"
              onClick={() => setPainelSemelhantesAberto(true)}
            >
              <Wand2 className="size-3.5 text-foreground" />
              Análise de Cargos Semelhantes ({gruposSemelhantes.length})
            </Button>
          )}

          {contagemDuplicatas > 0 && (
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5 border-border bg-card text-muted-foreground hover:bg-card"
              onClick={handleAutoLimpeza}
              disabled={isCleaning}
            >
              <Sparkles className="size-3.5 text-muted-foreground" />
              {isCleaning ? "Unificando..." : `Limpar ${contagemDuplicatas} Exatas`}
            </Button>
          )}

          {cargosSemColabCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-primary bg-accent text-destructive hover:bg-accent"
              onClick={handleRemoverSemColaboradores}
              disabled={isRemovingSemColab}
            >
              <Trash2 className="size-3.5 text-destructive" />
              {isRemovingSemColab ? "Removendo..." : `Remover ${cargosSemColabCount} Sem Funcionários`}
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
                onSuccess={() => setCreateOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard rotulo="Total de Cargos" valor={kpis.totalPosicoes} subtitulo={`${kpis.totalRegistros} registro(s) por CNPJ`} icone={Briefcase} />
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
              <TableHead className="text-center">Colaboradores</TableHead>
              <TableHead className="text-center">Vagas Abertas</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="w-28 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grupos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Nenhum cargo/função encontrado com os filtros aplicados.
                </TableCell>
              </TableRow>
            ) : (
              grupos.flatMap((g) => {
                const aberto = gruposAbertos.has(g.chave);
                const pctColaboradores =
                  kpis.totalColaboradores > 0
                    ? Math.round((g.colab / kpis.totalColaboradores) * 100)
                    : 0;

                const linhaDoGrupo = (
                  <TableRow
                    key={g.chave}
                    className={cn("cursor-pointer", g.ativos === 0 && "opacity-60")}
                    onClick={() => alternarGrupo(g.chave)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2.5">
                        <ChevronRight
                          className={cn(
                            "size-4 shrink-0 text-muted-foreground transition-transform",
                            aberto && "rotate-90",
                          )}
                        />
                        <PosicaoAvatar nome={g.nome} id={g.linhas[0].id} />
                        <div>
                          <p className="font-semibold text-foreground">{g.nome}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {g.linhas.length === 1
                              ? g.linhas[0].empresa.nome
                              : `em ${g.linhas.length} CNPJs`}
                          </p>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="font-medium tabular-nums">{g.colab}</span>
                        <div className="h-1.5 w-16 overflow-hidden bg-card">
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
                      <span className="text-xs text-muted-foreground">🎯 {g.vagas} vaga(s)</span>
                    </TableCell>

                    <TableCell className="text-center">
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

                const subLinhas = g.linhas.map((p) => {
                  const temDuplicataNominal = g.linhas.some(
                    (outro) => outro.id !== p.id && outro.empresaId === p.empresaId,
                  );
                  return (
                    <TableRow key={p.id} className={cn("bg-muted/30", !p.ativo && "opacity-60")}>
                      <TableCell>
                        <div className="flex items-center gap-2 pl-11">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm text-foreground">{p.empresa.nome}</p>
                              {temDuplicataNominal && (
                                <Badge
                                  variant="outline"
                                  className="border-border bg-card text-[10px] text-muted-foreground"
                                >
                                  Duplicado no CNPJ
                                </Badge>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground">ID: {p.id.slice(-6)}</p>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="text-center">
                        <span className="font-medium tabular-nums">
                          {p._count?.colaboradores ?? 0}
                        </span>
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
                            } else {
                              toast.error(result.error || "Erro ao alterar o status do cargo.");
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
                });

                return [linhaDoGrupo, ...subLinhas];
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

      {/* Modal de Análise Semântica de Cargos Semelhantes */}
      <Dialog open={painelSemelhantesAberto} onOpenChange={setPainelSemelhantesAberto}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="size-5 text-foreground" />
              Análise & Unificação Semântica de Cargos
            </DialogTitle>
          </DialogHeader>

          <p className="text-xs text-muted-foreground">
            O algoritmo identificou cargos com variação de gênero (ex: Vendedor / Vendedora),
            abreviações (ex: Adm / Administrativo) ou nomes muito semelhantes. Selecione o nome final
            para unificar cada grupo.
          </p>

          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            {gruposSemelhantes.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Nenhum grupo de cargos semelhantes encontrado! Todos os cargos estão padronizados.
              </p>
            ) : (
              gruposSemelhantes.map((grupo, idx) => (
                <GrupoSemelhanteCard
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

function GrupoSemelhanteCard({
  empresaId,
  grupo,
}: {
  empresaId: string;
  grupo: GrupoCargoSemelhante;
}) {
  const [destinoId, setDestinoId] = useState(grupo.posicoes[0]?.id ?? "");
  const [nomeCustomizado, setNomeCustomizado] = useState(grupo.sugestaoNome);
  const [isPending, setIsPending] = useState(false);

  async function handleUnificarGrupo() {
    if (!destinoId) {
      toast.error("Selecione o cargo de destino.");
      return;
    }
    setIsPending(true);
    try {
      const todosIds = grupo.posicoes.map((p) => p.id);
      const res = await unificarGrupoPosicoes(empresaId, todosIds, destinoId, nomeCustomizado);
      if (res.ok) {
        toast.success(`Grupo unificado com sucesso para "${nomeCustomizado}"!`);
      } else {
        toast.error(res.error || "Erro ao unificar grupo.");
      }
    } catch {
      toast.error("Erro inesperado ao unificar grupo.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3.5 text-xs shadow-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-semibold text-foreground bg-card border-border">
            {grupo.posicoes.length} variações encontradas
          </Badge>
          <span className="text-muted-foreground font-medium">
            ({grupo.totalColaboradores} colaboradores afetados)
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-1.5 rounded-md bg-muted/40 p-2.5">
        {grupo.posicoes.map((p) => (
          <div key={p.id} className="flex items-center justify-between font-medium">
            <span className="flex items-center gap-1.5">
              <span>• {p.nome}</span>
              {p.id === destinoId && (
                <Badge variant="outline" className="text-[10px] text-success border-success bg-card">
                  Principal Escolhido
                </Badge>
              )}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {p.colaboradoresCount} colab(s)
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <Label className="text-[11px]">Cargo Principal (Receberá os dados)</Label>
          <Select value={destinoId} onValueChange={(v) => setDestinoId(v ?? "")}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {grupo.posicoes.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome} ({p.colaboradoresCount} colabs)
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
            placeholder="Ex: Vendedor(a)"
          />
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <Button
          size="sm"
          className="h-8 gap-1.5 bg-foreground hover:bg-foreground text-white text-xs"
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

function PosicaoForm({
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

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>

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
