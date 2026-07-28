"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Pencil, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

export function OrganogramaView({ empresaId, colaboradores }: { empresaId: string; colaboradores: Colaborador[] }) {
  const [busca, setBusca] = useState("");

  const { raizes, orfaos, totalComLider } = useMemo(() => {
    const porId = new Map(colaboradores.map((c) => [c.id, { ...c, filhos: [] as No[] }]));

    // Líder que saiu da empresa ou está inativo não existe mais no mapa — a
    // pessoa vira raiz temporária em vez de simplesmente sumir da árvore.
    const raizesLocal: No[] = [];
    const orfaosLocal: No[] = [];
    for (const no of porId.values()) {
      if (!no.supervisorId) {
        raizesLocal.push(no);
      } else {
        const lider = porId.get(no.supervisorId);
        if (lider) lider.filhos.push(no);
        else orfaosLocal.push(no);
      }
    }

    const ordenar = (nos: No[]) => {
      nos.sort((a, b) => a.nome.localeCompare(b.nome));
      nos.forEach((n) => ordenar(n.filhos));
    };
    ordenar(raizesLocal);
    ordenar(orfaosLocal);

    return {
      raizes: raizesLocal,
      orfaos: orfaosLocal,
      totalComLider: colaboradores.filter((c) => c.supervisorId).length,
    };
  }, [colaboradores]);

  const termo = busca.trim().toLowerCase();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Organograma</h2>
        <p className="text-sm text-muted-foreground">
          Montado a partir de quem reporta a quem — some sozinho quando uma movimentação troca o
          líder de alguém. {colaboradores.length} colaborador(es) ativo(s), {totalComLider} com
          líder definido.
        </p>
      </div>

      <Input
        placeholder="Buscar por nome..."
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        className="max-w-sm"
      />

      <Card>
        <CardHeader>
          <CardTitle>Estrutura</CardTitle>
          {orfaos.length > 0 && (
            <CardDescription className="text-destructive">
              {orfaos.length} pessoa(s) reportam a um líder que não está mais ativo — aparecem soltas
              abaixo até serem realocadas.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {colaboradores.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum colaborador ativo nesta empresa.
            </p>
          ) : (
            <div className="space-y-0.5">
              {[...raizes, ...orfaos].map((no) => (
                <Nodo key={no.id} empresaId={empresaId} no={no} nivel={0} termo={termo} todos={colaboradores} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function contaSubordinados(no: No): number {
  return no.filhos.reduce((total, filho) => total + 1 + contaSubordinados(filho), 0);
}

function combina(no: No, termo: string): boolean {
  if (!termo) return true;
  if (no.nome.toLowerCase().includes(termo)) return true;
  return no.filhos.some((f) => combina(f, termo));
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
  const [aberto, setAberto] = useState(nivel < 1 || termo.length > 0);
  const [editando, setEditando] = useState(false);
  if (!combina(no, termo)) return null;

  const subordinados = contaSubordinados(no);
  const bateNoNome = termo && no.nome.toLowerCase().includes(termo);

  return (
    <div>
      <div
        className={cn("flex items-center gap-1.5 rounded-md py-1.5 pr-2 hover:bg-muted/50", bateNoNome && "bg-primary/5")}
        style={{ paddingLeft: `${nivel * 20 + 4}px` }}
      >
        {no.filhos.length > 0 ? (
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted"
            aria-label={aberto ? "Recolher" : "Expandir"}
          >
            {aberto ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
        ) : (
          <span className="inline-block size-4" />
        )}
        <Link href={`/rh/${empresaId}/colaboradores/${no.id}`} className="text-sm font-medium hover:underline">
          {no.nome}
        </Link>
        <span className="text-xs text-muted-foreground">
          {no.posicao.nome} · {no.setor.nome}
        </span>
        {subordinados > 0 && (
          <Badge variant="outline" className="ml-1 gap-1">
            <Users className="size-3" />
            {subordinados}
          </Badge>
        )}
        {!editando && (
          // Sempre visível, não só no hover: é o campo que a tela inteira
          // existe para preencher, e escondido atrás de hover foi exatamente
          // o motivo de não ser achado da primeira vez.
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Definir líder"
          >
            <Pencil className="size-3" />
            {!no.supervisorId && "Definir líder"}
          </button>
        )}
      </div>
      {editando && (
        <div style={{ paddingLeft: `${nivel * 20 + 24}px` }}>
          <EditorDeLider empresaId={empresaId} no={no} todos={todos} onFechar={() => setEditando(false)} />
        </div>
      )}
      {aberto &&
        no.filhos.map((filho) => (
          <Nodo key={filho.id} empresaId={empresaId} no={filho} nivel={nivel + 1} termo={termo} todos={todos} />
        ))}
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
  const opcoes = todos.filter((c) => !bloqueados.has(c.id)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

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
            {c.nome}
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
