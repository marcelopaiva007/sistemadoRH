import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A faixa de números do topo das telas (arquétipo D do handoff Modernist).
 *
 * Colunas iguais separadas por 1px e fechadas por uma régua de 2px — não são
 * cartões. O cartão com sombra que o `Indicador` usava competia com o dado:
 * quatro molduras desenhadas para destacar quatro números que já são o maior
 * elemento da tela.
 *
 * Envolve `Indicador` (components/indicador.tsx), que continua sendo a peça
 * de um número só e pode aparecer fora daqui.
 */
export function FaixaDeIndicadores({
  children,
  colunas = 4,
  className,
}: {
  children: ReactNode;
  colunas?: 2 | 3 | 4 | 5;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid border-b-2 border-border",
        colunas === 2 && "grid-cols-2",
        colunas === 3 && "grid-cols-2 sm:grid-cols-3",
        colunas === 4 && "grid-cols-2 lg:grid-cols-4",
        colunas === 5 && "grid-cols-2 lg:grid-cols-5",
        "[&>*]:border-border [&>*]:pr-4 [&>*]:pb-4 [&>*:not(:last-child)]:border-r [&>*:not(:last-child)]:mr-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
