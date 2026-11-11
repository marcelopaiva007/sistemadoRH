"use client";

import { usePathname } from "next/navigation";
import { NavLateral } from "@/components/padroes/nav-lateral";
import { areaDoCaminho, type AreaProcessos } from "@/lib/processos/areas";

// Menu do módulo. Mesmo desenho da lateral do RH (components/padroes/
// nav-lateral.tsx desde a v1.155.0): grupos recolhíveis, sem ícones, e o item
// ativo é sempre o de prefixo mais específico — "Veículos" (`frota`) não
// acende junto com "Multas" (`frota/multas`).
// Desde a v1.204.0 Frota e Contratos são duas telas separadas: a lateral
// mostra só a área em que a pessoa está, e a troca entre elas são as abas
// Frota e Contratos da barra de topo (v1.205.0). Cada área tem suas Pendências.
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


/** As telas do módulo, para a busca global. */
export const TELAS_PROCESSOS = (Object.keys(AREAS) as AreaProcessos[]).flatMap((area) =>
  AREAS[area].flatMap((g) =>
    g.itens.map((i) => ({ slug: i.slug, label: i.label, grupo: g.titulo ?? ROTULO_AREA[area] })),
  ),
);

export function ProcessosNav({ empresaId }: { empresaId: string }) {
  const base = `/processos/${empresaId}`;
  const pathname = usePathname();
  const resto = pathname.startsWith(`${base}/`) ? pathname.slice(base.length + 1) : "";
  const area = areaDoCaminho(resto);

  const grupos = AREAS[area].map((grupo) => ({
    titulo: grupo.titulo,
    itens: grupo.itens.map((item) => ({
      href: item.slug ? `${base}/${item.slug}` : base,
      label: item.label,
      // A raiz é prefixo de tudo: só acende com o caminho exato.
      exato: !item.slug,
    })),
  }));
  return <NavLateral grupos={grupos} />;
}
