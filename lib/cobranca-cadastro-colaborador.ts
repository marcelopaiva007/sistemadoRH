// Cobrança de CADASTRO do colaborador, por Telegram E e-mail — a terceira
// cobrança do sistema, e a primeira que fala com a pessoa sobre a própria
// ficha. As outras duas, para não confundir:
//
//   lib/regua-cobranca.ts        cobra COLABORADOR para responder pesquisa
//   lib/cobranca-rh-pendencias.ts cobra o RH sobre o que ficou parado na fila
//
// A pendência `cadastrosIncompletos` (lib/pendencias.ts) já dizia ao analista
// "40 fichas incompletas" todo dia por e-mail. Ninguém dizia nada às 40
// pessoas — e o dado que falta está com elas, não com o RH. É esse buraco que
// este motor fecha.
//
// TRÊS RECORTES QUE NÃO SÃO DETALHE:
//
// 1. Só se cobra o que a pessoa RESOLVE SOZINHA no portal. `cadastroIncompleto`
//    marca ficha por falta de CPF e de data de admissão também, e nenhum dos
//    dois é editável em `atualizarMeusDados` — cobrar por eles seria mandar a
//    pessoa a uma tela onde o campo não existe. Esses dois seguem com o RH, na
//    cobrança de pendências. Mesma régua nos documentos: CONTRATO é papel que a
//    empresa emite, não que o colaborador anexa, e fica de fora.
//
// 2. OS DOIS CANAIS, na mesma rodada (decisão do Marcelo em 11/08/2026; a
//    primeira versão era só Telegram). Quem tem os dois recebe pelos dois —
//    não é fallback: cadastro incompleto trava pagamento e eSocial, e a
//    mensagem que a pessoa vê primeiro é a que resolve.
//
//    O e-mail tem teto diário (LIMITE_DIARIO_ENVIOS, hoje 85) que uma campanha
//    para a base inteira estoura sozinha — em 28/07/2026 uma campanha de portal
//    comeu a cota do dia em 8 segundos e os convites de pesquisa não saíram. Por
//    isso esta cobrança para de mandar e-mail quando o orçamento do dia chega a
//    RESERVA_DE_EMAILS: ela é a menos urgente das que disputam a cota (convite
//    de pesquisa tem janela, cobrança do RH é diária), então cede primeiro. Quem
//    ficou de fora hoje não perde nada — segue recebendo pelo Telegram, e o
//    e-mail sai na próxima rodada. Só não se gasta o teto inteiro numa cobrança
//    que pode esperar três dias.
//
// 3. Duas vezes por semana, com fim. Diário como a cobrança do RH não cabe
//    aqui: juntar documento leva dias, e mensagem diária de robô vira bloqueio
//    do bot — perde-se o canal inteiro, não só esta cobrança. São no máximo
//    MAX_COBRANCAS envios; depois disso o silêncio é resposta e o caso volta a
//    ser do RH, que continua vendo a ficha na tela de pendências.
//
// QUEM DISPARA (mudou em 12/08/2026, decisão do Marcelo):
//
//   à mão   — SEMPRE disponível. Botão na ficha do colaborador e na lista, para
//             o pessoal do RH. É o caminho principal.
//   sozinho — só se a GESTÃO ligar em Configuração → Lembretes. Nasce
//             desligado (LEMBRETES_QUE_NASCEM_DESLIGADOS, lib/cron-horario.ts):
//             varrer a base inteira falando com colaborador é decisão de
//             gestão, tomada uma vez e registrada, não padrão herdado de quem
//             escreveu o código.
//
// O motor é o mesmo nos dois casos; só muda quem apertou o botão.
import { prisma, type Cliente } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { sendEmail, orcamentoRestanteHoje } from "@/lib/email";

/**
 * Duas vezes por semana (decisão do Marcelo em 11/08/2026; era 7 dias). Três
 * dias e não "segunda e quinta": o cron já roda todo dia e a trava é "dias
 * desde a última cobrança DESTA pessoa" — cada um tem o próprio relógio,
 * contado de quando entrou na campanha, e não existe um dia da semana em que
 * a base inteira seja cobrada junto.
 */
