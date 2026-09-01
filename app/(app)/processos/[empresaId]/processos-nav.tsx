"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BellRing, Building2, CalendarCheck, Car, CircleDollarSign, FileSignature, FileWarning, Fuel, IdCard, LayoutDashboard, PieChart, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

// Menu do módulo, no mesmo formato do RH (app/(app)/rh/[empresaId]/rh-empresa-nav.tsx).
//
// Só aparece o que EXISTE. Patrimônio, documentos e processos estão no roadmap
// e não estão aqui: item de menu que leva a página vazia é o começo clássico do
// fracasso de implantação de GED — promete estrutura antes de ter conteúdo, e o
// usuário aprende em uma semana que metade do menu não serve.
const GRUPOS = [
  {
    titulo: null,
    itens: [
      { slug: "", label: "Pendências", icon: BellRing },
      // A leitura de diretoria: números e gráficos, sem botão de ação — agir é
      // na Central. Mesma divisão que o RH faz entre Painel executivo e filas.
      { slug: "painel", label: "Painel", icon: LayoutDashboard },
    ],
  },
  {
    titulo: "Frota",
    itens: [
      { slug: "frota/panorama", label: "Panorama", icon: PieChart },
      { slug: "frota", label: "Veículos", icon: Car },
      { slug: "frota/financeiro", label: "Financeiro", icon: CircleDollarSign },
      { slug: "frota/emplacamento", label: "Emplacamento", icon: CalendarCheck },
      { slug: "frota/multas", label: "Multas", icon: FileWarning },
      { slug: "frota/condutores", label: "Condutores", icon: IdCard },
      { slug: "frota/consumo", label: "Consumo", icon: Fuel },
      { slug: "frota/manutencoes", label: "Manutenções", icon: Wrench },
      { slug: "frota/analise", label: "Análise", icon: BarChart3 },
    ],
  },
  {
    titulo: "Contratos",
    itens: [
      { slug: "contratos", label: "Contratos", icon: FileSignature },
      { slug: "contratos/contrapartes", label: "Contrapartes", icon: Building2 },
      { slug: "alugueis", label: "Aluguéis a receber", icon: CircleDollarSign },
    ],
  },
] as const;

export function ProcessosNav({ empresaId }: { empresaId: string }) {
  const pathname = usePathname();
  const base = `/processos/${empresaId}`;

  // O item ativo é o de prefixo MAIS ESPECÍFICO — um só, sempre. Com
  // startsWith puro, "Veículos" (slug `frota`) acendia junto com "Multas"
  // (`frota/multas`), porque um caminho é prefixo do outro. Os slugs do RH
  // nunca aninham, então lá o problema não existia; aqui existe.
  const hrefs = GRUPOS.flatMap((g) => g.itens.map((i) => (i.slug ? `${base}/${i.slug}` : base)));
  const ativo = hrefs
    .filter((h) => (h === base ? pathname === base : pathname === h || pathname.startsWith(`${h}/`)))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <nav className="flex gap-1 md:flex-col md:gap-0.5">
      {GRUPOS.map((grupo) => (
        <div key={grupo.titulo ?? "raiz"} className="flex gap-1 md:flex-col md:gap-0.5">
          {grupo.titulo && (
            <p className="hidden px-2 pt-4 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground/70 uppercase md:block">
              {grupo.titulo}
            </p>
          )}
          {grupo.itens.map((item) => {
            const href = item.slug ? `${base}/${item.slug}` : base;
            const esteAtivo = href === ativo;
            const Icon = item.icon;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                  // Ver a nota em rh-empresa-nav.tsx: no escuro, a cor da marca
                  // como texto fica abaixo do contraste mínimo, e ela muda por
                  // empresa. O fundo tingido continua marcando o item ativo.
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
        </div>
      ))}
    </nav>
  );
}
