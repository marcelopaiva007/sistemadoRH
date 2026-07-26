import Link from "next/link";
import { ArrowRight, CalendarX, TrendingDown, Users, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { ResumoDashboard } from "@/lib/dashboard";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const pct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;

export function DashboardEmpresa({ empresaId, resumo }: { empresaId: string; resumo: ResumoDashboard }) {
  const custoTotal = resumo.custoFolha + resumo.custoBeneficios;

  const cartoes = [
    {
      icone: Users,
      rotulo: "Colaboradores ativos",
      valor: String(resumo.ativos),
      apoio:
        resumo.admissoes12m || resumo.desligamentos12m
          ? `${resumo.admissoes12m} admitido(s) e ${resumo.desligamentos12m} desligado(s) em 12 meses`
          : "sem movimento nos últimos 12 meses",
    },
    {
      icone: TrendingDown,
      rotulo: "Turnover 12 meses",
      valor: resumo.ativos > 0 ? pct(resumo.turnoverPct) : "—",
      apoio: resumo.ativos > 0 ? "desligados sobre o quadro médio" : "sem quadro para calcular",
    },
    {
      icone: CalendarX,
      rotulo: "Absenteísmo 30 dias",
      valor: resumo.ativos > 0 ? pct(resumo.absenteismoPct) : "—",
      apoio: `${resumo.diasFalta30d} dia(s) de falta não abonada`,
    },
    {
      icone: Wallet,
      rotulo: "Custo de pessoal",
      valor: custoTotal > 0 ? brl(custoTotal) : "—",
      // Sem esta ressalva o número engana: com salário em branco na maioria
      // das fichas, o custo aparece muito menor do que é.
      apoio:
        resumo.semSalario > 0
          ? `parcial — ${resumo.semSalario} ficha(s) sem salário preenchido`
          : "folha + benefícios, mensal",
      alerta: resumo.semSalario > 0,
    },
  ];

  return (
    // pt-1: o seletor de empresa da lateral é fixo (sticky top-14), então ao
    // rolar a página este título encostava nele sem folga nenhuma.
    <section className="space-y-3 pt-1">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Visão da empresa
        </h2>
        <Link
          href={`/rh/${empresaId}/indicadores`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          Ver indicadores por setor
          <ArrowRight className="size-3" />
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cartoes.map((c) => {
          const Icone = c.icone;
          return (
            <Card key={c.rotulo}>
              <CardContent className="space-y-1 py-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Icone className="size-3.5" />
                  {c.rotulo}
                </div>
                <div className="text-2xl font-semibold tabular-nums">{c.valor}</div>
                <p className={`text-xs ${c.alerta ? "text-warning" : "text-muted-foreground"}`}>
                  {c.apoio}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