export const DIAS_ENTRE_COBRANCAS = 3;

/**
 * Oito, e não os quatro de antes: a cobrança dobrou de frequência, e manter o
 * teto faria a campanha inteira acabar em 12 dias. Com 8 a janela volta a ser
 * de aproximadamente um mês, que era a intenção original — insistir o
 * suficiente para vencer o esquecimento, sem virar perseguição.
 */
export const MAX_COBRANCAS = 8;

/**
 * E-mails que esta cobrança nunca consome. Ver o recorte 2 no topo: com o
 * orçamento do dia neste patamar, ela para de mandar e-mail e deixa o resto
 * para convite de pesquisa e cobrança do RH, que não podem esperar.
 */
export const RESERVA_DE_EMAILS = 25;

/**
 * O bot, para quem vai ler no e-mail e precisa achá-lo no Telegram. Cópia do
 * valor de lib/convite-portal.ts, e não import: aquele módulo é `server-only` e
 * importá-lo aqui quebraria o smoke, que roda fora do Next. Se o bot mudar de
 * nome, os dois trocam juntos.
 */
export const BOT_DO_RH = "@ContatoLm_bot";

/**
 * Documentos que o colaborador anexa pelo portal, com o texto do PEDIDO — não
 * o rótulo do catálogo. `tipoDocumentoLabel("COMPROVANTE_RESIDENCIA")` devolve
 * "Comprovante de residência", ótimo numa tabela do RH e esquisito numa frase
 * ("Foto do Comprovante de residência"); e "frente e verso" só faz sentido
 * aqui, onde alguém vai fotografar o papel.
 *
 * A lista é `DOCUMENTOS_ADMISSIONAIS` (lib/admissao.ts) menos CONTRATO — ver o
 * recorte 1 no topo. Cópia consciente e não import: a de lá responde "o dossiê
 * está completo?" para o DP; esta responde "o que peço a esta pessoa?". As duas
 * podem divergir de propósito, e é isso que este comentário registra.
 */
const PEDIDO_DO_DOCUMENTO = {
  RG: "Foto do RG (frente e verso)",
  CPF: "Foto do CPF",
  CTPS: "Foto da carteira de trabalho",
  COMPROVANTE_RESIDENCIA: "Comprovante de residência (foto ou PDF)",
} as const;

export const DOCUMENTOS_DO_COLABORADOR = Object.keys(PEDIDO_DO_DOCUMENTO) as (keyof typeof PEDIDO_DO_DOCUMENTO)[];

/** Campos lidos para decidir o que falta. */
type FichaParaCobranca = {
  email: string | null;
  telefone: string | null;
  rg: string | null;
  logradouro: string | null;
  numeroEndereco: string | null;
  bairro: string | null;
  uf: string | null;
};

/**
 * O que falta na ficha, em rótulos que a pessoa entende — nunca nome de coluna.
 *
 * Agrupado de propósito: "logradouro, número, bairro, UF" viram uma linha só
 * ("Seu endereço completo"). Quatro linhas para o mesmo formulário fazem a
 * mensagem parecer um relatório de erro, e quem lê no celular desiste.
 */
export function faltasNaFicha(c: FichaParaCobranca): string[] {
  const faltas: string[] = [];

  // Contato é par: exigir os dois marcaria quase toda a base operacional, onde
  // a maioria só tem telefone. Mesma regra de CADASTRO_INCOMPLETO_WHERE.
  if (c.email === null && c.telefone === null) faltas.push("Telefone ou e-mail de contato");
  if (c.rg === null) faltas.push("Número do RG");
  if (c.logradouro === null || c.numeroEndereco === null || c.bairro === null || c.uf === null) {
    faltas.push("Endereço completo (rua, número, bairro e estado)");
  }
  // Dado bancário saiu da cobrança em 13/08/2026 junto com os campos: a chave
  // de pagamento agora é o CPF do próprio colaborador, e não há tela onde ele
  // possa responder isso. Pedir por Telegram um dado que o portal não aceita é
  // o jeito mais rápido de ensinar as pessoas a ignorar o bot.

  return faltas;
}

