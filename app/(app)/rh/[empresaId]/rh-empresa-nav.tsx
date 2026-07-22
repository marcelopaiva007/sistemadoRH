"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function RHEmpresaNav({ empresaId }: { empresaId: string }) {
  const pathname = usePathname();
  const items = [
    { href: `/rh/${empresaId}/setores`, label: "Setores" },
    { href: `/rh/${empresaId}/posicoes`, label: "Posições" },
    { href: `/rh/${empresaId}/colaboradores`, label: "Colaboradores" },
    { href: `/rh/${empresaId}/pesquisas`, label: "Pesquisas" },
  ];

  return (
    <nav className="flex gap-1 border-b">
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
