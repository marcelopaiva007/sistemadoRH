// Avisos automáticos para o GESTOR sobre o time dele.
//
// QUEM É O GESTOR AQUI. Não é um usuário do sistema: `User` não tem vínculo
// nenhum com `Colaborador`, e não existe login com papel de gestor de setor
// (ver o comentário em app/(app)/rh/[empresaId]/time/page.tsx). O gestor é um
// COLABORADOR que tem outros apontando para ele em `supervisorId` — a mesma
// definição que o portal já usa para montar "Meu time". É por isso que o aviso
// sai por Telegram, e não por uma tela: o Telegram é o canal que alcança essa
// pessoa hoje, sem depender de decisão nenhuma sobre cadastro de usuários.
//
// POR QUE NÃO É "TEMPO REAL". O plano dizia "alertas em tempo real". Nesta
// arquitetura não existe processo vivo escutando o banco — o que existe é cron
// a cada 15 minutos. Chamar isso de tempo real seria vender o que não é: um
// contrato que vence amanhã não precisa de aviso em milissegundos, precisa de
// aviso ANTES. A promessa honesta é "no mesmo dia".
//
// O QUE ENTRA. Só o que o gestor decide, com data e consequência:
//   1. Contrato por prazo vencendo — quem decide efetivar é ele, e passar da
//      data converte o contrato em indeterminado por omissão;
//   2. Férias a vencer — quem programa é ele, e vencer custa em dobro;
//   3. Hora extra acima do limite do mês — o custo é do centro de custo dele.
//
// O QUE NÃO ENTRA, de propósito: nada que seja assunto do DP (CPF faltando,
// dado bancário, documento do dossiê). O gestor não resolve isso, e cada aviso
// que ele não pode resolver ensina a ignorar os que ele pode.

import { prisma, type Cliente } from "@/lib/prisma";
import { CONTRATOS_POR_PRAZO } from "@/lib/constants-dp";
import { LIMITE_HORAS_EXTRAS_MES, RUBRICAS_HORA_EXTRA } from "@/lib/constants-folha";
import { calcularFerias } from "@/lib/ferias";
import { diferencaEmDiasUTC, formatarData, hojeUTC, somarDiasUTC } from "@/lib/datas";
import { sendTelegramMessage } from "@/lib/telegram";

/**
 * Só avisa de contrato quando falta ISTO ou menos.
 *
 * 30 e não os 60 de `DIAS_ALERTA_VENCIMENTO` (que é a régua do RH, para ASO e
 * certificado): o gestor decide efetivar perto do fim, com o desempenho já
 * observado. Avisado com 60 dias ele arquiva e esquece — e a data passa.
 */
export const DIAS_AVISO_CONTRATO = 30;

/**
 * Só avisa de férias quando falta ISTO ou menos.
 *
 * 45, e não os 90 de `DIAS_ALERTA_FERIAS`. Aquele é a régua da TELA de Férias,
 * onde o RH olha a lista quando quer — aqui é um empurrão no Telegram que se
 * repete a cada `DIAS_ENTRE_AVISOS`. Começando a 90 dias, o gestor receberia a
 * mesma linha umas 12 vezes antes de a data chegar, e passaria a ignorar o bot
 * — a falha cara deste recurso, porque o aviso continua saindo e ninguém lê.
 *
 * 45 dá tempo de programar férias sem virar goteira, e é o mesmo raciocínio do
 * contrato acima: avisar cedo demais é avisar para ser arquivado.
 *
 * Férias JÁ VENCIDAS ignoram este corte — ver o uso abaixo.
 */
export const DIAS_AVISO_FERIAS = 45;

/**
 * Intervalo mínimo entre dois avisos do MESMO assunto sobre a MESMA pessoa.
 *
 * Sem isto o cron avisaria todo dia sobre o mesmo contrato até a data chegar, e
 * o gestor aprenderia a ignorar o bot — que é a única forma de falha realmente
 * cara aqui: o aviso continua saindo, e ninguém mais lê.
 */
