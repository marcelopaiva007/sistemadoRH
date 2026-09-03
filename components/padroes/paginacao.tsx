"use client";

import { cn } from "@/lib/utils";

const SETA =
  "flex size-[30px] shrink-0 items-center justify-center border border-input text-[13px] tabular-nums transition-colors hover:bg-foreground/7 disabled:pointer-events-none disabled:opacity-40";

/**
 * Paginação das listas: botões quadrados de 30px, a página atual em tinta
 * cheia. Sem raio e sem sombra, como o resto do Modernist.
 *
 * Mostra no máximo 7 números, com reticências nas pontas — 15 páginas viravam
 * 15 botões e a barra passava a rolar.
 */
export function Paginacao({
  pagina,
  totalPaginas,
  aoIr,
  resumo,
}: {
  pagina: number;
  totalPaginas: number;
  aoIr: (p: number) => void;
  /** "1–10 de 148", à esquerda. */
  resumo?: string;
}) {
  if (totalPaginas <= 1) return !resumo ? null : (
    <p className="text-[13px] tabular-nums text-muted-foreground">{resumo}</p>
  );

  const numeros: (number | "...")[] = [];
  const perto = (n: number) => Math.abs(n - pagina) <= 1;
  for (let n = 1; n <= totalPaginas; n++) {
    if (n === 1 || n === totalPaginas || perto(n)) numeros.push(n);
    else if (numeros[numeros.length - 1] !== "...") numeros.push("...");
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {resumo && <p className="text-[13px] tabular-nums text-muted-foreground">{resumo}</p>}
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={() => aoIr(pagina - 1)}
          disabled={pagina <= 1}
          aria-label="Página anterior"
          className={SETA}
        >
          ‹
        </button>
        {numeros.map((n, i) =>
          n === "..." ? (
            <span key={`e${i}`} className="px-1 text-[13px] text-muted-foreground">
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => aoIr(n)}
              aria-current={n === pagina ? "page" : undefined}
              className={cn(
                "flex size-[30px] shrink-0 items-center justify-center border text-[13px] tabular-nums transition-colors",
                n === pagina
                  ? "border-foreground bg-foreground font-extrabold text-background"
                  : "border-input hover:bg-foreground/7",
              )}
            >
              {n}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => aoIr(pagina + 1)}
          disabled={pagina >= totalPaginas}
          aria-label="Próxima página"
          className={SETA}
        >
          ›
        </button>
      </div>
    </div>
  );
}
