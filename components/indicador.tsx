import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * O bloco de número que aparece no topo de quase toda tela do sistema.
 *
 * Estava reimplementado à mão em 13 arquivos, com quatro nomes diferentes e
 * assinaturas que divergiam; virou uma peça só.
 *
 * Modernist (v1.156.0): a moldura SAIU — as duas variantes ("plano", com anel,
 * e "cartao", com Card e sombra) eram duas maneiras de desenhar uma caixa em
 * volta de um número que já é o maior elemento da tela. Agora é rótulo em
 * caixa alta de 10,5px, número de 36px peso 800 tabular, e o complemento
 * embaixo. Quem separa um do outro é a `FaixaDeIndicadores`
 * (components/padroes/faixa-de-indicadores.tsx), com régua, não borda.
 *
 * `estado` é um valor único de propósito — substituiu os booleanos
 * `alerta`/`atencao`, que aceitavam os dois ao mesmo tempo e resolviam o
 * empate por precedência silenciosa. `"alerta"` pinta o número de vermelho,
 * reservado para o que exige ação (CAT sem emitir, EPI vencido) — nunca para
 * destacar número grande. Fora do `"padrao"` o número ganha um triângulo e um
 * texto de leitor de tela: cor sozinha não comunica estado (WCAG 1.4.1).
 *
 * `"atencao"` era âmbar. O Modernist é mono: aviso é o mesmo tom do texto
 * secundário mais o triângulo — o único vermelho da tela é o que exige ação.
 */
export function Indicador({
  rotulo,
  valor,
  complemento,
  icone,
  estado = "padrao",
  variante,
  className,
}: {
  rotulo: string;
  valor: ReactNode;
  /** Linha pequena abaixo do número — ex.: "de 208 fichas". */
  complemento?: ReactNode;
  /** Ícone decorativo ao lado do rótulo (escondido de leitor de tela). */
  icone?: ReactNode;
  /** "alerta" = exige ação (vermelho); "atencao" = vence em breve. */
  estado?: "padrao" | "atencao" | "alerta";
  /** @deprecated Sem efeito desde a v1.156.0 — não há mais moldura. */
  variante?: "plano" | "cartao";
  className?: string;
}) {
  void variante;
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[.08em] text-muted-foreground uppercase">
        {icone && (
          <span aria-hidden className="contents">
            {icone}
          </span>
        )}
        {rotulo}
      </div>
      <p
        className={cn(
          "mt-1.5 flex items-center gap-1.5 font-heading text-[36px] leading-none font-extrabold tabular-nums",
          estado === "alerta" && "text-primary",
        )}
      >
        <span className="truncate">{valor}</span>
        {estado !== "padrao" && (
          <>
            <TriangleAlert aria-hidden className="size-4 shrink-0" />
            <span className="sr-only">
              {estado === "alerta" ? "exige ação" : "requer atenção em breve"}
            </span>
          </>
        )}
      </p>
      {complemento && <p className="mt-1 text-[12.5px] text-muted-foreground">{complemento}</p>}
    </div>
  );
}
