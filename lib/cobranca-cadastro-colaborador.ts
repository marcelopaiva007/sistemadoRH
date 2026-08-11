// Cobrança de CADASTRO do colaborador, pelo Telegram — a terceira cobrança do
// sistema, e a primeira que fala com a pessoa sobre a própria ficha. As outras
// duas, para não confundir:
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
// 2. Só Telegram, sem cair para e-mail. Foi o canal pedido, e o e-mail tem teto
//    diário apertado (LIMITE_DIARIO_ENVIOS) que uma campanha para a base
//    inteira estoura sozinha — em 28/07/2026 uma campanha de portal comeu a
//    cota do dia em 8 segundos e derrubou os convites. Quem não tem Telegram
//    vinculado já é cobrado do RH pela pendência `semTelegram`, que existe
//    exatamente para isso.
//
// 3. Cadência semanal com fim. Diário como a cobrança do RH não cabe aqui:
//    juntar documento leva dias, e mensagem diária de robô vira bloqueio do
//    bot — perde-se o canal inteiro, não só esta cobrança. São no máximo
//    MAX_COBRANCAS envios, um por semana; depois disso o silêncio é resposta e
//    o caso volta a ser do RH, que continua vendo a ficha na tela de
//    pendências.
import { prisma, type Cliente } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";

/** Uma cobrança por semana, no máximo. */
export const DIAS_ENTRE_COBRANCAS = 7;

/** Depois de 4 (≈1 mês de tentativas), para de insistir. */
export const MAX_COBRANCAS = 4;

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

export type ResultadoCobrancaCadastro = {
  /** Fichas ativas com Telegram que o motor olhou. */
  avaliados: number;
  /** Dessas, quantas têm algo faltando. */
  incompletos: number;
  enviados: number;
  /** Cobrados há menos de DIAS_ENTRE_COBRANCAS — a vez deles é semana que vem. */
  aguardandoPrazo: number;
  /** Já receberam MAX_COBRANCAS e continuam incompletos: agora é caso do RH. */
  esgotados: number;
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
      telegramChatId: { not: null },
      NOT: { telegramChatId: "" },
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
  let aguardandoPrazo = 0;
  let esgotados = 0;
  let erros = 0;

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
      const envio = await sendTelegramMessage(
        pessoa.telegramChatId!,
        montarMensagem(pessoa.nome, itens, rodada),
      );
      if (!envio.ok) {
        erros++;
        continue;
      }

      // Só grava depois do envio confirmado. Gravar antes gastaria a rodada de
      // uma pessoa que não recebeu nada — e ela ficaria uma semana esperando
      // uma mensagem que o Telegram recusou.
      await cliente.cobrancaCadastro.create({
        data: {
          colaboradorId: pessoa.id,
          empresaId: pessoa.empresaId,
          rodada,
          itens: itens.join(" · ").slice(0, 500),
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
    aguardandoPrazo,
    esgotados,
    erros,
  };
}