/** Os documentos da lista que ainda não têm nenhuma via no dossiê. */
export function documentosFaltando(tiposNoDossie: string[]): string[] {
  // Qualquer via conta, inclusive a que ainda espera conferência do RH: a
  // pessoa já fez a parte dela. Cobrar de novo enquanto o RH não olhou seria
  // culpar o colaborador pela fila do RH — e é o caminho mais curto para ele
  // parar de responder ao bot.
  const enviados = new Set(tiposNoDossie);
  return DOCUMENTOS_DO_COLABORADOR.filter((t) => !enviados.has(t)).map((t) => PEDIDO_DO_DOCUMENTO[t]);
}

export function montarMensagem(nome: string, itens: string[], rodada: number): string {
  const primeiro = nome.split(" ")[0];
  const lista = itens.map((i) => `• ${i}`).join("\n");

  // A partir da 2ª a mensagem reconhece que já pediu antes. Repetir o texto
  // idêntico quatro vezes faz o bot parecer quebrado, e quem já respondeu
  // parcialmente acha que o envio anterior se perdeu.
  const abertura =
    rodada === 1
      ? `Oi, ${primeiro}! 👋\n\nSeu cadastro no RH está incompleto. Falta:`
      : `Oi, ${primeiro}! Passando de novo sobre o seu cadastro — ainda falta:`;

  return (
    `${abertura}\n\n${lista}\n\n` +
    `Para resolver, envie /portal aqui neste chat. O link abre a sua ficha no ` +
    `celular: você atualiza os dados e anexa as fotos por lá mesmo. Leva poucos minutos.\n\n` +
    `Se alguma coisa dessa lista você já entregou em papel, me avise pelo portal, ` +
    `em "Fale com o RH", que a gente acerta.`
  );
}

/**
 * A mesma cobrança em formato de e-mail, para quem tem endereço. Assina a marca
 * da pessoa, nunca as três do grupo — quem é da Centrysol lendo "LM Telecom"
 * acha que a mensagem veio trocada (mesma regra de lib/convite-portal.ts).
 *
 * Não repete a instrução do `/portal`: no Telegram o comando faz sentido porque
 * a pessoa está dentro do chat do bot; num e-mail seria mandar alguém procurar
 * um aplicativo. Aqui o caminho é o bot pelo nome.
 */
