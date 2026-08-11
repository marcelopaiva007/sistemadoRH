"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Label({
  className,
  required,
  children,
  ...props
}: React.ComponentProps<"label"> & {
  /**
   * Marca o campo como obrigatório com o asterisco vermelho — a convenção que
   * o sistema já usava solta em responder-form.tsx e que agora tem um lugar só.
   *
   * É reforço VISUAL: quem anuncia a obrigatoriedade para leitor de tela é o
   * atributo `required` do próprio input (o projeto já o usa em 107 pontos),
   * por isso o asterisco fica `aria-hidden` — sem isso o leitor lê "asterisco"
   * no meio do rótulo, que não ajuda ninguém.
   */
  required?: boolean
}) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
      {/* -ml-1.5 anula quase todo o `gap-2` do label (que existe para ícones):
          asterisco solto a 8px do texto lê como outro elemento, não como marca
          do campo. */}
      {required && (
        <span aria-hidden="true" className="-ml-1.5 text-destructive">
          *
        </span>
      )}
    </label>
  )
}

export { Label }