export const DIAS_ENTRE_AVISOS = 7;

export type TipoAviso = "CONTRATO_VENCENDO" | "FERIAS_VENCENDO" | "HORA_EXTRA_ACIMA";

/** Um assunto sobre uma pessoa do time. */
export type ItemDeAviso = {
  tipo: TipoAviso;
  colaboradorId: string;
  colaboradorNome: string;
  /** A linha que o gestor lê, já pronta. */
  texto: string;
};

export type AvisoDoGestor = {
  gestorId: string;
  gestorNome: string;
  /** Null quando o gestor não tem Telegram — o aviso não sai, e isso é contado. */
  telegramChatId: string | null;
  itens: ItemDeAviso[];
};

export type ResultadoAvisoGestor = {
  /** Gestores com pelo menos uma pessoa apontando para eles. */
  gestoresAvaliados: number;
  /** Gestores que tinham algo a receber. */
  comItens: number;
  enviados: number;
  /** Tinha aviso mas não tem Telegram — vira pendência do RH, não some. */
  semCanal: number;
  /** Itens suprimidos por já terem sido avisados dentro de DIAS_ENTRE_AVISOS. */
  silenciados: number;
  erros: number;
  /** Em simulação, o que SAIRIA. Vazio no envio real. */
  simulacao: { gestor: string; mensagem: string }[];
};

/**
 * "MARCELO" -> "Marcelo". O cadastro guarda nome em maiúsculas, e numa
 * saudação pessoal isso soa como grito.
 */
function comoSeChama(nome: string): string {
  const primeiro = nome.trim().split(/\s+/)[0] ?? "";
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase();
}

/** Monta a mensagem do Telegram. Uma só por gestor, com tudo do time dele. */
export function montarMensagemDoGestor(gestorNome: string, itens: ItemDeAviso[]): string {
  const primeiroNome = comoSeChama(gestorNome);
  const linhas = itens.map((i) => `• ${i.texto}`).join("\n");
  return (
    `Olá, ${primeiroNome}. Sobre o seu time:\n\n${linhas}\n\n` +
    `Se algum destes já foi resolvido, fale com o RH — este aviso é automático e ` +
    `se repete a cada ${DIAS_ENTRE_AVISOS} dias enquanto a situação continuar.`
  );
}

/**
 * Levanta o que cada gestor precisa saber. Não envia nada — separado do envio
 * de propósito, para que a simulação exercite exatamente a mesma regra que o
 * envio real usa.
 */
