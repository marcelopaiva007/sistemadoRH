import { prisma } from "@/lib/prisma";
import { PainelPresencaView } from "./painel-presenca";
import { EscalasView } from "./escalas-view";
import { TratamentoView } from "./tratamento-view";
import { RelatoriosPontoView } from "./relatorios-view";
import { DashboardDiretoriaPontoView } from "./dashboard-diretoria";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, ShieldCheck, FileEdit, FileSpreadsheet, BarChart3 } from "lucide-react";

export default async function PontoEletronicoPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;

  // Buscar empresa e jornadas
  const [empresa, jornadas, colaboradores, tratamentos] = await Promise.all([
    prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { id: true, nome: true },
    }),
    prisma.jornadaTrabalho.findMany({
      where: { empresaId, ativo: true },
      orderBy: { nome: "asc" },
    }),
    prisma.colaborador.findMany({
      where: { empresaId, ativo: true },
      select: {
        id: true,
        nome: true,
        setor: { select: { nome: true } },
        posicao: { select: { nome: true } },
        registrosPonto: {
          where: {
            dataHora: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
            },
          },
          orderBy: { dataHora: "asc" },
        },
      },
    }),
    prisma.tratamentoPonto.findMany({
      where: { empresaId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        colaborador: {
          select: {
            nome: true,
            setor: { select: { nome: true } },
            posicao: { select: { nome: true } },
          },
        },
      },
    }),
  ]);

  // Montar lista de presença em tempo real
  type ColaboradorComPonto = {
    id: string;
    nome: string;
    setor: { nome: string };
    posicao: { nome: string };
    registrosPonto: Array<{ dataHora: Date }>;
  };

  const presentesLista = (colaboradores as ColaboradorComPonto[]).map((c) => {
    const batidas = c.registrosPonto;
    let status: "PRESENTE" | "EM_INTERVALO" | "ATRASADO" | "AUSENTE" = "AUSENTE";
    let primeiraEntrada: string | null = null;
    let ultimaSaida: string | null = null;

    if (batidas.length > 0) {
      primeiraEntrada = new Date(batidas[0].dataHora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const ultimaBatida = batidas[batidas.length - 1];
      ultimaSaida = new Date(ultimaBatida.dataHora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

      if (batidas.length % 2 !== 0) {
        status = "PRESENTE";
      } else {
        status = "EM_INTERVALO";
      }
    }

    return {
      colaboradorId: c.id,
      nome: c.nome,
      setor: c.setor.nome,
      cargo: c.posicao.nome,
      status,
      primeiraEntrada,
      ultimaSaida,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Ponto Eletrônico & Gestão de Jornada (REP-P)</h1>
        <p className="text-sm text-muted-foreground">
          {empresa?.nome || "Empresa"} · Portaria MTP nº 671/2021 & CLT
        </p>
      </div>

      <Tabs defaultValue="presenca" className="w-full">
        <TabsList className="w-full flex flex-wrap h-auto justify-start gap-1.5 p-1.5 bg-muted/60 rounded-lg">
          <TabsTrigger value="presenca" className="text-xs py-1.5 px-3 rounded-md data-active:bg-background">
            <Clock className="w-3.5 h-3.5 mr-1" /> Presença em Tempo Real
          </TabsTrigger>
          <TabsTrigger value="tratamento" className="text-xs py-1.5 px-3 rounded-md data-active:bg-background">
            <FileEdit className="w-3.5 h-3.5 mr-1" /> Tratamento (PTRP)
          </TabsTrigger>
          <TabsTrigger value="escalas" className="text-xs py-1.5 px-3 rounded-md data-active:bg-background">
            <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Jornadas & Escalas
          </TabsTrigger>
          <TabsTrigger value="relatorios" className="text-xs py-1.5 px-3 rounded-md data-active:bg-background">
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1" /> Relatórios & Fiscal (AFD)
          </TabsTrigger>
          <TabsTrigger value="diretoria" className="text-xs py-1.5 px-3 rounded-md data-active:bg-background">
            <BarChart3 className="w-3.5 h-3.5 mr-1" /> Dashboard Diretoria
          </TabsTrigger>
        </TabsList>

        <TabsContent value="presenca" className="pt-4">
          <PainelPresencaView colaboradores={presentesLista} />
        </TabsContent>

        <TabsContent value="tratamento" className="pt-4">
          <TratamentoView empresaId={empresaId} tratamentos={tratamentos} />
        </TabsContent>

        <TabsContent value="escalas" className="pt-4">
          <EscalasView empresaId={empresaId} jornadas={jornadas} />
        </TabsContent>

        <TabsContent value="relatorios" className="pt-4">
          <RelatoriosPontoView empresaId={empresaId} />
        </TabsContent>

        <TabsContent value="diretoria" className="pt-4">
          <DashboardDiretoriaPontoView
            dados={{
              custoEstimadoHE: 1450.0,
              totalHorasExtras50Min: 320,
              totalHorasExtras100Min: 120,
              passivoBancoHorasMin: 840,
              valorPassivoBancoHorasR$: 3800.0,
              violacoesLimite2h: 2,
              supressoesIntervalo: 1,
              taxaAbsenteismoPct: 1.8,
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
