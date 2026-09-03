"use client";

import Link from "next/link";
import { AlertTriangle, CalendarClock, ClipboardList } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Card, CardContent } from "@/components/ui/card";

/**
 * O indicador "Pendências" do topo da tela do grupo.
 *
 * Antes linkava direto para a primeira empresa com pendência — quando havia
 * mais de uma (o caso comum), as outras duas ficavam escondidas atrás de um
 * clique que não avisava que só mostrava um terço do número. Aqui o clique
 * abre a lista das empresas com pendência, cada uma já com o link para a
 * tela de resolução — a pessoa vê o total quebrado por empresa antes de
 * escolher onde entrar, em vez de cair em uma ao acaso.
 */
export function PendenciasIndicador({
  rotulo = "Pendências",
  total,
  itens,
  destaque = false,
  neutro = false,
}: {
  /** O que este grupo de pendências pede de quem lê. */
  rotulo?: string;
  total: number;
  itens: { nome: string; pend: number; href: string }[];
  /** Fila do dia (gente esperando): número maior e moldura marcada. */
  destaque?: boolean;
  /** Sem data fatal: número em cor normal, para não competir com o que urge. */
  neutro?: boolean;
}) {
  // A cor é o que separa "resolva agora" de "está no radar". Vermelho só onde
  // há alguém esperando; o grupo de cadastro fica em cor de texto comum mesmo
  // com número alto — foi o caso dos "163 cadastros incompletos" de
  // 12/08/2026, que em vermelho parecia incêndio e não era.
  const corDoNumero = total === 0 ? "" : neutro ? "" : destaque ? "text-destructive" : "text-muted-foreground";

  const cartao = (
    <Card
      size="sm"
      className={[
        "h-full",
        itens.length > 0 ? "cursor-pointer transition-colors hover:bg-accent/40" : "",
        destaque && total > 0 ? "border-destructive/40 bg-destructive/5" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <CardContent>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {destaque ? (
            <AlertTriangle aria-hidden className="size-4" />
          ) : neutro ? (
            <ClipboardList aria-hidden className="size-4" />
          ) : (
            <CalendarClock aria-hidden className="size-4" />
          )}
          {rotulo}
        </div>
        <p
          className={`font-semibold tabular-nums ${destaque ? "text-4xl" : "text-2xl"} ${corDoNumero}`}
        >
          {total}
        </p>
      </CardContent>
    </Card>
  );

  // Nada pendente: nem vale abrir um popover vazio. Idem quando ESTE grupo
  // está zerado — o popover lista as empresas pelo TOTAL, e abri-lo num grupo
  // vazio mostraria números que não são deste cartão.
  if (itens.length === 0 || total === 0) return cartao;

  return (
    <Popover>
      <PopoverTrigger className="block w-full text-left">{cartao}</PopoverTrigger>
      <PopoverContent align="start">
        <PopoverHeader>
          <PopoverTitle>Pendências por empresa</PopoverTitle>
          <PopoverDescription>Escolha uma para abrir a tela de resolução.</PopoverDescription>
        </PopoverHeader>
        <div className="flex flex-col gap-0.5">
          {itens.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent"
            >
              <span>{item.nome}</span>
              <span className="font-medium tabular-nums text-destructive">{item.pend}</span>
            </Link>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
