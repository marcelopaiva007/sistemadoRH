"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      // Repassado de verdade ao Base UI: sem isto ele segue "horizontal" por
      // dentro e a seta do teclado anda para os lados numa lista que está em
      // coluna (a sub-navegação da ficha).
      orientation={orientation}
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

// O que a variante `line` acrescenta mora AQUI, como classe simples, e não como
// `data-[variant=line]:...` na base. Motivo: o seletor de atributo pesa mais que
// uma classe solta, então `data-[variant=line]:w-full` VENCIA o `w-[200px]` que
// a tela passava — e o tailwind-merge não tem como reconciliar prefixos
// diferentes. Foi assim que a sub-navegação da ficha do colaborador esticou para
// a largura toda e empurrou o conteúdo para fora da tela (v1.168.1). Como classe
// simples, quem usa o componente sobrescreve normalmente.
const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center text-muted-foreground group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col group-data-horizontal/tabs:h-9",
  {
    variants: {
      variant: {
        default: "gap-4 bg-transparent",
        line: "w-full justify-start border-b-2 border-border gap-4 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative -mb-0.5 inline-flex h-full items-center justify-center gap-1.5 border-b-2 border-transparent px-0.5 text-sm font-semibold whitespace-nowrap text-muted-foreground transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "data-active:border-primary data-active:font-extrabold data-active:text-primary",
        // Modernist (v1.156.0): as duas variantes são a MESMA aba sublinhada —
        // a pílula da variante `default` saiu. Onde havia mais de 6 abas, o
        // desenho pede sub-navegação lateral (FichaComSubNav), não mais abas.
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn(
        "flex-1 text-sm outline-none data-ending-style:hidden",
        className
      )}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