export async function levantarAvisos(
  cliente: Cliente = prisma,
  hoje: Date = hojeUTC(),
  /**
   * Recorte de empresas. O CRON roda sem isto, de propósito: ele varre o grupo
   * inteiro, como as demais rotinas. Já a TELA passa `empresasVisiveis` — sem
   * o recorte, ela exibiria nome de colaborador de empresa que quem abriu não
   * enxerga, o que é vazamento por descuido, não funcionalidade.
   */
  empresaIds?: string[],
): Promise<AvisoDoGestor[]> {
  const limiteContrato = somarDiasUTC(hoje, DIAS_AVISO_CONTRATO);
  const escopo = empresaIds ? { empresaId: { in: empresaIds } } : {};

  // Só quem TEM subordinado ativo é gestor. `supervisorId` é a mesma definição
  // do portal (app/portal/page.tsx) e de lib/meu-time.ts — as três leituras
  // precisam concordar sobre quem lidera quem.
  const liderados = await cliente.colaborador.findMany({
    where: { ativo: true, supervisorId: { not: null }, ...escopo },
    select: {
      id: true,
      nome: true,
      supervisorId: true,
      tipoContrato: true,
      dataFimContrato: true,
      dataAdmissao: true,
      // Período aquisitivo NÃO é tabela: `calcularFerias` o deriva da admissão
      // mais o histórico de solicitações. Ler de um modelo inventado daria
      // número diferente do que a tela de Férias mostra — e dois números para
      // a mesma pergunta é pior que número nenhum.
      ferias: {
        select: { periodoAquisitivoInicio: true, dias: true, diasAbono: true, status: true },
      },
    },
  });
  if (liderados.length === 0) return [];

  const gestores = await cliente.colaborador.findMany({
    where: { id: { in: [...new Set(liderados.map((l) => l.supervisorId!))] }, ativo: true },
    select: { id: true, nome: true, telegramChatId: true },
  });
  const porGestor = new Map(gestores.map((g) => [g.id, g]));

  // Hora extra do mês aberto, numa consulta só: uma por pessoa daria N
  // consultas num laço, que é como esta tela ficaria lenta sem ninguém notar.
  const horasExtras = await cliente.eventoFolha.groupBy({
    by: ["colaboradorId"],
    where: {
      colaboradorId: { in: liderados.map((l) => l.id) },
      tipo: { in: [...RUBRICAS_HORA_EXTRA] },
      competencia: { status: "ABERTA" },
    },
    _sum: { quantidade: true },
  });
  const horasPorColaborador = new Map(
    horasExtras.map((h) => [h.colaboradorId, h._sum.quantidade ?? 0]),
  );

  const avisosPorGestor = new Map<string, ItemDeAviso[]>();
  const somar = (gestorId: string, item: ItemDeAviso) => {
    const atual = avisosPorGestor.get(gestorId) ?? [];
    atual.push(item);
    avisosPorGestor.set(gestorId, atual);
  };

  for (const l of liderados) {
    const gestorId = l.supervisorId!;
    if (!porGestor.has(gestorId)) continue;
    // Ninguém é gestor de si mesmo. Sem esta linha, uma ficha com
    // `supervisorId` apontando para ela própria geraria aviso em looping.
    if (gestorId === l.id) continue;

    if (
      l.dataFimContrato &&
      CONTRATOS_POR_PRAZO.includes(l.tipoContrato as (typeof CONTRATOS_POR_PRAZO)[number]) &&
      l.dataFimContrato <= limiteContrato &&
      l.dataFimContrato >= hoje
    ) {
      const dias = diferencaEmDiasUTC(hoje, l.dataFimContrato);
      somar(gestorId, {
        tipo: "CONTRATO_VENCENDO",
        colaboradorId: l.id,
        colaboradorNome: l.nome,
        texto:
          `${l.nome}: contrato de ${l.tipoContrato?.toLowerCase()} termina em ` +
          `${formatarData(l.dataFimContrato)} (${dias} dia(s)). Sem decisão até lá, ` +
          `o contrato passa a valer por prazo indeterminado.`,
      });
    }

    // `temVencendo` é a mesma régua da tela de Férias (DIAS_ALERTA_FERIAS, 90
    // dias). Vencido TAMBÉM entra: já custa em dobro, e não avisar o gestor
    // sobre o caso mais caro seria o inverso do propósito.
    if (l.dataAdmissao) {
      const resumo = calcularFerias(l.dataAdmissao, l.ferias, hoje);
      const urgente = resumo.periodoMaisUrgente;
      // Vencido entra SEMPRE (já custa em dobro; não avisar o caso mais caro
      // seria o inverso do propósito). A vencer, só dentro de
      // DIAS_AVISO_FERIAS — ver o comentário da constante.
      const noPrazoDeAviso =
        urgente !== null &&
        (urgente.diasAteLimite < 0 || urgente.diasAteLimite <= DIAS_AVISO_FERIAS);
      if (urgente && noPrazoDeAviso && (resumo.temVencendo || resumo.temVencido)) {
        somar(gestorId, {
          tipo: "FERIAS_VENCENDO",
          colaboradorId: l.id,
          colaboradorNome: l.nome,
          texto:
            urgente.diasAteLimite < 0
              ? `${l.nome}: férias VENCIDAS desde ${formatarData(urgente.limiteConcessivo)}. ` +
                `O pagamento já é em dobro.`
              : `${l.nome}: férias precisam ser gozadas até ` +
                `${formatarData(urgente.limiteConcessivo)} (${urgente.diasAteLimite} dia(s)). ` +
                `Passando disso, o pagamento é em dobro.`,
        });
      }
    }

    const horas = horasPorColaborador.get(l.id) ?? 0;
    if (horas > LIMITE_HORAS_EXTRAS_MES) {
      somar(gestorId, {
        tipo: "HORA_EXTRA_ACIMA",
        colaboradorId: l.id,
        colaboradorNome: l.nome,
        texto:
          `${l.nome}: ${horas}h de hora extra na competência aberta, acima do limite de ` +
          `${LIMITE_HORAS_EXTRAS_MES}h no mês.`,
      });
    }
  }

  return [...avisosPorGestor.entries()].map(([gestorId, itens]) => {
    const g = porGestor.get(gestorId)!;
    return {
      gestorId,
      gestorNome: g.nome,
      telegramChatId: g.telegramChatId?.trim() || null,
      // Ordem estável: contrato primeiro, que é o que tem data fatal.
      itens: itens.sort((a, b) => a.tipo.localeCompare(b.tipo)),
    };
  });
}

