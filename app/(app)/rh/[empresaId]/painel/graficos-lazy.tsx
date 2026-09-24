/**
 * Componentes de Gráficos Lazy — Carregam com dynamic() + ssr:false
 * Evita renderizar Recharts no servidor (pesado), usa browser
 *
 * Uso:
 * <Suspense fallback={<ChartSkeleton />}>
 *   <GraficoHeadcount ... />
 * </Suspense>
 */

"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { CardSkeleton } from "@/components/skeletons/card-skeleton";

// Importa componentes pesados (Recharts) de forma lazy
// ssr:false = renderiza apenas no browser, não bloqueia servidor
const HeadcountChart = dynamic(
  () => import("./charts/headcount-chart"),
  {
    loading: () => <CardSkeleton />,
    ssr: false,
  }
);

const TurnoverChart = dynamic(
  () => import("./charts/turnover-chart"),
  {
    loading: () => <CardSkeleton />,
    ssr: false,
  }
);

const CustoChart = dynamic(
  () => import("./charts/custo-pessoal-chart"),
  {
    loading: () => <CardSkeleton />,
    ssr: false,
  }
);

const AbsenteismoChart = dynamic(
  () => import("./charts/absenteismo-chart"),
  {
    loading: () => <CardSkeleton />,
    ssr: false,
  }
);

const FaixaEtariaChart = dynamic(
  () => import("./charts/faixa-etaria-chart"),
  {
    loading: () => <CardSkeleton />,
    ssr: false,
  }
);

const MovimentacaoChart = dynamic(
  () => import("./charts/movimentacao-chart"),
  {
    loading: () => <CardSkeleton />,
    ssr: false,
  }
);

const RadarAnomalias = dynamic(
  () => import("./charts/radar-anomalias"),
  {
    loading: () => <CardSkeleton />,
    ssr: false,
  }
);

const NarrativaBloco = dynamic(
  () => import("./charts/narrativa-bloco"),
  {
    loading: () => <CardSkeleton />,
    ssr: false,
  }
);

// ============================================================================
// Wrappers que passam dados e renderizam lazy
// ============================================================================

export function GraficoHeadcount(props: any) {
  return <HeadcountChart {...props} />;
}

export function GraficoTurnover(props: any) {
  return <TurnoverChart {...props} />;
}

export function GraficoCusto(props: any) {
  return <CustoChart {...props} />;
}

export function GraficoAbsenteismo(props: any) {
  return <AbsenteismoChart {...props} />;
}

export function GraficoFaixaEtaria(props: any) {
  return <FaixaEtariaChart {...props} />;
}

export function GraficoMovimentacao(props: any) {
  return <MovimentacaoChart {...props} />;
}

export function GraficoRadarAnomalias(props: any) {
  return <RadarAnomalias {...props} />;
}

export function GraficoNarrativa(props: any) {
  return <NarrativaBloco {...props} />;
}
