"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Network,
  GitBranch,
  Pencil,
  Users,
  UserX,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArvoreVisual } from "./arvore-visual";
import { definirSupervisor } from "@/lib/actions/rh-colaboradores";
import { cn } from "@/lib/utils";

const classeSelect =
  "h-8 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

type Colaborador = {
  id: string;
  nome: string;
  supervisorId: string | null;
  setor: { nome: string };
  posicao: { nome: string };
};

type No = Colaborador & { filhos: No[] };

// Nomes chegam da importação em CAIXA ALTA; 176 linhas assim cansam a leitura.
// Só apresentação — o dado guardado não muda.
const CONECTIVOS = new Set(["da", "das", "de", "do", "dos", "e"]);
function nomeExibicao(nome: string): string {
  return nome
    .toLocaleLowerCase("pt-BR")
    .split(/\s+/)
    .filter(Boolean)
    .map((parte, i) =>
      i > 0 && CONECTIVOS.has(parte)
        ? parte
        : parte.charAt(0).toLocaleUpperCase("pt-BR") + parte.slice(1)
    )
    .join(" ");
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.charAt(0) ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1].charAt(0) : "";
  return (primeira + ultima).toLocaleUpperCase("pt-BR");
}

function contaSubordinados(no: No): number {
  return no.filhos.reduce((total, filho) => total + 1 + contaSubordinados(filho), 0);
}

function combina(no: No, termo: string): boolean {
  if (!termo) return true;
  if (no.nome.toLowerCase().includes(termo)) return true;
  return no.filhos.some((f) => combina(f, termo));
}

