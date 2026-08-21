import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { limitesDeEstagio } from "@/lib/ponto-regras";
import { PainelPresencaView } from "./painel-presenca";
import { EscalasView } from "./escalas-view";
import { TratamentoView } from "./tratamento-view";
import { RelatoriosPontoView } from "./relatorios-view";
import { DashboardDiretoriaPontoView } from "./dashboard-diretoria";
import { ConfiguracoesPontoView } from "./configuracoes-view";
import { ColaboradoresPontoView } from "./colaboradores-ponto-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, ShieldCheck, FileEdit, FileSpreadsheet, BarChart3, Settings, Users } from "lucide-react";
import { AjudaDaTela } from "@/components/ajuda-da-tela";

export default async function PontoEletronicoPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;

  // O IP público de QUEM ABRIU esta tela — mesma extração da batida em
  // registrarPontoPortal. Vai para a aba Configurações: o RH está na rede da
  // empresa, então este é exatamente o IP fixo que ele quer autorizar, sem
  // precisar descobrir em site de "qual é meu IP".
  const headersList = await headers();
  const ipAtual =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headersList.get("x-real-ip") ||
    null;

  // Buscar empresa e jornadas
  const [empresa, jornadas, colaboradores, pendentes, historico, paraSelecao, configPonto] = await Promise.all([
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
        // A referência com que o RH compara a selfie da batida. Só o booleano
        // atravessa para o cliente — a URL do Blob nunca sai do servidor; quem
        // serve a imagem é a rota autenticada, que audita quem viu.
        fotoUrl: true,
        fotoConferidaPeloRh: true,
        pontoLiberado: true,
        // Só o booleano "tem PIN?" atravessa para o cliente — o hash nunca.
        pontoPinHash: true,
        registrosPonto: {
          where: {
            dataHora: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
            },
          },
          orderBy: { dataHora: "asc" },
          // `select` explícito: a linha inteira tem IP, GPS e hash, que o
          // monitor não usa — e `fotoUrl` só vira o booleano abaixo, a URL do
          // Blob não atravessa para o cliente.
          select: { id: true, tipo: true, dataHora: true, fotoUrl: true },
        },
      },
    }),
    // Duas consultas, não uma com `take`: os PENDENTES vêm inteiros, porque
    // desde 11/08/2026 é nesta lista que se aprova ou rejeita — com o corte de
    // 20 que existia aqui, um ajuste que passasse dessa posição ficaria sem
    // nenhuma tela onde decidir. O corte continua valendo para o histórico já
    // decidido, que é só leitura.
    prisma.tratamentoPonto.findMany({
      where: { empresaId, status: "PENDENTE" },
      orderBy: { createdAt: "desc" },
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
    prisma.tratamentoPonto.findMany({
      where: { empresaId, status: { not: "PENDENTE" } },
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
    // Para o seletor do formulário: inclui DESLIGADOS. O ajuste de ponto de
    // quem saiu é justamente o que se faz durante o cálculo da rescisão — com
    // a lista só de ativos, esse caso ficava sem caminho na tela.
    prisma.colaborador.findMany({
      where: { empresaId },
      orderBy: [{ ativo: "desc" }, { nome: "asc" }],
      select: { id: true, nome: true, ativo: true },
    }),
    // Configuração de ponto da empresa. Pode não existir: a linha nasce
    // quando alguém salva a aba Configurações pela primeira vez.
    prisma.configuracaoPontoEmpresa.findUnique({ where: { empresaId } }),
  ]);

  // Truncado no teto legal aqui também — a tela nunca mostra um número que
  // a apuração não vá aplicar (ver limitesDeEstagio).
  const limitesEstagio = limitesDeEstagio(configPonto);

  // Montar lista de presença em tempo real
  type ColaboradorComPonto = {
    id: string;
    nome: string;
    setor: { nome: string };
    posicao: { nome: string };
    fotoUrl: string | null;
    fotoConferidaPeloRh: boolean;
    pontoLiberado: boolean;
    pontoPinHash: string | null;
    registrosPonto: Array<{ id: string; tipo: string; dataHora: Date; fotoUrl: string | null }>;
  };

  // Fuso explícito, sempre: sem ele o toLocaleTimeString responde no fuso do
  // PROCESSO — UTC na Vercel — e o monitor mostrava toda batida com 3 horas a
  // mais. Mesmo defeito corrigido no arquivo fiscal AFD em 12/08/2026; a tela
  // do portal sempre esteve certa porque roda no navegador da pessoa.
  const horaBrasilia = (d: Date) =>
    new Date(d).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });

  const presentesLista = (colaboradores as ColaboradorComPonto[]).map((c) => {
    const batidas = c.registrosPonto;
    let status: "PRESENTE" | "EM_INTERVALO" | "ATRASADO" | "AUSENTE" = "AUSENTE";
    let primeiraEntrada: string | null = null;
    let ultimaSaida: string | null = null;

    if (batidas.length > 0) {
      primeiraEntrada = horaBrasilia(batidas[0].dataHora);
      const ultimaBatida = batidas[batidas.length - 1];
      ultimaSaida = horaBrasilia(ultimaBatida.dataHora);

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
      temReferencia: c.fotoUrl !== null,
      referenciaConferida: c.fotoConferidaPeloRh,
      batidas: batidas.map((b) => ({
        id: b.id,
        hora: horaBrasilia(b.dataHora),
        temFoto: b.fotoUrl !== null,
      })),
    };
  });

  // Lista para a aba "Colaboradores": quem já foi liberado a bater ponto e
  // quem ainda não. Vem do mesmo `colaboradores` do painel de presença acima
  // — nenhuma consulta nova.
  const colaboradoresPontoLista = (colaboradores as ColaboradorComPonto[]).map((c) => ({
    id: c.id,
    nome: c.nome,
    setor: c.setor.nome,
    cargo: c.posicao.nome,
    pontoLiberado: c.pontoLiberado,
    temPin: c.pontoPinHash !== null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">Ponto Eletrônico & Gestão de Jornada (REP-P)</h1>
          <AjudaDaTela modulo="ponto" />
        </div>
        <p className="text-sm text-muted-foreground">
          {empresa?.nome || "Empresa"} · Portaria MTP nº 671/2021 & CLT
        </p>
      </div>

      <Tabs defaultValue="presenca" className="w-full">
        <TabsList className="w-full flex flex-wrap h-auto justify-start gap-1.5 p-1.5 bg-muted/60 rounded-lg">
          <TabsTrigger value="presenca" className="text-xs py-1.5 px-3 rounded-md data-active:bg-background">
            <Clock className="w-3.5 h-3.5 mr-1" /> Presença em Tempo Real
          </TabsTrigger>
          <TabsTrigger value="colaboradores" className="text-xs py-1.5 px-3 rounded-md data-active:bg-background">
            <Users className="w-3.5 h-3.5 mr-1" /> Colaboradores
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
          <TabsTrigger value="config" className="text-xs py-1.5 px-3 rounded-md data-active:bg-background">
            <Settings className="w-3.5 h-3.5 mr-1" /> Configurações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="presenca" className="pt-4">
          <PainelPresencaView colaboradores={presentesLista} empresaId={empresaId} />
        </TabsContent>

        <TabsContent value="colaboradores" className="pt-4">
          <ColaboradoresPontoView empresaId={empresaId} colaboradores={colaboradoresPontoLista} />
        </TabsContent>

        <TabsContent value="tratamento" className="pt-4">
          <TratamentoView
            empresaId={empresaId}
            // Pendentes primeiro e sempre: são os que exigem ação.
            tratamentos={[...pendentes, ...historico]}
            colaboradores={paraSelecao}
          />
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

        <TabsContent value="config" className="pt-4">
          <ConfiguracoesPontoView
            empresaId={empresaId}
            minutosDia={limitesEstagio.dia}
            minutosSemana={limitesEstagio.semana}
            geofencing={{
              latitude: configPonto?.latitudeEmpresa ?? null,
              longitude: configPonto?.longitudeEmpresa ?? null,
              raioMetros: configPonto?.raioPermitidoMtrs ?? 200,
              // Sem linha de configuração ainda, a tela mostra a trava DESLIGADA
              // — que é o que vale de fato: registrarPontoPortal só bloqueia com
              // `config.exigirGps` gravado como true.
              exigirGps: configPonto?.exigirGps ?? false,
            }}
            travaIp={{
              ipsAutorizados: configPonto?.ipsAutorizados ?? "",
              exigirIp: configPonto?.exigirIp ?? false,
              ipAtual,
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
