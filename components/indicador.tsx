import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

/**
 * O bloco de número que aparece no topo de quase toda tela do sistema.
 *
 * Estava reimplementado à mão em 13 arquivos, com quatro nomes diferentes
 * (`Indicador`, `Kpi`, `Numero`) e assinaturas que divergiam em detalhes —
 * uns aceitavam complemento, outros ícone, outros nada. Visualmente já eram
 * o mesmo bloco; a diferença era só o que cada tela precisou na hora.
 *
 * Aqui vira uma peça só. Ajustar respiro, tamanho do número ou cor de alerta
 * passa a ser uma linha, em vez de treze.
 *
 * `estado` é um valor único de propósito — substituiu os booleanos
 * `alerta`/`atencao`, que aceitavam os dois ao mesmo tempo e resolviam o
 * empate por precedência silenciosa. `"alerta"` pinta o número de vermelho,
 * reservado para o que exige ação (CAT sem emitir, EPI vencido) — nunca para
 * destacar número grande. `"atencao"` usa o âmbar de aviso, para o que vence
 * em breve. Fora do `"padrao"`, o número ganha um triângulo ao lado e um
 * texto só de leitor de tela: cor sozinha não comunica estado (WCAG 1.4.1)
 * nem chega a quem não distingue o vermelho do cinza.
 *
 * Sobre as duas variantes: a auditoria de design registrou os treze como
 * "visualmente idênticos", mas não eram — onze usavam um bloco plano com
 * anel, e dois (tela do grupo e Indicadores) usavam Card. Unificar a
 * APARÊNCIA seria decisão de design tomada no escuro; unificar o CÓDIGO não
 * é. Hoje o miolo (tipografia, estrutura, estados) é idêntico nas duas e a
 * diferença ficou só na moldura — anel plano vs Card `size="sm"`. Ficar com
 * uma só continua sendo escolha a fazer depois, olhando a tela. Nas duas o
 * fundo é `bg-card`; sobre um pai que já seja `bg-card`, quem delimita o
 * bloco é o anel/moldura — é ele que impede o bloco de sumir.
 */
export function Indicador({
  rotulo,
  valor,
  complemento,
  icone,
  estado = "padrao",
  variante = "plano",
  className,
}: {
  rotulo: string;
  valor: ReactNode;
  /** Linha pequena abaixo do número — ex.: "de 208 fichas". */
  complemento?: ReactNode;
  /** Ícone decorativo ao lado do rótulo (escondido de leitor de tela). */
  icone?: ReactNode;
  /** "alerta" = exige ação (vermelho); "atencao" = vence em breve (âmbar). */
  estado?: "padrao" | "atencao" | "alerta";
  /** "plano" = bloco com anel (padrão); "cartao" = Card com moldura de cartão. */
  variante?: "plano" | "cartao";
  className?: string;
}) {
  const conteudo = (
    <>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icone && (
          <span aria-hidden className="contents">
            {icone}
          </span>
        )}
        {rotulo}
      </div>
      <p
        className={cn(
          "flex items-center gap-1.5 text-2xl font-semibold tabular-nums",
          estado === "alerta" && "text-destructive",
          estado === "atencao" && "text-warning",
        )}
      >
        <span>{valor}</span>
        {estado !== "padrao" && (
          <>
            <TriangleAlert aria-hidden className="size-4 shrink-0" />
            <span className="sr-only">
              {estado === "alerta" ? "exige ação" : "requer atenção em breve"}
            </span>
          </>
        )}
      </p>
      {complemento && <p className="text-xs text-muted-foreground">{complemento}</p>}
    </>
  );

  if (variante === "cartao") {
    return (
      <Card size="sm" className={cn("transition-all hover:shadow-xs hover:border-primary/30", className)}>
        <CardContent>{conteudo}</CardContent>
      </Card>
    );
  }

  return (
    <div className={cn("rounded-xl bg-card px-4 py-3.5 border border-border/80 shadow-2xs hover:shadow-xs hover:border-primary/30 transition-all", className)}>
      {conteudo}
    </div>
  );
}
