"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function RHEmpresaNav({ empresaId }: { empresaId: string }) {
  const pathname = usePathname();
  const items = [
    { href: `/rh/${empresaId}/dashboard`, label: "Dashboard" },
    { href: `/rh/${empresaId}/indicadores`, label: "Indicadores" },
    { href: `/rh/${empresaId}/colaboradores`, label: "Colaboradores" },
    { href: `/rh/${empresaId}/organograma`, label: "Organograma" },
    { href: `/rh/${empresaId}/aprovacoes`, label: "Aprovações" },
    { href: `/rh/${empresaId}/vencimentos`, label: "Vencimentos" },
    { href: `/rh/${empresaId}/conformidade`, label: "Conformidade" },
    { href: `/rh/${empresaId}/acidentes`, label: "Acidentes" },
    { href: `/rh/${empresaId}/escalas`, label: "Escalas" },
    { href: `/rh/${empresaId}/avaliacoes`, label: "Avaliações" },
    { href: `/rh/${empresaId}/metas`, label: "Metas" },
    { href: `/rh/${empresaId}/treinamentos`, label: "Treinamentos" },
    { href: `/rh/${empresaId}/vagas`, label: "Vagas" },
    { href: `/rh/${empresaId}/beneficios`, label: "Benefícios" },
    { href: `/rh/${empresaId}/desligamentos`, label: "Desligamentos" },
    { href: `/rh/${empresaId}/reconhecimento`, label: "Reconhecimento" },
    { href: `/rh/${empresaId}/setores`, label: "Setores" },
    { href: `/rh/${empresaId}/posicoes`, label: "Posições" },
    { href: `/rh/${empresaId}/pesquisas`, label: "Pesquisas" },
    { href: `/rh/${empresaId}/relatorios`, label: "Relatórios" },
    { href: `/rh/${empresaId}/auditoria`, label: "Auditoria" },
  ];

  return (
    <nav className="flex flex-wrap gap-1 border-b">
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
