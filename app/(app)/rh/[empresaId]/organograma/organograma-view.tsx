"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
                <Nodo key={no.id} empresaId={empresaId} no={no} nivel={0} termo={termo} />
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

function Nodo({ empresaId, no, nivel, termo }: { empresaId: string; no: No; nivel: number; termo: string }) {
  const [aberto, setAberto] = useState(nivel < 1 || termo.length > 0);
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
      </div>
      {aberto &&
        no.filhos.map((filho) => (
          <Nodo key={filho.id} empresaId={empresaId} no={filho} nivel={nivel + 1} termo={termo} />
        ))}
    </div>
  );
}
