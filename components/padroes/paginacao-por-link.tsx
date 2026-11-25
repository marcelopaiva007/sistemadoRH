import Link from "next/link";
import { cn } from "@/lib/utils";
import { hrefComPagina, numerosDaPaginacao } from "@/lib/paginacao-servidor";

const QUADRADO =
  "flex size-[30px] shrink-0 items-center justify-center border text-[13px] tabular-nums transition-colors";

/**
 * Paginação por LINK (26/11/2026), para as listas paginadas no servidor: cada
 * número é um <Link> para `?pagina=N` mantendo os demais filtros da URL. Mesmo
 * visual de components/padroes/paginacao.tsx (botões de 30px, atual em tinta
 * cheia, reticências nas pontas), mas sem estado no navegador — a página é a
 * URL, então dá para compartilhar o endereço e o "voltar" do navegador volta.
 */
export function PaginacaoPorLink({
  pagina,
  totalPaginas,
  params,
  resumo,
}: {
  pagina: number;
  totalPaginas: number;
  /** Os filtros atuais da URL — entram em todo link, menos `pagina`. */
  params: Record<string, string | undefined | null>;
  /** "1–50 de 148", à esquerda. */
  resumo?: string;
}) {
  if (totalPaginas <= 1)
    return resumo ? <p className="text-[13px] tabular-nums text-muted-foreground">{resumo}</p> : null;

  const seta = (alvo: number, rotulo: string, simbolo: string) =>
    alvo < 1 || alvo > totalPaginas ? (
      <span aria-hidden className={cn(QUADRADO, "border-input opacity-40")}>
        {simbolo}
      </span>
    ) : (
      <Link href={hrefComPagina(params, alvo)} aria-label={rotulo} className={cn(QUADRADO, "border-input hover:bg-foreground/7")}>
        {simbolo}
      </Link>
    );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {resumo && <p className="text-[13px] tabular-nums text-muted-foreground">{resumo}</p>}
      <nav aria-label="Paginação" className="ml-auto flex items-center gap-1">
        {seta(pagina - 1, "Página anterior", "‹")}
        {numerosDaPaginacao(pagina, totalPaginas).map((n, i) =>
          n === "..." ? (
            <span key={`e${i}`} className="px-1 text-[13px] text-muted-foreground">
              …
            </span>
          ) : (
            <Link
              key={n}
              href={hrefComPagina(params, n)}
              aria-current={n === pagina ? "page" : undefined}
              className={cn(
                QUADRADO,
                n === pagina
                  ? "border-foreground bg-foreground font-extrabold text-background"
                  : "border-input hover:bg-foreground/7",
              )}
            >
              {n}
            </Link>
          ),
        )}
        {seta(pagina + 1, "Próxima página", "›")}
      </nav>
    </div>
  );
}
