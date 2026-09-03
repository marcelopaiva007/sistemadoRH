"use client";

import { NavLateral } from "@/components/padroes/nav-lateral";

// Menu do módulo. Mesmo desenho da lateral do RH (components/padroes/
// nav-lateral.tsx desde a v1.155.0): grupos recolhíveis, sem ícones, e o item
// ativo é sempre o de prefixo mais específico — "Veículos" (`frota`) não
// acende junto com "Multas" (`frota/multas`).
const GRUPOS = [
  {
    titulo: null,
    itens: [
      { slug: "", label: "Pendências" },
      // A leitura de diretoria: números e gráficos, sem botão de ação — agir é
      // na Central. Mesma divisão que o RH faz entre Painel executivo e filas.
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
  {
    titulo: "Contratos",
    itens: [
      { slug: "contratos", label: "Contratos" },
      { slug: "contratos/contrapartes", label: "Contrapartes" },
      { slug: "alugueis", label: "Aluguéis a receber" },
    ],
  },
] as const;

/** As telas do módulo, para a busca global. */
export const TELAS_PROCESSOS = GRUPOS.flatMap((g) =>
  g.itens.map((i) => ({ slug: i.slug, label: i.label, grupo: g.titulo ?? "Processos & Ativos" })),
);

export function ProcessosNav({ empresaId }: { empresaId: string }) {
  const base = `/processos/${empresaId}`;
  const grupos = GRUPOS.map((grupo) => ({
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
