import { cn } from "@/lib/utils";

/**
 * Identidade FASTMAI — a marca-produto do sistema (arte de referência:
 * `fastmai-logo-proposta.png`, aplicada por pedido do dono em 26/08/2026).
 *
 * O símbolo (três barras crescentes, inclinadas) é SVG redesenhado a partir
 * da arte, não um recorte do PNG: escala sem serrilhado e segue o tema por
 * `currentColor` — tinta no fundo claro, branco no escuro, sem precisar de
 * dois arquivos como a logo da L&M. No wordmark, "FAST" acompanha a cor do
 * texto e "MAI" fica no accent fixo da marca, que funciona sobre os dois
 * fundos.
 *
 * Esta é a marca do sistema em todo o chrome (topo, login, senhas, portal)
 * desde a v1.122.0 — "vai ficar só a logo do FASTMAI" (dono, 26/08/2026).
 * A logo da L&M (`components/logo.tsx`) segue apenas onde a marca exibida é
 * a da EMPREGADORA: carreiras e resposta por link externo.
 */
const ACCENT_FASTMAI = "#ec3013";

/** Só o símbolo — as três barras. Herda a cor do texto ao redor. */
export function FastmaiMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 96 96"
      aria-hidden
      className={cn("shrink-0", className)}
      fill="currentColor"
    >
      {/* skewX(-10) dá a inclinação itálica da arte; o translate devolve o
          desenho para dentro da viewBox depois do deslocamento do skew. */}
      <g transform="translate(10 0) skewX(-10)">
        <rect x="18" y="58" width="15" height="26" rx="7.5" />
        <rect x="42" y="38" width="15" height="46" rx="7.5" />
        <rect x="66" y="16" width="15" height="68" rx="7.5" />
      </g>
    </svg>
  );
}

/**
 * Símbolo + wordmark. O tamanho vem do `font-size` do contexto (ex.:
 * `className="text-xl"`) — símbolo e letras crescem juntos.
 */
export function FastmaiLogo({
  className,
  alt = "FASTMAI",
}: {
  className?: string;
  alt?: string;
}) {
  return (
    <span
      role="img"
      aria-label={alt}
      className={cn("inline-flex items-center gap-[0.4em] text-foreground", className)}
    >
      <FastmaiMark className="h-[1.05em] w-auto" />
      <span className="font-extrabold leading-none tracking-tight">
        FAST
        <span style={{ color: ACCENT_FASTMAI }}>MAI</span>
      </span>
    </span>
  );
}
