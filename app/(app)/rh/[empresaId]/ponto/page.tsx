import { prisma } from "@/lib/prisma";
import { janelaDoDiaBrasilia } from "@/lib/datas";
import { marcacoesDaJornada } from "@/lib/ponto-jornada";
import { PainelPresencaView } from "./painel-presenca";

/**
 * Presença em tempo real — a primeira tela do Ponto, no endereço raiz do
 * módulo (`/rh/<empresaId>/ponto`).
 *
 * Era a aba "Presença em Tempo Real" da tela única de sete abas; virou página
 * própria em v1.170.0, junto com as outras seis. As consultas aqui são só as
 * DESTA tela: as de tratamento, jornada e configuração foram para as páginas
 * que as usam — antes uma abertura de Ponto disparava as oito, mesmo para quem
 * só ia olhar o monitor.
 */
export default async function PontoPresencaPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;

  // A janela do monitor de presença: o dia de BRASÍLIA, não o do processo.
  //
  // Era `new Date(new Date().setHours(0, 0, 0, 0))`, que zera a hora em UTC na
  // Vercel — a janela começava às 21:00 do dia ANTERIOR em BRT. Consequência
  // dupla: depois das 21:00 o monitor mostrava a jornada inteira do dia como
  // se não tivesse acontecido (todo mundo AUSENTE), e entre 00:00 e 02:59 as
  // batidas do fim da tarde de ontem apareciam como as de hoje.
  //
  // Uma leitura só, fora do Promise.all, para as duas consultas usarem a MESMA
  // fronteira — `new Date()` dentro do filtro poderia cair nos dois lados da
  // virada do dia.
  const hojeBrasilia = janelaDoDiaBrasilia();

  const [colaboradores, marcacoesDoDia] = await Promise.all([
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
      },
    }),
    // As marcações de HOJE da empresa inteira, numa consulta só: batidas do
    // REP-P (RegistroPonto) E marcações incluídas por tratamento aprovado
    // (rh.MarcacaoTratada), já em ordem de hora — ver lib/ponto-jornada.ts.
    // Era um `include registrosPonto` dentro do findMany de colaboradores
    // acima, que só via as batidas: a marcação que o RH incluiu pelo PTRP não
    // existia para o monitor.
    marcacoesDaJornada(prisma, {
      empresaId,
      de: hojeBrasilia.inicio,
      ate: hojeBrasilia.fim,
    }),
  ]);

  type ColaboradorComPonto = {
    id: string;
    nome: string;
    setor: { nome: string };
    posicao: { nome: string };
    fotoUrl: string | null;
    fotoConferidaPeloRh: boolean;
  };

  // Agrupamento das marcações do dia por colaborador. marcacoesDaJornada já
  // devolve em ordem de dataHora, então cada grupo nasce ordenado — a
  // "última marcação" que decide o status continua sendo a última da lista.
  type MarcacaoDoDia = {
    id: string;
    tipo: string;
    dataHora: Date;
    fotoUrl: string | null;
    origem: "BATIDA" | "TRATAMENTO";
  };
  const marcacoesPorColaborador = new Map<string, MarcacaoDoDia[]>();
  for (const m of marcacoesDoDia) {
    const lista = marcacoesPorColaborador.get(m.colaboradorId) ?? [];
    lista.push({ id: m.id, tipo: m.tipo, dataHora: m.dataHora, fotoUrl: m.fotoUrl, origem: m.origem });
    marcacoesPorColaborador.set(m.colaboradorId, lista);
  }

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
    const batidas = marcacoesPorColaborador.get(c.id) ?? [];
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
        // Marcação tratada nunca tem foto (fotoUrl null no leitor) — o painel
        // a distingue pela origem, não pelo "sem foto".
        temFoto: b.fotoUrl !== null,
        origem: b.origem,
      })),
    };
  });

  return <PainelPresencaView colaboradores={presentesLista} empresaId={empresaId} />;
}