export function montarEmail(
  nome: string,
  itens: string[],
  rodada: number,
  marca: string,
): { assunto: string; texto: string; html: string } {
  const primeiro = nome.split(" ")[0];
  const abertura =
    rodada === 1
      ? `Oi, ${primeiro}! Seu cadastro no RH está incompleto.`
      : `Oi, ${primeiro}! Passando de novo sobre o seu cadastro.`;

  const assunto = rodada === 1 ? "Falta completar seu cadastro no RH" : "Seu cadastro no RH ainda está incompleto";

  const texto =
    `${abertura}\n\nAinda falta:\n\n` +
    itens.map((i) => `- ${i}`).join("\n") +
    `\n\nPara resolver, procure ${BOT_DO_RH} no Telegram e envie /portal. ` +
    `O link abre a sua ficha no celular: você atualiza os dados e anexa as fotos por lá mesmo.\n\n` +
    `Se alguma coisa dessa lista você já entregou em papel, responda este e-mail que a gente acerta.\n\n` +
    `RH - ${marca}\n`;

  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;border:1px solid #e2e5e9;">
<tr><td style="padding:30px 32px;">
  <p style="margin:0 0 18px;font-size:16px;color:#15191e;">${abertura}</p>
  <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#3d454f;">Ainda falta:</p>
  <table role="presentation" style="width:100%;background:#f0f4f9;border-radius:6px;margin:0 0 18px;">
    <tr><td style="padding:16px 20px;font-size:15px;line-height:1.9;color:#15191e;">
      ${itens.map((i) => `• ${i}`).join("<br>")}
    </td></tr>
  </table>
  <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#15191e;">
    Para resolver, procure <b>${BOT_DO_RH}</b> no Telegram e envie <b>/portal</b>.
    O link abre a sua ficha no celular: você atualiza os dados e anexa as fotos por lá mesmo.
  </p>
  <p style="margin:0;font-size:14px;line-height:1.6;color:#5a636e;">
    Se alguma coisa dessa lista você já entregou em papel, responda este e-mail que a gente acerta.
  </p>
  <p style="margin:26px 0 0;padding-top:16px;border-top:1px solid #e9ecef;font-size:12px;color:#8a929c;">RH — ${marca}</p>
</td></tr></table></body></html>`;

  return { assunto, texto, html };
}

export type ResultadoCobrancaCadastro = {
  /** Fichas ativas com pelo menos um canal (Telegram ou e-mail) que o motor olhou. */
  avaliados: number;
  /** Dessas, quantas têm algo faltando. */
  incompletos: number;
  /** Pessoas cobradas — uma por pessoa, mesmo quando saiu pelos dois canais. */
  enviados: number;
  porTelegram: number;
  porEmail: number;
  /** Cobrados há menos de DIAS_ENTRE_COBRANCAS — a vez deles é na próxima rodada. */
  aguardandoPrazo: number;
  /** Já receberam MAX_COBRANCAS e continuam incompletos: agora é caso do RH. */
  esgotados: number;
  /** E-mails não enviados para preservar a cota do dia (ver RESERVA_DE_EMAILS). */
  emailAdiado: number;
  /** Ninguém foi alcançado: os canais disponíveis falharam. */
  erros: number;
};

/** O que o motor precisa saber de uma pessoa para montar e entregar a cobrança. */
type PessoaParaCobrar = FichaParaCobranca & {
  id: string;
  nome: string;
  empresaId: string;
  telegramChatId: string | null;
  empresa: { marca: { nome: string } };
};

/**
 * A entrega em si, nos dois canais — o único lugar do sistema que manda esta
 * cobrança. Cron e botão da tela passam por aqui, senão as duas versões da
 * mensagem divergiriam na primeira vez que alguém mexesse em uma delas.
 *
 * Devolve os canais que ACEITARAM. Vazio significa que ninguém foi alcançado, e
 * quem chama decide o que fazer com isso (o cron não gasta rodada; a tela avisa
 * quem clicou).
 *
 * `orcamento` entra e sai por referência de propósito: numa rodada de centenas
 * de pessoas, consultar o teto de e-mail a cada uma seria uma ida ao banco por
 * envio, para um número que mal muda entre elas.
 */
async function entregar(
  pessoa: PessoaParaCobrar,
  itens: string[],
  rodada: number,
  orcamento: { restante: number; respeitarReserva: boolean },
): Promise<string[]> {
  const canais: string[] = [];

  if (pessoa.telegramChatId) {
    const r = await sendTelegramMessage(pessoa.telegramChatId, montarMensagem(pessoa.nome, itens, rodada));
    if (r.ok) canais.push("TELEGRAM");
  }

  if (pessoa.email) {
    // A reserva protege a cota de quem não pode esperar (convite de pesquisa,
    // cobrança do RH) de uma varredura da base inteira. Um clique avulso não é
    // varredura: é um e-mail, decidido por uma pessoa, e não vale bloqueá-lo
    // por um teto que existe para conter volume. O teto REAL do provedor
    // continua valendo — quem o aplica é sendEmail, não esta função.
    const semOrcamento = orcamento.respeitarReserva
      ? orcamento.restante <= RESERVA_DE_EMAILS
      : orcamento.restante <= 0;

    if (!semOrcamento) {
      const { assunto, texto, html } = montarEmail(pessoa.nome, itens, rodada, pessoa.empresa.marca.nome);
      const diaChave = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
      const r = await sendEmail({
        to: pessoa.email,
        subject: assunto,
        text: texto,
        html,
        fromName: `RH ${pessoa.empresa.marca.nome}`,
        // Uma cobrança por pessoa por dia POR ORIGEM: sem separar cron de
        // clique, o botão da tela seria engolido pelo dedupe do e-mail que o
        // cron mandou de manhã — e quem clicou juraria que o sistema não faz
        // nada. `rodada` no meio faz a 2ª cobrança do mesmo dia sair.
        chave: `cobranca-cadastro:${orcamento.respeitarReserva ? "cron" : "manual"}:${pessoa.id}:${rodada}:${diaChave}`,
      });
      if (r.ok) {
        canais.push("EMAIL");
        if (!r.deduplicado) orcamento.restante--;
      } else if (r.motivo === "COTA") {
        // Sem cota não adianta seguir tentando: o resto do laço só produziria
        // recusas. O Telegram continua normalmente.
        orcamento.restante = 0;
      }
    }
  }

  return canais;
}

/** O histórico de uma pessoa, com as duas contagens que decidem coisas diferentes. */
type HistoricoDaPessoa = {
  /** Só as automáticas — é o que o teto e o relógio enxergam. */
  automaticas: number;
  ultimaAutomatica: Date | null;
  /** Todas, para numerar a rodada seguinte na sequência que o RH lê. */
  total: number;
};

async function historicoPorPessoa(
  cliente: Cliente,
  colaboradorIds: string[],
): Promise<Map<string, HistoricoDaPessoa>> {
  const linhas = await cliente.cobrancaCadastro.findMany({
    where: { colaboradorId: { in: colaboradorIds } },
    select: { colaboradorId: true, enviadaEm: true, manual: true },
  });

  const mapa = new Map<string, HistoricoDaPessoa>();
  for (const l of linhas) {
    const atual = mapa.get(l.colaboradorId) ?? { automaticas: 0, ultimaAutomatica: null, total: 0 };
    atual.total++;
    if (!l.manual) {
      atual.automaticas++;
      if (!atual.ultimaAutomatica || l.enviadaEm > atual.ultimaAutomatica) atual.ultimaAutomatica = l.enviadaEm;
    }
    mapa.set(l.colaboradorId, atual);
  }
  return mapa;
}

/** Os campos que `entregar` e a montagem das mensagens precisam ler da ficha. */
const SELECAO_DA_COBRANCA = {
  id: true,
  nome: true,
  empresaId: true,
  telegramChatId: true,
  email: true,
  telefone: true,
  rg: true,
  logradouro: true,
  numeroEndereco: true,
  bairro: true,
  uf: true,
  documentos: { select: { tipo: true } },
  // Para assinar o e-mail com a marca certa (ver montarEmail).
  empresa: { select: { marca: { select: { nome: true } } } },
} as const;

export type ResultadoCobrancaManual = {
  colaboradorId: string;
  /**
   * A empresa DA PESSOA, que pode não ser a da tela: a lista de colaboradores
   * mostra todas as empresas visíveis. Quem registra a trilha precisa disto —
   * gravar tudo sob a empresa da rota esconderia o envio da trilha da empresa
   * a que a pessoa pertence, que é justamente onde alguém procuraria.
   */
  empresaId: string;
  nome: string;
  enviado: boolean;
  canais: string[];
  /** Por que não saiu, quando não saiu — texto para a tela mostrar. */
  motivo?: string;
};

/**
 * Cobrança avulsa, disparada por alguém do RH pela tela.
 *
 * IGNORA a trava de DIAS_ENTRE_COBRANCAS e o teto de MAX_COBRANCAS de
 * propósito: se uma pessoa do RH clicou, é porque decidiu cobrar — inclusive
 * quando o pedido veio do próprio colaborador ("manda de novo, apaguei sem
 * querer"). O que ela NÃO faz é gastar rodada da campanha automática nem adiar
 * a próxima: a linha entra com `manual = true`, e o cron não a enxerga.
 *
 * O que continua valendo, porque não é trava e sim ausência de assunto: quem
 * está com a ficha completa não é cobrado (não há o que pedir), e quem não tem
 * canal nenhum não tem como ser alcançado.
 */
export async function cobrarCadastroAgora(
  colaboradorIds: string[],
  solicitadaPorNome: string,
  cliente: Cliente = prisma,
  hoje: Date = new Date(),
): Promise<ResultadoCobrancaManual[]> {
  if (colaboradorIds.length === 0) return [];

  const pessoas = await cliente.colaborador.findMany({
    where: { id: { in: colaboradorIds } },
    select: SELECAO_DA_COBRANCA,
  });

  const historico = await historicoPorPessoa(cliente, pessoas.map((p) => p.id));
  const orcamento = { restante: await orcamentoRestanteHoje(), respeitarReserva: false };
  const resultados: ResultadoCobrancaManual[] = [];

  for (const pessoa of pessoas) {
    const itens = [...faltasNaFicha(pessoa), ...documentosFaltando(pessoa.documentos.map((d) => d.tipo))];

    if (itens.length === 0) {
      resultados.push({
        colaboradorId: pessoa.id,
        empresaId: pessoa.empresaId,
        nome: pessoa.nome,
        enviado: false,
        canais: [],
        motivo: "Cadastro completo — não há o que cobrar.",
      });
      continue;
    }
    if (!pessoa.telegramChatId && !pessoa.email) {
      resultados.push({
        colaboradorId: pessoa.id,
        empresaId: pessoa.empresaId,
        nome: pessoa.nome,
        enviado: false,
        canais: [],
        motivo: "Sem Telegram e sem e-mail — não há por onde falar com esta pessoa.",
      });
      continue;
    }

    const rodada = (historico.get(pessoa.id)?.total ?? 0) + 1;

    try {
      const canais = await entregar(pessoa, itens, rodada, orcamento);
      if (canais.length === 0) {
        resultados.push({
          colaboradorId: pessoa.id,
        empresaId: pessoa.empresaId,
          nome: pessoa.nome,
          enviado: false,
          canais: [],
          motivo: "Nenhum canal aceitou o envio — confira o bot e o SMTP em Canais de envio.",
        });
        continue;
      }

      await cliente.cobrancaCadastro.create({
        data: {
          colaboradorId: pessoa.id,
          empresaId: pessoa.empresaId,
          rodada,
          itens: itens.join(" · ").slice(0, 500),
          canais: canais.join(","),
          manual: true,
          solicitadaPorNome,
          enviadaEm: hoje,
        },
      });
      resultados.push({
        colaboradorId: pessoa.id,
        empresaId: pessoa.empresaId,
        nome: pessoa.nome,
        enviado: true,
        canais,
      });
    } catch (e) {
      resultados.push({
        colaboradorId: pessoa.id,
        empresaId: pessoa.empresaId,
        nome: pessoa.nome,
        enviado: false,
        canais: [],
        motivo: e instanceof Error ? e.message : "Falha inesperada no envio.",
      });
    }
  }

  return resultados;
}

/**
 * Roda 1×/dia (horário em Configuração → Lembretes). Não é uma escada de dias
 * como a régua de pesquisa: aqui não existe "dia 3 da campanha" — cada pessoa
 * tem o próprio relógio, contado da última cobrança que ela recebeu.
 *
 * @param apenas Restringe a estes colaboradorIds. Existe para o smoke: sem
 *   isto, rodar o teste dispararia mensagem de Telegram REAL para a base
 *   inteira — mesmo risco que scripts/smoke-regua-cobranca.ts documenta, e que
 *   já custou 15 e-mails indevidos em 04/08/2026.
 */
export async function executarCobrancaCadastro(
  cliente: Cliente = prisma,
  hoje: Date = new Date(),
  apenas?: string[],
): Promise<ResultadoCobrancaCadastro> {
  const candidatos = await cliente.colaborador.findMany({
    where: {
      ativo: true,
      // Pelo menos um canal por onde falar. Quem não tem nenhum não some do
      // radar: continua na pendência do RH (`cadastrosIncompletos` e
      // `semTelegram`), que é de quem passou a ser o caso.
      OR: [
        { AND: [{ telegramChatId: { not: null } }, { NOT: { telegramChatId: "" } }] },
        { AND: [{ email: { not: null } }, { NOT: { email: "" } }] },
      ],
      // Quem está de aviso prévio não é cobrado a completar cadastro: o
      // processo dessa pessoa agora é a saída, e o que falta ali o RH resolve
      // no desligamento. Cobrar seria ruído no pior momento possível.
      dataDesligamento: null,
      ...(apenas ? { id: { in: apenas } } : {}),
    },
    select: SELECAO_DA_COBRANCA,
  });

  const pendentes = candidatos
    .map((c) => ({
      pessoa: c,
      itens: [...faltasNaFicha(c), ...documentosFaltando(c.documentos.map((d) => d.tipo))],
    }))
    .filter((p) => p.itens.length > 0);

  // Histórico de todos os pendentes numa consulta só — uma por pessoa daria
  // centenas de idas ao banco numa base de mil fichas.
  const porPessoa = await historicoPorPessoa(cliente, pendentes.map((p) => p.pessoa.id));

  let enviados = 0;
  let porTelegram = 0;
  let porEmail = 0;
  let aguardandoPrazo = 0;
  let esgotados = 0;
  let emailAdiado = 0;
  let erros = 0;

  // Orçamento lido UMA vez, antes do laço, e descontado à mão a cada envio: uma
  // consulta por pessoa seria uma ida ao banco por e-mail, e o valor mal teria
  // mudado entre elas. A conta local pode ficar um pouco defasada se outro
  // processo mandar e-mail no meio — daí a reserva, que absorve a diferença.
  const orcamento = { restante: await orcamentoRestanteHoje(), respeitarReserva: true };

  for (const { pessoa, itens } of pendentes) {
    const anterior = porPessoa.get(pessoa.id);

    // As duas travas leem SÓ o histórico automático (ver historicoPorPessoa):
    // uma cobrança que o RH disparou à mão não pode encurtar a campanha desta
    // pessoa nem adiar a próxima rodada dela.
    if (anterior && anterior.automaticas > 0) {
      if (anterior.automaticas >= MAX_COBRANCAS) {
        esgotados++;
        continue;
      }
      const dias = (hoje.getTime() - anterior.ultimaAutomatica!.getTime()) / (24 * 60 * 60 * 1000);
      if (dias < DIAS_ENTRE_COBRANCAS) {
        aguardandoPrazo++;
        continue;
      }
    }

    // A rodada numera pelo TOTAL, não pelas automáticas: é o número que o RH lê
    // no histórico, e pular de 1 para 1 porque houve uma manual no meio faria a
    // lista parecer defeituosa.
    const rodada = (anterior?.total ?? 0) + 1;

    try {
      const canais = await entregar(pessoa, itens, rodada, orcamento);

      if (canais.includes("TELEGRAM")) porTelegram++;
      if (canais.includes("EMAIL")) porEmail++;
      // Tinha e-mail, não saiu, e o que sobrou de cota está no piso: ou a
      // reserva segurou, ou a cota acabou no meio da rodada. Nos dois casos é
      // ADIAMENTO — sai na próxima —, e não erro.
      //
      // A condição é o patamar da cota, não "o orçamento mudou": endereço
      // inválido, na lista de supressão ou SMTP fora do ar também deixam o
      // orçamento intacto, e contá-los como adiados esconderia defeito de
      // configuração atrás de um número que parece normal.
      else if (pessoa.email && orcamento.restante <= RESERVA_DE_EMAILS) emailAdiado++;

      // Nenhum canal entregou: não gasta rodada. A pessoa não recebeu nada, e
      // gravar aqui a faria esperar três dias por uma mensagem que nunca saiu.
      if (canais.length === 0) {
        erros++;
        continue;
      }

      await cliente.cobrancaCadastro.create({
        data: {
          colaboradorId: pessoa.id,
          empresaId: pessoa.empresaId,
          rodada,
          itens: itens.join(" · ").slice(0, 500),
          canais: canais.join(","),
          enviadaEm: hoje,
        },
      });
      enviados++;
    } catch {
      erros++;
    }
  }

  return {
    avaliados: candidatos.length,
    incompletos: pendentes.length,
    enviados,
    porTelegram,
    porEmail,
    aguardandoPrazo,
    esgotados,
    emailAdiado,
    erros,
  };
}
