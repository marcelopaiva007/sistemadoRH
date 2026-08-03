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
  Briefcase,
  Clock,
  LogOut,
  BookOpen,
  TrendingDown,
  User,
  LogIn,
  MessageSquare,
  RefreshCw,
  Users,
  FileText,
  Clock4,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Pendencias = {
  aprovacoes: number;
  documentosAConferir: number;
  asoVencendo: number;
  certificadosVencendo: number;
  catPendente: number;
  integracoesAtrasadas: number;
  epiVencido: number;
  feriasVencidas: number;
  avisoPrevio: number;
  desligamentosIncompletos: number;
  treinamentosObrigatorios: number;
  avaliacoesAtrasadas: number;
  contratosTemporariosVencidos: number;
  onboardingIncompleto: number;
  pesquisaClimaRespostasAtrasadas: number;
  dadosCadastraisDesatualizados: number;
  beneficiariosSemAtualizacao: number;
  movimentacoesAdministrativas: number;
  atestadosMedicosSemRegistro: number;
  horasExtrasSemAprovacao: number;
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
    urgente?: boolean;
  }[] = [
    // Críticas
    {
      chave: "catPendente",
      titulo: "CAT sem emitir",
      descricao: "Prazo legal de 1 dia útil ao INSS — imediato se for fatal.",
      href: `/rh/${empresaId}/acidentes`,
      icon: AlertOctagon,
      urgente: true,
    },
    {
      chave: "feriasVencidas",
      titulo: "Férias vencidas",
      descricao: "Colaboradores com saldo de férias não gozadas há 12+ meses.",
      href: `/rh/${empresaId}/ferias`,
      icon: CalendarDays,
      urgente: true,
    },
    {
      chave: "avisoPrevio",
      titulo: "Aviso prévio",
      descricao: "Colaboradores em período de aviso prévio com data de saída próxima.",
      href: `/rh/${empresaId}/desligamentos`,
      icon: Clock,
      urgente: true,
    },
    {
      chave: "desligamentosIncompletos",
      titulo: "Desligamentos incompletos",
      descricao: "Processos de desligamento ainda sem acertos finalizados.",
      href: `/rh/${empresaId}/desligamentos`,
      icon: LogOut,
      urgente: true,
    },
    {
      chave: "epiVencido",
      titulo: "EPI vencido",
      descricao: "Equipamento de proteção fora da validade, com a pessoa em campo.",
      href: `/rh/${empresaId}/vencimentos`,
      icon: HardHat,
      urgente: true,
    },
    // Altas
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
      icon: Briefcase,
    },
    {
      chave: "treinamentosObrigatorios",
      titulo: "Treinamentos vencidos",
      descricao: "Cursos obrigatórios (NR, saúde, segurança) com validade expirada.",
      href: `/rh/${empresaId}/treinamentos`,
      icon: BookOpen,
    },
    {
      chave: "avaliacoesAtrasadas",
      titulo: "Avaliações atrasadas",
      descricao: "Ciclos de desempenho vencidos sem avaliação realizada.",
      href: `/rh/${empresaId}/avaliacoes`,
      icon: TrendingDown,
    },
    {
      chave: "contratosTemporariosVencidos",
      titulo: "Contratos temporários vencendo",
      descricao: "Contratos próximos ao vencimento que precisam ser renovados ou encerrados.",
      href: `/rh/${empresaId}/colaboradores`,
      icon: Clock4,
    },
    {
      chave: "onboardingIncompleto",
      titulo: "Onboarding incompleto",
      descricao: "Novos contratados com documentação e trilha não finalizadas.",
      href: `/rh/${empresaId}/integracoes`,
      icon: LogIn,
    },
    {
      chave: "integracoesAtrasadas",
      titulo: "Integração atrasada",
      descricao: "Item da trilha de quem entrou passou do prazo.",
      href: `/rh/${empresaId}/integracoes`,
      icon: Rocket,
    },
    // Médias
    {
      chave: "pesquisaClimaRespostasAtrasadas",
      titulo: "Pesquisa de clima não respondida",
      descricao: "Colaboradores que não preencheram pesquisa de engajamento.",
      href: `/rh/${empresaId}/pesquisas`,
      icon: MessageSquare,
    },
    {
      chave: "dadosCadastraisDesatualizados",
      titulo: "Dados cadastrais desatualizados",
      descricao: "Registros com mais de 6 meses sem revisão (email, telefone, endereço).",
      href: `/rh/${empresaId}/colaboradores`,
      icon: RefreshCw,
    },
    {
      chave: "beneficiariosSemAtualizacao",
      titulo: "Beneficiários desatualizados",
      descricao: "Dependentes e beneficiários sem atualização há 12+ meses.",
      href: `/rh/${empresaId}/beneficios`,
      icon: Users,
    },
    {
      chave: "movimentacoesAdministrativas",
      titulo: "Movimentações administrativas pendentes",
      descricao: "Mudanças de setor/cargo não processadas ainda.",
      href: `/rh/${empresaId}/colaboradores`,
      icon: Briefcase,
    },
    {
      chave: "atestadosMedicosSemRegistro",
      titulo: "Atestados médicos sem registro",
      descricao: "Comunicações de afastamento não lançadas no sistema.",
      href: `/rh/${empresaId}/vencimentos`,
      icon: FileText,
    },
    {
      chave: "horasExtrasSemAprovacao",
      titulo: "Horas extras sem aprovação",
      descricao: "Horas adicionais pendentes de validação do gestor há mais de 7 dias.",
      href: `/rh/${empresaId}/escalas`,
      icon: Zap,
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
