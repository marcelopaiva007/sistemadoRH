"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox, Send } from "lucide-react";
import { cn } from "@/lib/utils";

// Menu do módulo, no mesmo formato de app/(app)/processos/[empresaId]/processos-nav.tsx.
//
// Duas entradas, e é isso mesmo: o módulo responde a duas perguntas — "o que
// cobram de mim?" e "o que eu cobro dos outros?". O Painel da Direção entra no
// PR 6, junto com o classificador que o alimenta; a tela de detalhe e o
// formulário de nova demanda não são itens de menu (um é destino de clique, o
// outro é ação de dentro da tela de quem delega). Item que leva a página vazia
// é o começo do menu em que ninguém confia.
//
// Sem `empresaId`: este módulo não é escopado por CNPJ, então `base` é uma
// constante em vez de prop (ver components/modulos.ts, escopadoPorEmpresa).
const ITENS = [
  { slug: "", label: "Recebidas", icon: Inbox },
  { slug: "delegadas", label: "Delegadas por mim", icon: Send },
] as const;

const BASE = "/delegacoes";

export function DelegacoesNav() {
  const pathname = usePathname();

  // Mesma regra do módulo de Processos: o item ativo é o de prefixo MAIS
  // ESPECÍFICO, um só. Aqui os slugs não aninham, mas a raiz precisa de
  // igualdade exata — senão "Recebidas" acenderia em toda tela do módulo,
  // inclusive no detalhe de uma demanda delegada.
  const hrefs = ITENS.map((i) => (i.slug ? `${BASE}/${i.slug}` : BASE));
  const ativo = hrefs
    .filter((h) => (h === BASE ? pathname === BASE : pathname === h || pathname.startsWith(`${h}/`)))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <nav className="flex gap-1 md:flex-col md:gap-0.5">
      {ITENS.map((item) => {
        const href = item.slug ? `${BASE}/${item.slug}` : BASE;
        const esteAtivo = href === ativo;
        const Icon = item.icon;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
              esteAtivo
                ? "bg-primary/10 font-semibold text-primary dark:text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="whitespace-nowrap">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
