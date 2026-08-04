"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertOctagon,
  FileCheck,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  Download,
  HardHat,
  Rocket,
  ShieldCheck,
  Plane,
  DoorOpen,
  ClipboardList,
  Star,
  MessagesSquare,
  History,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
// O tipo vem da lib, não de uma cópia local: a cópia divergiu quando as seis
// situações novas entraram e o build caiu por isso.
import type { Pendencias } from "@/lib/pendencias";

export function PendenciasView({
  empresaId,
  pendencias,
  diasAlerta,
}: {
  empresaId: string;
  pendencias: Pendencias;
  diasAlerta: number;
}) {
  const [exportando, setExportando] = useState(false);

  const exportarPDF = async () => {
    setExportando(true);
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      const element = document.getElementById("pendencias-content");
      if (!element) return;
      html2pdf()
        .set({ filename: `pendencias-${new Date().toISOString().split("T")[0]}.pdf` })
        .from(element)
        .save();
    } catch (error) {
      console.error("Erro ao exportar PDF:", error);
    } finally {
      setExportando(false);
    }
  };

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
      chave: "documentosAConferir",
      titulo: "Documentos a conferir",
      descricao: "Cópias enviadas pelo colaborador no portal, esperando validação.",
      href: `/rh/${empresaId}/colaboradores`,
      icon: FileCheck,
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
    {
      chave: "feriasVencidas",
      titulo: "Férias vencidas",
      descricao: "12+ meses de casa sem férias aprovadas no último ano — risco de dobra.",
      href: `/rh/${empresaId}/ferias`,
      icon: Plane,
      urgente: true,
    },
    {
      chave: "avisoPrevio",
      titulo: "Aviso prévio em curso",
      descricao: "Saída registrada para os próximos 7 dias; o offboarding precisa andar.",
      href: `/rh/${empresaId}/desligamentos`,
      icon: DoorOpen,
      urgente: true,
    },
    {
      chave: "desligamentosIncompletos",
      titulo: "Desligamento incompleto",
      descricao: "Pessoa já saiu com item de offboarding em aberto (crachá, acesso, EPI…).",
      href: `/rh/${empresaId}/desligamentos`,
      icon: ClipboardList,
    },
    {
      chave: "avaliacoesAtrasadas",
      titulo: "Avaliação atrasada",
      descricao: "Ciclo com janela encerrada e avaliações ainda pendentes.",
      href: `/rh/${empresaId}/avaliacoes`,
      icon: Star,
    },
    {
      chave: "convitesSemResposta",
      titulo: "Pesquisa sem resposta",
      descricao: "Pessoas com convite de pesquisa ativa aguardando resposta.",
      href: `/rh/${empresaId}/pesquisas`,
      icon: MessagesSquare,
    },
    {
      chave: "fichasDesatualizadas",
      titulo: "Ficha sem atualização",
      descricao: "Cadastro sem nenhuma gravação há mais de 6 meses.",
      href: `/rh/${empresaId}/colaboradores`,
      icon: History,
    },
  ];

  const comPendencia = cartoes.filter((c) => pendencias[c.chave] > 0);
  const total = Object.values(pendencias).reduce((s, n) => s + n, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Pendências</h2>
          <p className="text-sm text-muted-foreground">
            {total === 0
              ? "Nada esperando ação no momento."
              : `${total} ${total === 1 ? "item precisa" : "itens precisam"} de atenção.`}
          </p>
        </div>
        {comPendencia.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={exportarPDF}
            disabled={exportando}
            className="gap-2"
          >
            <Download className="size-4" />
            {exportando ? "Exportando..." : "PDF"}
          </Button>
        )}
      </div>

      <div id="pendencias-content">
        {comPendencia.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <CheckCircle2 className="size-8 text-success" />
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
    </div>
  );
}
