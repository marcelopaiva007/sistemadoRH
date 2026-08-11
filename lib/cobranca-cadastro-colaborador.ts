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
  bancoNome: string | null;
  bancoAgencia: string | null;
  bancoConta: string | null;
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
  if (c.bancoNome === null || c.bancoAgencia === null || c.bancoConta === null) {
    faltas.push("Dados bancários para o pagamento");
  }

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
    select: {
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
      bancoNome: true,
      bancoAgencia: true,
      bancoConta: true,
      documentos: { select: { tipo: true } },
      // Para assinar o e-mail com a marca certa (ver montarEmail).
      empresa: { select: { marca: { select: { nome: true } } } },
    },
  });

  const pendentes = candidatos
    .map((c) => ({
      pessoa: c,
      itens: [...faltasNaFicha(c), ...documentosFaltando(c.documentos.map((d) => d.tipo))],
    }))
    .filter((p) => p.itens.length > 0);

  // Histórico de todos os pendentes numa consulta só — uma por pessoa daria
  // centenas de idas ao banco numa base de mil fichas.
  const historico = await cliente.cobrancaCadastro.findMany({
    where: { colaboradorId: { in: pendentes.map((p) => p.pessoa.id) } },
    select: { colaboradorId: true, enviadaEm: true },
  });
  const porPessoa = new Map<string, { rodadas: number; ultima: Date }>();
  for (const h of historico) {
    const atual = porPessoa.get(h.colaboradorId);
    porPessoa.set(h.colaboradorId, {
      rodadas: (atual?.rodadas ?? 0) + 1,
      ultima: atual && atual.ultima > h.enviadaEm ? atual.ultima : h.enviadaEm,
    });
  }

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
  let orcamento = await orcamentoRestanteHoje();
  const diaChave = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(hoje);

  for (const { pessoa, itens } of pendentes) {
    const anterior = porPessoa.get(pessoa.id);

    if (anterior) {
      if (anterior.rodadas >= MAX_COBRANCAS) {
        esgotados++;
        continue;
      }
      const dias = (hoje.getTime() - anterior.ultima.getTime()) / (24 * 60 * 60 * 1000);
      if (dias < DIAS_ENTRE_COBRANCAS) {
        aguardandoPrazo++;
        continue;
      }
    }

    const rodada = (anterior?.rodadas ?? 0) + 1;

    try {
      // Os dois canais na mesma rodada, cada um valendo por si: Telegram fora
      // do ar não pode impedir o e-mail de sair, nem o contrário.
      const canais: string[] = [];

      if (pessoa.telegramChatId) {
        const r = await sendTelegramMessage(pessoa.telegramChatId, montarMensagem(pessoa.nome, itens, rodada));
        if (r.ok) {
          canais.push("TELEGRAM");
          porTelegram++;
        }
      }

      if (pessoa.email) {
        if (orcamento <= RESERVA_DE_EMAILS) {
          emailAdiado++;
        } else {
          const { assunto, texto, html } = montarEmail(pessoa.nome, itens, rodada, pessoa.empresa.marca.nome);
          const r = await sendEmail({
            to: pessoa.email,
            subject: assunto,
            text: texto,
            html,
            fromName: `RH ${pessoa.empresa.marca.nome}`,
            // Uma cobrança por pessoa por dia, mesmo se o cron for disparado à
            // mão mais de uma vez — a trava de DIAS_ENTRE_COBRANCAS só é
            // consultada no início da rodada e não protege contra isso.
            chave: `cobranca-cadastro:${pessoa.id}:${diaChave}`,
          });
          if (r.ok) {
            canais.push("EMAIL");
            porEmail++;
            if (!r.deduplicado) orcamento--;
          } else if (r.motivo === "COTA") {
            // Sem cota não adianta seguir tentando: o resto do laço só
            // produziria recusas. O Telegram continua normalmente.
            orcamento = 0;
            emailAdiado++;
          }
        }
      }

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
