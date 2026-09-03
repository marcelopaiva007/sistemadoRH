"use client";

import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * A barra de filtros das telas de lista, sempre na MESMA ordem (handoff
 * Modernist): busca · recortes · estado · limpar · contagem à direita.
 *
 * A ordem é o ponto. Antes cada tela montava os controles na ordem em que
 * foram sendo pedidos, e quem trabalha em cinco telas por dia procurava o
 * campo de busca em cinco lugares diferentes.
 */
export function BarraDeFiltros({
  busca,
  recortes,
  estado,
  limpar,
  contagem,
  abaixo,
}: {
  busca?: { valor: string; aoMudar: (v: string) => void; placeholder?: string };
  /** Recortes (setor, CNPJ, cargo) — selects ou botões outline com chevron. */
  recortes?: ReactNode;
  /** Situação, como segmentado (ver `Segmentado`). */
  estado?: ReactNode;
  limpar?: ReactNode;
  /** "148 resultados", à direita. */
  contagem?: ReactNode;
  /** Linha de aviso sob a barra (ex.: "mais 3 fichas casam em desligados"). */
  abaixo?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {busca && (
          <div className="relative min-w-0 flex-1 sm:max-w-[360px]">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={busca.valor}
              onChange={(e) => busca.aoMudar(e.target.value)}
              placeholder={busca.placeholder ?? "Buscar"}
              className="pl-8"
            />
          </div>
        )}
        {recortes}
        {estado}
        {limpar}
        {contagem && (
          <span className="ml-auto shrink-0 text-[13px] tabular-nums text-muted-foreground">
            {contagem}
          </span>
        )}
      </div>
      {abaixo}
    </div>
  );
}

/** O `select` dos recortes, no traço da barra: 36px, borda, sem raio. */
export const CLASSE_RECORTE =
  "h-9 min-w-0 max-w-52 truncate border border-input bg-card px-2.5 text-[13px] outline-none transition-colors hover:border-foreground/45 focus-visible:border-primary";

/**
 * Controle segmentado para a coluna "estado" (Ativos · Inativos · Todos).
 * Um `ToggleGroup` estilizado seria a peça do shadcn, mas ela não está
 * instalada e este é o único uso — botões com `aria-pressed` fazem o mesmo com
 * menos superfície.
 */
export function Segmentado<T extends string>({
  valor,
  aoMudar,
  opcoes,
  rotulo,
}: {
  valor: T;
  aoMudar: (v: T) => void;
  opcoes: { valor: T; label: string }[];
  rotulo: string;
}) {
  return (
    <div role="group" aria-label={rotulo} className="flex h-9 shrink-0 items-stretch border border-input">
      {opcoes.map((o, i) => (
        <button
          key={o.valor}
          type="button"
          aria-pressed={valor === o.valor}
          onClick={() => aoMudar(o.valor)}
          className={cn(
            "px-3 text-[13px] whitespace-nowrap transition-colors",
            i > 0 && "border-l border-input",
            valor === o.valor
              ? "bg-primary font-extrabold text-primary-foreground"
              : "text-muted-foreground hover:bg-foreground/7 hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
