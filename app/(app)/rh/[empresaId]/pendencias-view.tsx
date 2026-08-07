"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  FileSignature,
  Timer,
  Users,
  Stethoscope,
  CircleDashed,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
// O tipo vem da lib, não de uma cópia local: a cópia divergiu quando as seis
// situações novas entraram e o build caiu por isso.
import type { Pendencias, PesquisaAberta } from "@/lib/pendencias";

export function PendenciasView({
  empresaId,
  pendencias,
  semRegistro,
  diasAlerta,
  pesquisasAbertas,
}: {
  empresaId: string;
  pendencias: Pendencias;
  // Módulos sem NENHUM registro nesta marca. Chega como array, não Set: o que
  // atravessa de Server para Client Component tem que ser serializável.
  semRegistro: (keyof Pendencias)[];
  diasAlerta: number;
  // Detalhe do cartão "Pesquisa a encerrar": qual pesquisa e há quantos dias
  // está aberta. O número sozinho não ajuda a decidir quando encerrar.
  pesquisasAbertas: PesquisaAberta[];
}) {
  const [exportando, setExportando] = useState(false);

  // O filtro de marca/CNPJ (?empresas=) viaja junto no clique: quem estreitou
  // para um CNPJ e clica em "14 Férias vencidas" precisa cair na tela de
  // Férias DAQUELE CNPJ — sem isso o destino abre no grupo inteiro e o número
  // do cartão não bate com a tela. `extra` acrescenta o filtro da situação
  // (ex.: filtro=VENCIDO) para a tela já abrir listando a pendência clicada.
  const searchParams = useSearchParams();
  const empresasParam = searchParams.get("empresas");
  const comFiltro = (path: string, extra?: string) => {
    const params = new URLSearchParams();
    if (empresasParam) params.set("empresas", empresasParam);
    for (const par of extra?.split("&") ?? []) {
      const [chave, valor] = par.split("=");
      if (chave && valor) params.set(chave, valor);
    }
    const query = params.toString();
    return query ? `${path}?${query}` : path;
  };

  // "há 34 dias · 12 respostas" para cada pesquisa aberta, as três mais antigas
  // primeiro. O tempo aberto é o que orienta a decisão de encerrar; a contagem
  // de respostas diz se ainda vale esperar mais.
  const dias = (n: number) => (n === 0 ? "aberta hoje" : `há ${n} ${n === 1 ? "dia" : "dias"}`);
  const descricaoPesquisas =
    pesquisasAbertas.length === 0
      ? "Aberta para os colaboradores; o resultado só fecha quando o RH encerra."
      : pesquisasAbertas
          .slice(0, 3)
          .map((p) => `${p.titulo} — ${dias(p.diasAberta)}, ${p.respostas} resp.`)
          .join(" · ") +
        (pesquisasAbertas.length > 3 ? ` · +${pesquisasAbertas.length - 3}` : "");

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
      href: comFiltro(`/rh/${empresaId}/acidentes`),
      icon: AlertOctagon,
      urgente: true,
    },
    {
      chave: "aprovacoes",
      titulo: "Aguardando aprovação",
      descricao: "Férias e ausências esperando decisão do RH.",
      href: comFiltro(`/rh/${empresaId}/aprovacoes`),
      icon: CheckSquare,
    },
    {
      chave: "documentosAConferir",
      titulo: "Documentos a conferir",
      descricao: "Cópias enviadas pelo colaborador no portal, esperando validação.",
      href: comFiltro(`/rh/${empresaId}/aprovacoes`),
      icon: FileCheck,
    },
    {
      chave: "asoVencendo",
      titulo: "ASO vencendo",
      descricao: `Exames ocupacionais no limite dos ${diasAlerta} dias.`,
      href: comFiltro(`/rh/${empresaId}/conformidade`),
      icon: ShieldCheck,
    },
    {
      chave: "certificadosVencendo",
      titulo: "NR vencendo",
      descricao: `Certificados de norma no limite dos ${diasAlerta} dias.`,
      href: comFiltro(`/rh/${empresaId}/conformidade`),
      icon: CalendarDays,
    },
    {
      chave: "epiVencido",
      titulo: "EPI vencido",
      descricao: "Equipamento de proteção fora da validade, com a pessoa em campo.",
      href: comFiltro(`/rh/${empresaId}/vencimentos`),
      icon: HardHat,
      urgente: true,
    },
    {
      chave: "integracoesAtrasadas",
      titulo: "Integração atrasada",
      descricao: "Item da trilha de quem entrou passou do prazo.",
      href: comFiltro(`/rh/${empresaId}/integracoes`),
      icon: Rocket,
    },
    {
      chave: "feriasVencidas",
      titulo: "Férias vencidas",
      descricao: "12+ meses de casa sem férias aprovadas no último ano — risco de dobra.",
      href: comFiltro(`/rh/${empresaId}/ferias`, "filtro=VENCIDO"),
      icon: Plane,
      urgente: true,
    },
    {
      chave: "avisoPrevio",
      titulo: "Aviso prévio em curso",
      descricao: "Saída registrada para os próximos 7 dias; o offboarding precisa andar.",
      href: comFiltro(`/rh/${empresaId}/desligamentos`),
      icon: DoorOpen,
      urgente: true,
    },
    {
      chave: "desligamentosIncompletos",
      titulo: "Desligamento incompleto",
      descricao: "Pessoa já saiu com item de offboarding em aberto (crachá, acesso, EPI…).",
      href: comFiltro(`/rh/${empresaId}/desligamentos`),
      icon: ClipboardList,
    },
    {
      chave: "avaliacoesAtrasadas",
      titulo: "Avaliação atrasada",
      descricao: "Ciclo com janela encerrada e avaliações ainda pendentes.",
      href: comFiltro(`/rh/${empresaId}/avaliacoes`),
      icon: Star,
    },
    {
      chave: "pesquisasAbertas",
      titulo: "Pesquisa a encerrar",
      descricao: descricaoPesquisas,
      href: comFiltro(`/rh/${empresaId}/pesquisas`),
      icon: MessagesSquare,
    },
    {
      chave: "fichasDesatualizadas",
      titulo: "Ficha sem atualização",
      descricao: "Cadastro sem nenhuma gravação há mais de 6 meses.",
      href: comFiltro(`/rh/${empresaId}/colaboradores`),
      icon: History,
    },
    {
      chave: "contratosVencendo",
      titulo: "Contrato vencendo",
      descricao: `Experiência, temporário ou estágio terminando em ${diasAlerta} dias — passar do prazo torna o contrato indeterminado.`,
      href: comFiltro(`/rh/${empresaId}/colaboradores`),
      icon: FileSignature,
      urgente: true,
    },
    {
      chave: "horasExtrasExcedidas",
      titulo: "Hora extra acima do limite",
      descricao: "Passou de 44h no mês aberto — o limite da CLT é 2h por dia.",
      href: comFiltro(`/rh/${empresaId}/folha`),
      icon: Timer,
      urgente: true,
    },
    {
      chave: "atestadosSemDocumento",
      titulo: "Atestado sem documento",
      descricao: "Falta já abonada sem o atestado anexado — nada sustenta o abono numa fiscalização.",
      href: comFiltro(`/rh/${empresaId}/aprovacoes`),
      icon: Stethoscope,
    },
    {
      chave: "dependentesSemCpf",
      titulo: "Dependente sem CPF",
      descricao: "Declarado para IRRF sem CPF; a Receita exige em qualquer idade.",
      href: comFiltro(`/rh/${empresaId}/colaboradores`),
      icon: Users,
    },
  ];

  const vazio = new Set(semRegistro);
  const comPendencia = cartoes.filter((c) => pendencias[c.chave] > 0);
  // Zero com registro é "está em dia"; zero sem registro nenhum é "ninguém
  // usou este módulo". Separar os dois é o ponto: até 04/08/2026 os dois caíam
  // no mesmo "Tudo em dia" verde, e seis áreas nunca abertas — entre elas CAT,
  // que tem prazo legal de 1 dia útil — apareciam como conformidade.
  const semBase = cartoes.filter((c) => pendencias[c.chave] === 0 && vazio.has(c.chave));
  const emDia = cartoes.filter((c) => pendencias[c.chave] === 0 && !vazio.has(c.chave));
  const total = Object.values(pendencias).reduce((s, n) => s + n, 0);

  return (
    // id-alvo do link "Pendências" na tela do grupo e dos cards de marca — sem
    // ele, o clique leva para o topo da página e a pessoa ainda precisa rolar
    // até achar a seção.
    <div id="pendencias" className="space-y-6 scroll-mt-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Pendências</h2>
          <p className="text-sm text-muted-foreground">
            {total === 0
              ? `Nenhum item aberto — ${emDia.length} de ${cartoes.length} situações puderam ser avaliadas.`
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

      <div id="pendencias-content" className="space-y-4">
        {comPendencia.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <CheckCircle2 className="size-8 text-success" />
              <p className="font-medium">
                {emDia.length > 0 ? "Nada esperando ação" : "Nada a mostrar ainda"}
              </p>
              <p className="max-w-md text-sm text-muted-foreground">
                {emDia.length > 0
                  ? `${emDia.length} ${emDia.length === 1 ? "situação está" : "situações estão"} em dia.`
                  : "Nenhum dos módulos acompanhados tem registro."}{" "}
                {semBase.length > 0 &&
                  `Outras ${semBase.length} não puderam ser avaliadas — veja abaixo.`}
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

        {semBase.length > 0 && (
          <Card className="border-dashed">
            <CardContent className="space-y-3 py-4">
              <div className="flex items-start gap-3">
                <CircleDashed className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium">
                    {semBase.length} {semBase.length === 1 ? "situação" : "situações"} sem base para
                    avaliar
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Estes módulos não têm nenhum registro, então o zero acima não quer dizer que
                    esteja tudo certo — quer dizer que não há o que conferir. Começar a usá-los é o
                    que liga a cobrança.
                  </p>
                </div>
              </div>
              <ul className="grid gap-x-6 gap-y-1 pl-8 text-sm text-muted-foreground sm:grid-cols-2">
                {semBase.map((c) => (
                  <li key={c.chave}>
                    <Link href={c.href} className="hover:text-foreground hover:underline">
                      {c.titulo}
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
