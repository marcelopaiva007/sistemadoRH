import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * O cabeçalho de toda tela do sistema (arquétipo do handoff Modernist).
 *
 * Substitui os ~70 blocos `<h2 className="text-xl font-semibold">` + `<p
 * className="text-sm text-muted-foreground">` espalhados, que divergiam em
 * tamanho, peso e espaçamento de tela para tela.
 *
 * A regra do desenho: título de página, UMA frase com o número que importa, e
 * as ações à direita — nunca dois títulos na mesma tela. A régua de 2px
 * embaixo é o que separa o cabeçalho do conteúdo; nada de cartão em volta.
 */
export function CabecalhoDePagina({
  titulo,
  resumo,
  acoes,
  className,
}: {
  titulo: ReactNode;
  /** Uma frase — de preferência com o número que a tela responde. */
  resumo?: ReactNode;
  acoes?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b-2 border-border pb-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h1>{titulo}</h1>
        {resumo && <p className="mt-1 text-sm text-muted-foreground">{resumo}</p>}
      </div>
      {acoes && <div className="flex shrink-0 flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}