/**
 * Executa os avisos.
 *
 * SIMULA POR PADRÃO. Este motor manda mensagem para pessoas: uma regra errada
 * não produz tela feia, produz a chefia inteira recebendo aviso indevido — e
 * mensagem enviada não volta. `enviar: true` é decisão explícita de quem já
 * olhou a saída da simulação. Mesmo padrão de scripts/migrar-sinal-uppercase.ts.
 */
export async function executarAvisosDoGestor(
  opcoes: { enviar?: boolean; cliente?: Cliente; hoje?: Date } = {},
): Promise<ResultadoAvisoGestor> {
  const cliente = opcoes.cliente ?? prisma;
  const hoje = opcoes.hoje ?? hojeUTC();
  const enviar = opcoes.enviar ?? false;

  const avisos = await levantarAvisos(cliente, hoje);
  const resultado: ResultadoAvisoGestor = {
    gestoresAvaliados: avisos.length,
    comItens: 0,
    enviados: 0,
    semCanal: 0,
    silenciados: 0,
    erros: 0,
    simulacao: [],
  };

  const desde = somarDiasUTC(hoje, -DIAS_ENTRE_AVISOS);
  // Um SELECT só para todo o silenciamento — mesmo motivo do groupBy acima.
  const jaAvisados = await cliente.avisoGestor.findMany({
    where: { enviadoEm: { gte: desde } },
    select: { gestorId: true, colaboradorId: true, tipo: true },
  });
  const silencio = new Set(
    jaAvisados.map((a) => `${a.gestorId}|${a.colaboradorId}|${a.tipo}`),
  );

  for (const aviso of avisos) {
    const novos = aviso.itens.filter(
      (i) => !silencio.has(`${aviso.gestorId}|${i.colaboradorId}|${i.tipo}`),
    );
    resultado.silenciados += aviso.itens.length - novos.length;
    if (novos.length === 0) continue;

    resultado.comItens += 1;
    const mensagem = montarMensagemDoGestor(aviso.gestorNome, novos);

    if (!aviso.telegramChatId) {
      // Não some do radar: continua na pendência `semTelegram` do RH, que é de
      // quem o caso passou a ser.
      resultado.semCanal += 1;
      continue;
    }

    if (!enviar) {
      resultado.simulacao.push({ gestor: aviso.gestorNome, mensagem });
      continue;
    }

    const envio = await sendTelegramMessage(aviso.telegramChatId, mensagem);
    if (!envio.ok) {
      resultado.erros += 1;
      continue;
    }
    resultado.enviados += 1;

    // Registrado DEPOIS do envio aceito, nunca antes: gravar primeiro e falhar
    // no envio silenciaria por 7 dias um aviso que ninguém recebeu.
    await cliente.avisoGestor.createMany({
      data: novos.map((i) => ({
        gestorId: aviso.gestorId,
        colaboradorId: i.colaboradorId,
        tipo: i.tipo,
      })),
    });
  }

  return resultado;
}
