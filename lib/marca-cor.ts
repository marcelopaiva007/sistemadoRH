import type { CSSProperties } from "react";

/**
 * Branco em cima da cor da marca, ou quase-preto se a cor for clara demais
 * pro branco ler bem (luminância relativa > 0.6, limiar comum de contraste).
 * Sem isto, uma marca escolhendo amarelo ou branco deixaria o texto dos
 * botões ilegível — validado só na hora de aplicar, não impede o cadastro.
 */
export function corDeContraste(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const luminancia = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminancia > 0.6 ? "#0a0a0a" : "#ffffff";
}

/**
 * O `style` que pinta um subtree inteiro na cor da marca — `--primary` e o seu
 * contraste. Sem `corPrimaria` cadastrada devolve `undefined`, e o subtree fica
 * no azul padrão do tema.
 *
 * Mora aqui, e não dentro de um layout, porque a regra passou a ter dois donos
 * em 23/08/2026: o layout do RH (`app/(app)/rh/[empresaId]/layout.tsx`) e o do
 * módulo Processos & Ativos. Duas cópias da mesma conta de contraste é como o
 * limiar de luminância acaba diferente nos dois módulos e a mesma marca fica
 * com botão legível num e ilegível no outro.
 */
export function corDeContrasteDaMarca(corPrimaria: string | null | undefined): CSSProperties | undefined {
  if (!corPrimaria) return undefined;
  return {
    "--primary": corPrimaria,
    "--primary-foreground": corDeContraste(corPrimaria),
  } as CSSProperties;
}
