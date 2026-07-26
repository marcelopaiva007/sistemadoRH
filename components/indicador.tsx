import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
 * `alerta` pinta o número de vermelho — reservado para o que exige ação
 * (CAT sem emitir, EPI vencido), nunca para destacar número grande.
 * `atencao` usa o âmbar de aviso, para o que vence em breve.
 *
 * Sobre as duas variantes: a auditoria de design registrou os treze como
 * "visualmente idênticos", mas não eram — onze usavam um bloco plano com
 * anel, e dois (tela do grupo e Indicadores) usavam Card, com borda e sombra.
 * Unificar a APARÊNCIA seria decisão de design tomada no escuro; unificar o
 * CÓDIGO não é. Então as duas formas convivem aqui, cada tela mantém o que
 * já tinha, e a escolha de ficar só com uma pode ser feita depois, de
 * propósito, olhando a tela.
 */
export function Indicador({
  rotulo,
  valor,
  complemento,
  icone,
  alerta,
  atencao,
  variante = "plano",
  className,
}: {
  rotulo: string;
  valor: ReactNode;
  /** Linha pequena abaixo do número — ex.: "de 208 fichas". */
  complemento?: ReactNode;
  /** Ícone ao lado do rótulo. */
  icone?: ReactNode;
  /** Exige ação: número em vermelho. */
  alerta?: boolean;
  /** Vence em breve: número em âmbar. */
  atencao?: boolean;
  /** "plano" = bloco com anel (padrão); "cartao" = Card com borda e sombra. */
  variante?: "plano" | "cartao";
  className?: string;
}) {
  const corDoNumero = cn(
    "tabular-nums",
    alerta && "text-destructive",
    !alerta && atencao && "text-warning",
  );

  if (variante === "cartao") {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
            {icone}
            {rotulo}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className={cn("text-2xl font-bold", corDoNumero)}>{valor}</p>
          {complemento && <p className="text-xs text-muted-foreground">{complemento}</p>}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn("rounded-lg bg-card px-4 py-3 ring-1 ring-foreground/10", className)}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icone}
        {rotulo}
      </div>
      <div className={cn("text-2xl font-semibold", corDoNumero)}>{valor}</div>
      {complemento && <div className="text-xs text-muted-foreground">{complemento}</div>}
    </div>
  );
}
