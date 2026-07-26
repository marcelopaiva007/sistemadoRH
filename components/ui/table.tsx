"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Dica visual de que a tabela rola na horizontal.
 *
 * O contêiner já rolava — mas sem sinal nenhum, uma coluna cortada na borda
 * parece defeito de layout, não conteúdo a alcançar. (A auditoria de design
 * chegou a registrar isso como bug antes de conferir o código.)
 *
 * Feito só com CSS, sem JavaScript e sem medir posição de rolagem:
 * `background-attachment: local` desenha a sombra colada ao CONTEÚDO, e
 * `scroll` a desenha colada à MOLDURA. Sobrepondo as duas, a sombra some
 * sozinha na extremidade em que não há mais o que rolar. Custo zero de
 * runtime, e vale para toda tabela do sistema de uma vez.
 */
// Escrito como propriedades arbitrárias inteiras: valor arbitrário do
// Tailwind não pode conter espaço — quebrar isso em partes gera
// `background-image: none` silenciosamente (foi o que aconteceu na primeira
// tentativa, pego conferindo o CSS do build).
const SOMBRA_DE_ROLAGEM = cn(
  "[background-image:linear-gradient(to_right,var(--card),transparent),linear-gradient(to_left,var(--card),transparent),linear-gradient(to_right,rgba(15,23,42,0.13),transparent),linear-gradient(to_left,rgba(15,23,42,0.13),transparent)]",
  "[background-size:28px_100%,28px_100%,12px_100%,12px_100%]",
  "[background-position:left_center,right_center,left_center,right_center]",
  "[background-repeat:no-repeat]",
  "[background-attachment:local,local,scroll,scroll]",
)

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className={cn("relative w-full overflow-x-auto", SOMBRA_DE_ROLAGEM)}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