export function OrganogramaView({ empresaId, colaboradores }: { empresaId: string; colaboradores: Colaborador[] }) {
  const [busca, setBusca] = useState("");

  const { arvores, orfaos, gruposSemLider, naEstrutura } = useMemo(() => {
    const porId = new Map(colaboradores.map((c) => [c.id, { ...c, filhos: [] as No[] }]));

    // Líder que saiu da empresa ou está inativo não existe mais no mapa — a
    // pessoa vira raiz temporária em vez de simplesmente sumir da árvore.
    const raizes: No[] = [];
    const orfaosLocal: No[] = [];
    for (const no of porId.values()) {
      if (!no.supervisorId) {
        raizes.push(no);
      } else {
        const lider = porId.get(no.supervisorId);
        if (lider) lider.filhos.push(no);
        else orfaosLocal.push(no);
      }
    }

    const ordenar = (nos: No[]) => {
      nos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      nos.forEach((n) => ordenar(n.filhos));
    };
    ordenar(raizes);
    ordenar(orfaosLocal);

    // Quem lidera alguém forma a estrutura; quem está sozinho ainda é trabalho
    // a fazer. Misturar os dois era o que fazia a tela virar uma lista plana
    // de 170 nomes sem hierarquia nenhuma.
    const arvoresLocal = raizes.filter((r) => r.filhos.length > 0);
    arvoresLocal.sort(
      (a, b) => contaSubordinados(b) - contaSubordinados(a) || a.nome.localeCompare(b.nome, "pt-BR")
    );
    const semLider = raizes.filter((r) => r.filhos.length === 0);

    const porSetor = new Map<string, No[]>();
    for (const pessoa of semLider) {
      const lista = porSetor.get(pessoa.setor.nome) ?? [];
      lista.push(pessoa);
      porSetor.set(pessoa.setor.nome, lista);
    }
    const grupos = [...porSetor.entries()]
      .map(([setor, pessoas]) => ({ setor, pessoas }))
      .sort((a, b) => b.pessoas.length - a.pessoas.length || a.setor.localeCompare(b.setor, "pt-BR"));

    const naEstruturaLocal = arvoresLocal.reduce((s, a) => s + 1 + contaSubordinados(a), 0);

    return { arvores: arvoresLocal, orfaos: orfaosLocal, gruposSemLider: grupos, naEstrutura: naEstruturaLocal };
  }, [colaboradores]);

  const termo = busca.trim().toLowerCase();
  const arvoresVisiveis = arvores.filter((a) => combina(a, termo));
  const orfaosVisiveis = orfaos.filter((o) => combina(o, termo));
  const gruposVisiveis = gruposSemLider
    .map((g) => ({
      ...g,
      pessoas: termo ? g.pessoas.filter((p) => p.nome.toLowerCase().includes(termo)) : g.pessoas,
    }))
    .filter((g) => g.pessoas.length > 0);
  const totalSemLider = gruposSemLider.reduce((s, g) => s + g.pessoas.length, 0);
  const pct =
    colaboradores.length > 0 ? Math.round((naEstrutura / colaboradores.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Organograma</h2>
        <p className="text-sm text-muted-foreground">
          Montado a partir de quem reporta a quem — atualiza sozinho quando uma movimentação troca
          o líder de alguém.
        </p>
      </div>

      {colaboradores.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum colaborador ativo nesta empresa.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
              <span className="flex items-center gap-1.5">
                <Users className="size-4 text-muted-foreground" />
                <span className="font-semibold">{colaboradores.length}</span>
                <span className="text-muted-foreground">ativos</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Network className="size-4 text-muted-foreground" />
                <span className="font-semibold">{naEstrutura}</span>
                <span className="text-muted-foreground">na estrutura</span>
              </span>
              <span className="flex items-center gap-1.5">
                <UserX className="size-4 text-muted-foreground" />
                <span className="font-semibold">{totalSemLider}</span>
                <span className="text-muted-foreground">sem líder</span>
              </span>
              {orfaos.length > 0 && (
                <span className="flex items-center gap-1.5 text-destructive">
                  <AlertTriangle className="size-4" />
                  <span className="font-semibold">{orfaos.length}</span>
                  <span>com líder inativo</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 sm:w-48">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="whitespace-nowrap text-xs text-muted-foreground">{pct}% mapeado</span>
            </div>
          </div>

          <Tabs defaultValue="estrutura" className="space-y-4">
            <TabsList>
              <TabsTrigger value="estrutura">
                <Network className="size-4" /> Estrutura
              </TabsTrigger>
              <TabsTrigger value="arvore">
                <GitBranch className="size-4" /> Árvore
              </TabsTrigger>
            </TabsList>

            {/* Desenho de cima para baixo: para ler e apresentar. Não repete os
                controles de edição — quem monta a hierarquia usa a Estrutura. */}
            <TabsContent value="arvore">
              <ArvoreVisual empresaId={empresaId} arvores={arvores} />
            </TabsContent>

            <TabsContent value="estrutura" className="space-y-4">
          <Input
            placeholder="Buscar por nome..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="max-w-sm"
          />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="size-4" />
                Estrutura de liderança
              </CardTitle>
              <CardDescription>
                Times formados por quem tem líder definido — os maiores primeiro. A seta abre e
                recolhe cada time.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {arvores.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <Network className="size-8 text-muted-foreground/50" />
                  <p className="text-sm font-medium">Nenhuma relação de liderança ainda</p>
                  <p className="max-w-md text-sm text-muted-foreground">
                    Use &quot;Definir líder&quot; na lista abaixo — cada pessoa com líder definido
                    entra aqui automaticamente.
                  </p>
                </div>
              ) : arvoresVisiveis.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum nome encontrado na estrutura.
                </p>
              ) : (
                <div className="space-y-1">
                  {arvoresVisiveis.map((no) => (
                    <Nodo
                      key={no.id}
                      empresaId={empresaId}
                      no={no}
                      nivel={0}
                      termo={termo}
                      todos={colaboradores}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {orfaosVisiveis.length > 0 && (
            <Card className="border-destructive/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="size-4" />
                  Líder inativo
                </CardTitle>
                <CardDescription>
                  Estas pessoas reportam a alguém que saiu ou foi desativado — defina um novo líder
                  para voltarem à estrutura.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {orfaosVisiveis.map((no) => (
                    <Nodo
                      key={no.id}
                      empresaId={empresaId}
                      no={no}
                      nivel={0}
                      termo={termo}
                      todos={colaboradores}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserX className="size-4" />
                Sem líder definido
                <Badge variant="secondary">
                  {gruposVisiveis.reduce((s, g) => s + g.pessoas.length, 0)}
                </Badge>
              </CardTitle>
              <CardDescription>
                Agrupado por setor. Ao definir o líder, a pessoa sobe para a estrutura acima.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {gruposVisiveis.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {termo ? "Nenhum nome encontrado." : "Todo mundo tem líder definido."}
                </p>
              ) : (
                gruposVisiveis.map((g) => (
                  <GrupoSetor
                    key={g.setor}
                    empresaId={empresaId}
                    setor={g.setor}
                    pessoas={g.pessoas}
                    termo={termo}
                    todos={colaboradores}
                  />
                ))
              )}
            </CardContent>
          </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function Nodo({
  empresaId,
  no,
  nivel,
  termo,
  todos,
}: {
  empresaId: string;
  no: No;
  nivel: number;
  termo: string;
  todos: Colaborador[];
}) {
  const [aberto, setAberto] = useState(nivel < 2);
  const [editando, setEditando] = useState(false);
  if (!combina(no, termo)) return null;

  const subordinados = contaSubordinados(no);
  const bateNoNome = termo.length > 0 && no.nome.toLowerCase().includes(termo);
  // Busca ativa força tudo aberto: o resultado pode estar em qualquer nível.
  const abertoEfetivo = aberto || termo.length > 0;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-muted/50",
          bateNoNome && "bg-primary/5"
        )}
      >
        {no.filhos.length > 0 ? (
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
            aria-label={abertoEfetivo ? "Recolher" : "Expandir"}
          >
            {abertoEfetivo ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
        ) : (
          <span className="inline-block w-[18px] shrink-0" />
        )}
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
          {iniciais(no.nome)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <Link
              href={`/rh/${empresaId}/colaboradores/${no.id}?tab=ferias`}
              className="truncate text-sm font-medium hover:underline"
            >
              {nomeExibicao(no.nome)}
            </Link>
            {subordinados > 0 && (
              <Badge variant="secondary" className="gap-1 px-1.5">
                <Users className="size-3" />
                {subordinados}
              </Badge>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {no.posicao.nome} · {no.setor.nome}
          </p>
        </div>
        {!editando && (
          // Sempre visível, não só no hover: é o campo que a tela inteira
          // existe para preencher, e escondido atrás de hover foi exatamente
          // o motivo de não ser achado da primeira vez.
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            title={no.supervisorId ? "Trocar líder" : "Definir líder"}
          >
            <Pencil className="size-3" />
            {!no.supervisorId && "Definir líder"}
          </button>
        )}
      </div>
      {editando && (
        <div className="py-1 pl-12">
          <EditorDeLider empresaId={empresaId} no={no} todos={todos} onFechar={() => setEditando(false)} />
        </div>
      )}
      {abertoEfetivo && no.filhos.length > 0 && (
        <div className="ml-[15px] border-l border-border pl-2.5">
          {no.filhos.map((filho) => (
            <Nodo
              key={filho.id}
              empresaId={empresaId}
              no={filho}
              nivel={nivel + 1}
              termo={termo}
              todos={todos}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GrupoSetor({
  empresaId,
  setor,
  pessoas,
  termo,
  todos,
}: {
  empresaId: string;
  setor: string;
  pessoas: No[];
  termo: string;
  todos: Colaborador[];
}) {
  const [aberto, setAberto] = useState(true);
  const abertoEfetivo = aberto || termo.length > 0;

  return (
    <div className="overflow-hidden rounded-lg border">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center gap-2 bg-muted/40 px-3 py-2 text-left hover:bg-muted/70"
      >
        {abertoEfetivo ? (
          <ChevronDown className="size-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3.5 text-muted-foreground" />
        )}
        <span className="text-sm font-medium">{setor}</span>
        <Badge variant="secondary">{pessoas.length}</Badge>
      </button>
      {abertoEfetivo && (
        <div className="grid gap-x-4 border-t p-2 md:grid-cols-2">
          {pessoas.map((pessoa) => (
            <PessoaSemLider key={pessoa.id} empresaId={empresaId} pessoa={pessoa} todos={todos} />
          ))}
        </div>
      )}
    </div>
  );
}

function PessoaSemLider({
  empresaId,
  pessoa,
  todos,
}: {
  empresaId: string;
  pessoa: No;
  todos: Colaborador[];
}) {
  const [editando, setEditando] = useState(false);

  return (
    <div className="rounded-md px-2 py-1.5 hover:bg-muted/50">
      <div className="flex items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
          {iniciais(pessoa.nome)}
        </span>
        <div className="min-w-0 flex-1">
          <Link
            href={`/rh/${empresaId}/colaboradores/${pessoa.id}?tab=ferias`}
            className="block truncate text-sm font-medium hover:underline"
          >
            {nomeExibicao(pessoa.nome)}
          </Link>
          <p className="truncate text-xs text-muted-foreground">{pessoa.posicao.nome}</p>
        </div>
        {!editando && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 shrink-0 gap-1 px-2 text-xs"
            onClick={() => setEditando(true)}
          >
            <Pencil className="size-3" />
            Definir líder
          </Button>
        )}
      </div>
      {editando && (
        <div className="pb-1 pl-9 pt-1">
          <EditorDeLider
            empresaId={empresaId}
            no={pessoa}
            todos={todos}
            onFechar={() => setEditando(false)}
          />
        </div>
      )}
    </div>
  );
}

/** Todo mundo que `no` já lidera, direta ou indiretamente — não pode virar líder DELE. */
function idsDescendentes(no: No): Set<string> {
  const ids = new Set<string>();
  const empilhar = (n: No) => {
    for (const filho of n.filhos) {
      ids.add(filho.id);
      empilhar(filho);
    }
  };
  empilhar(no);
  return ids;
}

function EditorDeLider({
  empresaId,
  no,
  todos,
  onFechar,
}: {
  empresaId: string;
  no: No;
  todos: Colaborador[];
  onFechar: () => void;
}) {
  const [supervisorId, setSupervisorId] = useState(no.supervisorId ?? "");
  const [salvando, setSalvando] = useState(false);

  // Nem a própria pessoa, nem quem ela já lidera (ciclo óbvio) — o servidor
  // confere o resto (ciclo mais longo, líder de outra empresa).
  const bloqueados = useMemo(() => new Set([no.id, ...idsDescendentes(no)]), [no]);
  const opcoes = todos
    .filter((c) => !bloqueados.has(c.id))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  async function salvar() {
    setSalvando(true);
    try {
      const result = await definirSupervisor(empresaId, no.id, supervisorId || null);
      if (result.ok) {
        toast.success(supervisorId ? "Líder definido." : "Líder removido.");
        onFechar();
      } else {
        toast.error(result.error);
      }
    } catch {
      // Sem isto, um erro de rede ou uma exceção não tratada no servidor
      // fechava o clique em silêncio: nem sucesso nem mensagem, e quem clicou
      // não tinha como saber se precisava tentar de novo.
      toast.error("Não foi possível salvar — verifique a conexão e tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 py-1">
      <select
        value={supervisorId}
        onChange={(e) => setSupervisorId(e.target.value)}
        className={cn(classeSelect, "max-w-64")}
      >
        <option value="">Sem líder</option>
        {opcoes.map((c) => (
          <option key={c.id} value={c.id}>
            {nomeExibicao(c.nome)}
          </option>
        ))}
      </select>
      <Button type="button" size="sm" disabled={salvando} onClick={salvar}>
        {salvando ? "Salvando..." : "Salvar"}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onFechar}>
        Cancelar
      </Button>
    </div>
  );
}
