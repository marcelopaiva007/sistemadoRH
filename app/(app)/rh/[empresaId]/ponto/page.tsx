import { headers } from "next/headers";
import { ipDaRequisicao } from "@/lib/login-tentativas";
import { prisma } from "@/lib/prisma";
import { limitesDeEstagio } from "@/lib/ponto-regras";
import { janelaDoDiaBrasilia } from "@/lib/datas";
import { PainelPresencaView } from "./painel-presenca";
import { EscalasView } from "./escalas-view";
import { TratamentoView } from "./tratamento-view";
import { RelatoriosPontoView } from "./relatorios-view";
import { ConfiguracoesPontoView } from "./configuracoes-view";
import { ColaboradoresPontoView } from "./colaboradores-ponto-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, ShieldCheck, FileEdit, FileSpreadsheet, Settings, Users } from "lucide-react";
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
  // "desconhecido" vira null de propósito: o botão "adicionar meu IP" da aba
  // Configurações grava o texto cru na lista de autorizados, e a palavra
  // "desconhecido" lá dentro autorizaria justamente as requisições cujo IP o
  // servidor não conseguiu determinar. Sem IP legível, a tela não oferece o
  // atalho — o RH digita o IP fixo à mão.
  const ipBruto = ipDaRequisicao(headersList);
  const ipAtual = ipBruto === "desconhecido" ? null : ipBruto;

  // A janela do monitor de presença: o dia de BRASÍLIA, não o do processo.
  //
  // Era `new Date(new Date().setHours(0, 0, 0, 0))`, que zera a hora em UTC na
  // Vercel — a janela começava às 21:00 do dia ANTERIOR em BRT. Consequência
  // dupla: depois das 21:00 o monitor mostrava a jornada inteira do dia como
  // se não tivesse acontecido (todo mundo AUSENTE), e entre 00:00 e 02:59 as
  // batidas do fim da tarde de ontem apareciam como as de hoje.
  //
  // Uma leitura só, fora do Promise.all, para as 170 linhas do findMany abaixo
  // usarem a MESMA fronteira — `new Date()` dentro do filtro poderia cair nos
  // dois lados da virada do dia.
  const hojeBrasilia = janelaDoDiaBrasilia();

  // Buscar empresa e jornadas
  const [empresa, jornadas, colaboradores, pendentes, historico, paraSelecao, configPonto] = await Promise.all([
    prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { id: true, nome: true },
    }),
    // TODAS as jornadas, não só as ativas: a inativa precisa aparecer
    // (acinzentada) para poder ser reativada — filtrar aqui a tornava
    // irrecuperável pela tela. Ativas primeiro.
    prisma.jornadaTrabalho.findMany({
      where: { empresaId },
      orderBy: [{ ativo: "desc" }, { nome: "asc" }],
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
            // Ver hojeBrasilia acima: a fronteira do dia é a de Brasília.
            dataHora: {
              gte: hojeBrasilia.inicio,
              lt: hojeBrasilia.fim,
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

  // Quem manda no status e o TIPO da ultima marcacao, nunca a paridade.
  // Contar batidas dava "Em Almoco/Intervalo" para quem cumpriu as quatro
  // marcacoes e foi embora as 18h (4 e par), e nunca produzia ATRASADO —
  // por isso aquele contador vivia zerado no painel. Como o portal deixa a
  // pessoa escolher o tipo do botao (ver app/portal/bater-ponto-card.tsx), o
  // tipo gravado e a unica fonte confiavel de onde ela esta agora.
  const statusPelaUltimaMarcacao = (
    tipo: string,
  ): "PRESENTE" | "EM_INTERVALO" | "SAIU" => {
    switch (tipo) {
      case "ENTRADA_1":
      case "ENTRADA_2":
        return "PRESENTE";
      case "SAIDA_1":
        return "EM_INTERVALO";
      case "SAIDA_2":
        return "SAIU";
      // `RegistroPonto.tipo` e String no schema, nao enum: um valor fora dos
      // quatro e possivel. Ele nao pode virar AUSENTE — ha batida hoje —,
      // entao PRESENTE e o menos errado.
      default:
        return "PRESENTE";
    }
  };

  const presentesLista = (colaboradores as ColaboradorComPonto[]).map((c) => {
    const batidas = c.registrosPonto;
    let status: "PRESENTE" | "EM_INTERVALO" | "SAIU" | "AUSENTE" = "AUSENTE";
    let primeiraEntrada: string | null = null;
    let ultimaSaida: string | null = null;

    if (batidas.length > 0) {
      primeiraEntrada = horaBrasilia(batidas[0].dataHora);

      // "Ult Sai" precisa ser uma SAIDA de verdade. Pegar a ultima batida de
      // qualquer tipo fazia a volta do intervalo (ENTRADA_2) aparecer no campo
      // de saida de quem esta presente.
      const ultimaBatidaDeSaida = [...batidas]
        .reverse()
        .find((b) => b.tipo === "SAIDA_1" || b.tipo === "SAIDA_2");
      ultimaSaida = ultimaBatidaDeSaida ? horaBrasilia(ultimaBatidaDeSaida.dataHora) : null;

      status = statusPelaUltimaMarcacao(batidas[batidas.length - 1].tipo);
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

        <TabsContent value="config" className="pt-4">
          <ConfiguracoesPontoView
            empresaId={empresaId}
            minutosDia={limitesEstagio.dia}
            minutosSemana={limitesEstagio.semana}
            geofencing={{
              latitude: configPonto?.latitudeEmpresa ?? null,
              longitude: configPonto?.longitudeEmpresa ?? null,
              raioMetros: configPonto?.raioPermitidoMtrs ?? 200,
              // A tela mostra o que REALMENTE bloqueia, não o que a coluna diz.
              // registrarPontoPortal exige GPS quando `exigirGps` é true E há
              // cerca cadastrada — então nos dois casos em que não há cerca
              // (sem linha de configuração, ou linha com `exigirGps` true e
              // coordenada nula, herdada do default antigo) a caixa aparece
              // DESMARCADA, porque nada está sendo bloqueado. Mostrá-la marcada
              // com os campos de coordenada vazios faria a tela mentir: o RH
              // leria "estou bloqueando" e não estaria. Salvar a partir daí
              // grava exigirGps=false e limpa a herança.
              exigirGps:
                (configPonto?.exigirGps ?? false) &&
                configPonto?.latitudeEmpresa != null &&
                configPonto?.longitudeEmpresa != null,
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
