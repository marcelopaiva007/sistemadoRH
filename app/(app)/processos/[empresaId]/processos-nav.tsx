"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { NavLateral } from "@/components/padroes/nav-lateral";
import { PARAM } from "@/app/(app)/rh/[empresaId]/filtro-empresas";
import { areaDoCaminho, type AreaProcessos } from "@/lib/processos/areas";
import { cn } from "@/lib/utils";

// Menu do módulo. Mesmo desenho da lateral do RH (components/padroes/
// nav-lateral.tsx desde a v1.155.0): grupos recolhíveis, sem ícones, e o item
// ativo é sempre o de prefixo mais específico — "Veículos" (`frota`) não
// acende junto com "Multas" (`frota/multas`).
// Desde a v1.204.0 Frota e Contratos são duas telas separadas: a lateral
// mostra só a área em que a pessoa está, e a troca entre elas é o seletor
// "Frota | Contratos" no topo da lateral. Cada área tem suas Pendências.
const AREAS = {
  frota: [
    {
      titulo: null,
      itens: [
        { slug: "", label: "Pendências" },
        // A leitura de diretoria: números e gráficos, sem botão de ação — agir
        // é na Central. Mesma divisão que o RH faz entre Painel e filas.
        { slug: "painel", label: "Painel" },
      ],
    },
    {
      titulo: "Frota",
      itens: [
        { slug: "frota/panorama", label: "Panorama" },
        { slug: "frota", label: "Veículos" },
        { slug: "frota/financeiro", label: "Financeiro" },
        { slug: "frota/emplacamento", label: "Emplacamento" },
        { slug: "frota/multas", label: "Multas" },
        { slug: "frota/condutores", label: "Condutores" },
        { slug: "frota/consumo", label: "Consumo" },
        { slug: "frota/manutencoes", label: "Manutenções" },
        { slug: "frota/analise", label: "Análise" },
      ],
    },
  ],
  contratos: [
    {
      titulo: null,
      itens: [{ slug: "contratos/pendencias", label: "Pendências" }],
    },
    {
      titulo: "Contratos",
      itens: [
        { slug: "contratos", label: "Contratos" },
        { slug: "contratos/contrapartes", label: "Contrapartes" },
        { slug: "alugueis", label: "Aluguéis a receber" },
      ],
    },
  ],
} as const;

const ROTULO_AREA: Record<AreaProcessos, string> = { frota: "Frota", contratos: "Contratos" };
/** Onde cada área abre quando se troca pelo seletor. */
const ENTRADA_AREA: Record<AreaProcessos, string> = { frota: "", contratos: "contratos/pendencias" };

/** As telas do módulo, para a busca global. */
export const TELAS_PROCESSOS = (Object.keys(AREAS) as AreaProcessos[]).flatMap((area) =>
  AREAS[area].flatMap((g) =>
    g.itens.map((i) => ({ slug: i.slug, label: i.label, grupo: g.titulo ?? ROTULO_AREA[area] })),
  ),
);

export function ProcessosNav({ empresaId }: { empresaId: string }) {
  const base = `/processos/${empresaId}`;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const resto = pathname.startsWith(`${base}/`) ? pathname.slice(base.length + 1) : "";
  const area = areaDoCaminho(resto);
  // O `?empresas=` da barra de topo acompanha a troca de área, como na lateral.
  const filtro = searchParams.get(PARAM);
  const comFiltro = (href: string) => (filtro ? `${href}?${PARAM}=${filtro}` : href);

  const grupos = AREAS[area].map((grupo) => ({
    titulo: grupo.titulo,
    itens: grupo.itens.map((item) => ({
      href: item.slug ? `${base}/${item.slug}` : base,
      label: item.label,
      // A raiz é prefixo de tudo: só acende com o caminho exato.
      exato: !item.slug,
    })),
  }));
  return (
    <div className="flex items-center gap-2 md:block md:space-y-3">
      <div role="tablist" aria-label="Área" className="flex shrink-0 rounded-md border border-border p-0.5 md:w-full">
        {(Object.keys(AREAS) as AreaProcessos[]).map((a) => {
          const destino = ENTRADA_AREA[a] ? `${base}/${ENTRADA_AREA[a]}` : base;
          return (
            <Link
              key={a}
              role="tab"
              aria-selected={a === area}
              href={comFiltro(destino)}
              className={cn(
                "flex-1 rounded px-3 py-1 text-center text-[12.5px] font-semibold whitespace-nowrap transition-colors",
                a === area ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-card hover:text-foreground",
              )}
            >
              {ROTULO_AREA[a]}
            </Link>
          );
        })}
      </div>
      <NavLateral grupos={grupos} />
    </div>
  );
}
