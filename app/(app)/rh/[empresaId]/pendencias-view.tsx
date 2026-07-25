"use client";

import Link from "next/link";
import {
  AlertOctagon,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  HardHat,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type Pendencias = {
  aprovacoes: number;
  asoVencendo: number;
  certificadosVencendo: number;
  catPendente: number;
  integracoesAtrasadas: number;
  epiVencido: number;
};

export function PendenciasView({
  empresaId,
  pendencias,
  diasAlerta,
}: {
  empresaId: string;
  pendencias: Pendencias;
  diasAlerta: number;
}) {
  const cartoes: {
    chave: keyof Pendencias;
    titulo: string;
    descricao: string;
    href: string;
    icon: LucideIcon;
    // Urgente = tem prazo legal ou já estourou. Muda a cor, não a ordem.
    urgente?: boolean;
  }[] = [
    {
      chave: "catPendente",
      titulo: "CAT sem emitir",
      descricao: "Prazo legal de 1 dia útil ao INSS — imediato se for fatal.",
      href: `/rh/${empresaId}/acidentes`,
      icon: AlertOctagon,
      urgente: true,
    },
    {
      chave: "aprovacoes",
      titulo: "Aguardando aprovação",
      descricao: "Férias e ausências esperando decisão do RH.",
      href: `/rh/${empresaId}/aprovacoes`,
      icon: CheckSquare,
    },
    {
      chave: "asoVencendo",
      titulo: "ASO vencendo",
      descricao: `Exames ocupacionais no limite dos ${diasAlerta} dias.`,
      href: `/rh/${empresaId}/conformidade`,
      icon: ShieldCheck,
    },
    {
      chave: "certificadosVencendo",
      titulo: "NR vencendo",
      descricao: `Certificados de norma no limite dos ${diasAlerta} dias.`,
      href: `/rh/${empresaId}/conformidade`,
      icon: CalendarDays,
    },
    {
      chave: "epiVencido",
      titulo: "EPI vencido",
      descricao: "Equipamento de proteção fora da validade, com a pessoa em campo.",
      href: `/rh/${empresaId}/vencimentos`,
      icon: HardHat,
      urgente: true,
    },
    {
      chave: "integracoesAtrasadas",
      titulo: "Integração atrasada",
      descricao: "Item da trilha de quem entrou passou do prazo.",
      href: `/rh/${empresaId}/integracoes`,
      icon: Rocket,
    },
  ];

  const comPendencia = cartoes.filter((c) => pendencias[c.chave] > 0);
  const total = Object.values(pendencias).reduce((s, n) => s + n, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Pendências</h2>
        <p className="text-sm text-muted-foreground">
          {total === 0
            ? "Nada esperando ação no momento."
            : `${total} ${total === 1 ? "item precisa" : "itens precisam"} de atenção.`}
        </p>
      </div>

      {comPendencia.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <CheckCircle2 className="size-8 text-teal-600 dark:text-teal-400" />
            <p className="font-medium">Tudo em dia</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Nenhuma aprovação parada, nenhum documento vencendo, nenhuma CAT em aberto. Use o menu
              ao lado para navegar pelos módulos.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {comPendencia.map((c) => {
            const Icon = c.icon;
            const valor = pendencias[c.chave];
            return (
              <Link key={c.chave} href={c.href}>
                <Card
                  className={
                    c.urgente
                      ? "h-full border-destructive/40 transition-colors hover:bg-accent/40"
                      : "h-full transition-colors hover:bg-accent/40"
                  }
                >
                  <CardContent className="flex items-start gap-3 py-4">
                    <Icon
                      className={`mt-0.5 size-5 shrink-0 ${c.urgente ? "text-destructive" : "text-muted-foreground"}`}
                    />
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span
                          className={`text-2xl font-semibold tabular-nums ${c.urgente ? "text-destructive" : ""}`}
                        >
                          {valor}
                        </span>
                        <span className="font-medium">{c.titulo}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{c.descricao}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
