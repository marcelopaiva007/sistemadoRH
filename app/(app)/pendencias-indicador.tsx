"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
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
  total,
  itens,
}: {
  total: number;
  itens: { nome: string; pend: number; href: string }[];
}) {
  const cartao = (
    <Card
      size="sm"
      className={
        itens.length > 0 ? "h-full cursor-pointer transition-colors hover:bg-accent/40" : "h-full"
      }
    >
      <CardContent>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <AlertTriangle aria-hidden className="size-4" />
          Pendências
        </div>
        <p className={`text-2xl font-semibold tabular-nums ${total > 0 ? "text-destructive" : ""}`}>
          {total}
        </p>
      </CardContent>
    </Card>
  );

  // Nada pendente: nem vale abrir um popover vazio.
  if (itens.length === 0) return cartao;

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
