// A máquina de estados do módulo Delegações — e as 6 regras invioláveis, em
// código PURO (sem banco, sem sessão): recebe o retrato da demanda e quem está
// agindo, devolve "pode" ou "não pode, e por quê". As actions
// (lib/actions/delegacoes.ts) só executam o que este arquivo autorizou, e é
// isto que scripts/test-delegacoes.ts prova sem precisar de banco.
//
// Por que puro e centralizado: a regra mais importante do módulo — "o
// responsável NUNCA encerra a própria demanda" — é exatamente a classe de
// regra que morre quando cada action reimplementa o próprio pedaço dela. Aqui
// a tabela de transições diz DE ONDE, PARA ONDE e QUEM, num lugar só; uma
// action que tentasse encerrar como responsável não tem como passar.
//
// O diagrama (ordem de implementação, §4):
//
//   RASCUNHO ─► ENVIADA ─► ACEITA ─► EM_EXECUCAO ─► ENTREGUE ─► ENCERRADA
//                  │           │            │            │
//                  │           └── repactuação ──────────┘  (muda prazo,
//                  │                                         mantém status)
//                  └─► CANCELADA          ENTREGUE ─devolver─► EM_EXECUCAO
//
// `emRisco` é FLAG, não status — liga/desliga em ACEITA e EM_EXECUCAO sem
// mudar de estado.

// ── Domínios ────────────────────────────────────────────────────────────────

export const STATUS_DEMANDA = [
  "RASCUNHO",
  "ENVIADA",
  "ACEITA",
  "EM_EXECUCAO",
  "ENTREGUE",
  "ENCERRADA",
  "CANCELADA",
] as const;
export type StatusDemanda = (typeof STATUS_DEMANDA)[number];

/** Estados terminais: deles não se sai — nem para cancelar. */
export const STATUS_TERMINAIS: StatusDemanda[] = ["ENCERRADA", "CANCELADA"];

/** Estados em que a cobrança está viva (o cron olha para estes). */
export const STATUS_ATIVOS: StatusDemanda[] = ["ENVIADA", "ACEITA", "EM_EXECUCAO", "ENTREGUE"];

/**
 * Estados em que o responsável está COM a bola — onde entrega é permitida e
 * `emRisco` pode ligar. ENVIADA fica de fora dos dois de propósito: entregar
 * sem ter aceitado atropelaria o aceite ativo (regra 5) — o caminho é aceitar
 * (um clique no Telegram) e entregar em seguida.
 */
export const STATUS_EM_ANDAMENTO: StatusDemanda[] = ["ACEITA", "EM_EXECUCAO"];

export const EVIDENCIAS_EXIGIDAS = ["LINK", "ARQUIVO", "NUMERO", "TEXTO"] as const;
export type EvidenciaExigida = (typeof EVIDENCIAS_EXIGIDAS)[number];

export const PERIODICIDADES_RETORNO = [
  "DIARIO",
  "DUAS_POR_SEMANA",
  "SEMANAL",
  "SO_ENTREGA",
  "SO_ATRASO",
] as const;
export type PeriodicidadeRetorno = (typeof PERIODICIDADES_RETORNO)[number];

/** 1 = crítica, 2 = alta, 3 = normal. */
export const CRITICIDADES = [1, 2, 3] as const;
export type Criticidade = (typeof CRITICIDADES)[number];

export const ROTULO_CRITICIDADE: Record<Criticidade, string> = {
  1: "Crítica",
  2: "Alta",
  3: "Normal",
};

/**
 * Regra 5 (aceite ativo): sem aceite dentro deste prazo, o sistema cobra o
 * aceite e registra evento de risco. Horas contadas de `enviadaEm`.
 */
export const HORAS_LIMITE_ACEITE: Record<Criticidade, number> = { 1: 24, 2: 48, 3: 72 };

export const TITULO_MAXIMO = 120;

// ── Quem é quem ─────────────────────────────────────────────────────────────

export type PapelNaDemanda = "SOLICITANTE" | "RESPONSAVEL" | "TERCEIRO";

export type DemandaParaRegras = {
  status: string;
  solicitanteId: string;
  responsavelId: string;
};

/**
 * O papel de `userId` NESTA demanda. Quando a pessoa delegou para si mesma
 * (permitido — no piloto todos são solicitantes e responsáveis), o papel
 * devolvido é SOLICITANTE: nas transições em que os dois papéis divergem
 * (encerrar, devolver, cancelar), é o chapéu de quem pediu que prevalece — e
 * as transições do responsável tratam esse caso à parte, aceitando o dono
 * único dos dois chapéus.
 */
export function papelNaDemanda(userId: string, demanda: DemandaParaRegras): PapelNaDemanda {
  if (userId === demanda.solicitanteId) return "SOLICITANTE";
  if (userId === demanda.responsavelId) return "RESPONSAVEL";
  return "TERCEIRO";
}

function ehSolicitante(userId: string, d: DemandaParaRegras): boolean {
  return userId === d.solicitanteId;
}
function ehResponsavel(userId: string, d: DemandaParaRegras): boolean {
  return userId === d.responsavelId;
}

// ── Resultado padrão ────────────────────────────────────────────────────────

export type Veredito = { ok: true } | { ok: false; erro: string };

const nega = (erro: string): Veredito => ({ ok: false, erro });
const OK: Veredito = { ok: true };

// ── Validação de criação (regras 1 e 2 + domínios) ──────────────────────────

export type DadosCriacao = {
  titulo: string;
  criterioAceite: string;
  evidenciaExigida: string;
  criticidade: number;
  prazo: Date | null;
  periodicidadeRetorno: string;
  solicitanteId: string;
  responsavelId: string;
};

/**
 * O que uma demanda precisa para EXISTIR (mesmo como rascunho). A regra 2 da
 * ordem é literal: "sem criterio_aceite o registro não é salvo" — vale desde o
 * rascunho, não só no envio. Prazo idem: timestamp obrigatório, nunca texto.
 *
 * Dono único (regra 1) aqui é redundância proposital: o schema já não tem como
 * guardar dois responsáveis (coluna escalar), mas validar o id vazio dá erro
 * legível em vez de FK estourada.
 */
export function validarCriacao(dados: DadosCriacao): Veredito {
  const titulo = dados.titulo.trim();
  if (!titulo) return nega("A demanda precisa de um título.");
  if (titulo.length > TITULO_MAXIMO) {
    return nega(`O título passa de ${TITULO_MAXIMO} caracteres (${titulo.length}).`);
  }
  if (!dados.criterioAceite.trim()) {
    return nega(
      'Toda demanda precisa do critério de aceite — "como sei que ficou pronto". Sem ele o registro não é salvo.',
    );
  }
  if (!(EVIDENCIAS_EXIGIDAS as readonly string[]).includes(dados.evidenciaExigida)) {
    return nega("Tipo de evidência inválido — use link, arquivo, número ou texto.");
  }
  if (!(CRITICIDADES as readonly number[]).includes(dados.criticidade)) {
    return nega("Criticidade inválida — 1 (crítica), 2 (alta) ou 3 (normal).");
  }
  if (!dados.prazo || Number.isNaN(dados.prazo.getTime())) {
    return nega("A demanda precisa de um prazo — uma data, nunca texto livre.");
  }
  if (!(PERIODICIDADES_RETORNO as readonly string[]).includes(dados.periodicidadeRetorno)) {
    return nega("Periodicidade de retorno inválida.");
  }
  if (!dados.solicitanteId.trim()) return nega("A demanda precisa de quem delegou.");
  if (!dados.responsavelId.trim()) {
    return nega("A demanda precisa de UM responsável — sempre um único.");
  }
  return OK;
}

// ── Transições ──────────────────────────────────────────────────────────────

export type Transicao =
  | "ENVIAR"
  | "ACEITAR"
  | "INICIAR_EXECUCAO"
  | "ENTREGAR"
  | "ENCERRAR"
  | "DEVOLVER"
  | "CANCELAR";

/**
 * A tabela: de onde cada transição sai, para onde leva e QUAL CHAPÉU pode
 * puxá-la. É dado, não código — o teste percorre a matriz inteira
 * (transição × status × papel) e qualquer linha nova entra na prova de graça.
 */
export const TRANSICOES: Record<
  Transicao,
  { de: StatusDemanda[]; para: StatusDemanda; quem: "SOLICITANTE" | "RESPONSAVEL" }
> = {
  ENVIAR: { de: ["RASCUNHO"], para: "ENVIADA", quem: "SOLICITANTE" },
  ACEITAR: { de: ["ENVIADA"], para: "ACEITA", quem: "RESPONSAVEL" },
  // Automática no primeiro reporte do responsável — nunca por clique direto.
  INICIAR_EXECUCAO: { de: ["ACEITA"], para: "EM_EXECUCAO", quem: "RESPONSAVEL" },
  ENTREGAR: { de: [...STATUS_EM_ANDAMENTO], para: "ENTREGUE", quem: "RESPONSAVEL" },
  // Regra 3: quem encerra é quem pediu. O responsável PARA em ENTREGUE.
  ENCERRAR: { de: ["ENTREGUE"], para: "ENCERRADA", quem: "SOLICITANTE" },
  DEVOLVER: { de: ["ENTREGUE"], para: "EM_EXECUCAO", quem: "SOLICITANTE" },
  CANCELAR: {
    de: ["RASCUNHO", "ENVIADA", "ACEITA", "EM_EXECUCAO", "ENTREGUE"],
    para: "CANCELADA",
    quem: "SOLICITANTE",
  },
};

export type DadosTransicao = {
  /** ENTREGAR: a evidência (texto/link/número OU id de arquivo). */
  evidenciaTexto?: string | null;
  arquivoId?: string | null;
  /**
   * ENTREGAR: o tipo que a DEMANDA exige (Demanda.evidenciaExigida). Quando
   * informado, a evidência entregue tem que ser DAQUELE tipo — exigiu arquivo,
   * link não serve.
   */
  evidenciaExigida?: string | null;
  /** DEVOLVER e CANCELAR: o motivo é obrigatório. */
  motivo?: string | null;
  /** ENVIAR: o retrato completo, para revalidar criterioAceite e prazo. */
  criterioAceite?: string | null;
  prazo?: Date | null;
};

/**
 * A pergunta única das actions: `atorId` pode executar `transicao` nesta
 * demanda, com estes dados? A resposta negativa vem com o erro que a tela (ou
 * o bot) mostra — sem tradução no caminho.
 */
export function validarTransicao(
  transicao: Transicao,
  demanda: DemandaParaRegras,
  atorId: string,
  dados: DadosTransicao = {},
): Veredito {
  const regra = TRANSICOES[transicao];
  const status = demanda.status as StatusDemanda;

  // Estado terminal não anda — nem cancelar de novo.
  if (STATUS_TERMINAIS.includes(status)) {
    return nega(
      status === "ENCERRADA"
        ? "Esta demanda já foi encerrada — nada mais muda nela."
        : "Esta demanda foi cancelada — nada mais muda nela.",
    );
  }

  if (!regra.de.includes(status)) {
    return nega(mensagemEstadoErrado(transicao, status));
  }

  // O chapéu certo — checado ANTES dos dados: negar por autoria não pode
  // depender de o payload estar completo.
  if (regra.quem === "SOLICITANTE" && !ehSolicitante(atorId, demanda)) {
    if (transicao === "ENCERRAR" && ehResponsavel(atorId, demanda)) {
      // Regra 3, dita com todas as letras — é A regra do produto.
      return nega(
        "Quem encerra a demanda é quem pediu, nunca o responsável. Sua entrega fica aguardando o aceite do solicitante.",
      );
    }
    return nega("Só quem delegou esta demanda pode fazer isso.");
  }
  if (regra.quem === "RESPONSAVEL" && !ehResponsavel(atorId, demanda)) {
    return nega("Só o responsável pela demanda pode fazer isso.");
  }

  // Pré-condições de dados por transição.
  switch (transicao) {
    case "ENVIAR": {
      // Regra 2 revalidada na porta: um rascunho gravado antes desta regra
      // existir (ou alterado por caminho que a contorne) não passa.
      if (!dados.criterioAceite?.trim()) {
        return nega("Não dá para enviar sem o critério de aceite preenchido.");
      }
      if (!dados.prazo || Number.isNaN(dados.prazo.getTime())) {
        return nega("Não dá para enviar sem prazo definido.");
      }
      return OK;
    }
    case "ENTREGAR": {
      // Regra 4: entrega sem evidência é rejeitada — no backend, sempre.
      const temTexto = !!dados.evidenciaTexto?.trim();
      const temArquivo = !!dados.arquivoId?.trim();
      if (!temTexto && !temArquivo) {
        return nega(
          "Entrega exige evidência — o link, o número, o texto ou o arquivo que prova o que foi feito.",
        );
      }
      // E do TIPO que a demanda pediu: quem exigiu arquivo não aceita link no
      // lugar — a exigência foi combinada na delegação, não na entrega.
      if (dados.evidenciaExigida === "ARQUIVO" && !temArquivo) {
        return nega("Esta demanda exige a evidência como ARQUIVO anexado.");
      }
      if (
        dados.evidenciaExigida &&
        dados.evidenciaExigida !== "ARQUIVO" &&
        !temTexto
      ) {
        return nega(
          `Esta demanda exige a evidência como ${dados.evidenciaExigida.toLowerCase()} — escreva-a no campo de evidência.`,
        );
      }
      return OK;
    }
    case "DEVOLVER": {
      if (!dados.motivo?.trim()) {
        return nega("Devolver exige o motivo — o responsável precisa saber o que faltou.");
      }
      return OK;
    }
    case "CANCELAR": {
      if (!dados.motivo?.trim()) {
        return nega("Cancelar exige o motivo — ele fica no histórico da demanda.");
      }
      return OK;
    }
    default:
      return OK;
  }
}

function mensagemEstadoErrado(transicao: Transicao, status: StatusDemanda): string {
  switch (transicao) {
    case "ENVIAR":
      return "Esta demanda já foi enviada.";
    case "ACEITAR":
      return status === "RASCUNHO"
        ? "Esta demanda ainda não foi enviada ao responsável."
        : "Esta demanda já foi aceita.";
    case "INICIAR_EXECUCAO":
      return "A execução começa depois do aceite — e só uma vez.";
    case "ENTREGAR":
      return status === "ENVIADA"
        ? "Aceite a demanda antes de entregar — o aceite é o compromisso com o prazo."
        : status === "ENTREGUE"
          ? "Esta demanda já tem uma entrega aguardando o solicitante."
          : "Esta demanda não está em execução.";
    case "ENCERRAR":
    case "DEVOLVER":
      return "Só uma demanda ENTREGUE pode ser aceita ou devolvida.";
    default:
      return "Esta ação não vale para o estado atual da demanda.";
  }
}

// ── Repactuação (regra 6) ───────────────────────────────────────────────────

/**
 * Repactuar NÃO é transição: muda o prazo e mantém o status. Permitida em
 * ENVIADA, ACEITA e EM_EXECUCAO, pelo RESPONSÁVEL (é ele quem pede mais
 * prazo; o solicitante que discorda cancela ou devolve). Sempre com motivo.
 *
 * O que ela NUNCA faz é tocar `prazoOriginal` — a action atualiza só `prazo` e
 * grava a linha em DemandaRepactuacao; o teste confere que o dado de saída
 * desta função nem carrega o campo.
 */
export const STATUS_QUE_REPACTUAM: StatusDemanda[] = ["ENVIADA", "ACEITA", "EM_EXECUCAO"];

export function validarRepactuacao(
  demanda: DemandaParaRegras,
  atorId: string,
  dados: { prazoNovo: Date | null; motivo: string | null | undefined },
): Veredito {
  const status = demanda.status as StatusDemanda;
  if (!STATUS_QUE_REPACTUAM.includes(status)) {
    if (STATUS_TERMINAIS.includes(status)) {
      return nega("Demanda encerrada ou cancelada não repactua prazo.");
    }
    return nega(
      status === "ENTREGUE"
        ? "Com a entrega feita não há prazo a repactuar — aguarde o aceite ou a devolução."
        : "Rascunho não repactua: ajuste o prazo direto antes de enviar.",
    );
  }
  if (!ehResponsavel(atorId, demanda)) {
    return nega("Só o responsável pode pedir repactuação de prazo.");
  }
  if (!dados.prazoNovo || Number.isNaN(dados.prazoNovo.getTime())) {
    return nega("Repactuar exige o prazo novo — uma data, nunca texto livre.");
  }
  if (!dados.motivo?.trim()) {
    return nega("Repactuar exige o motivo — ele fica registrado na demanda.");
  }
  return OK;
}

// ── Reporte de progresso ────────────────────────────────────────────────────

/**
 * O responsável contando onde a coisa está — pelo painel, e (PR 4) pelo
 * Telegram. Vale em ACEITA (e aí dispara INICIAR_EXECUCAO automático, spec §4:
 * "automático no primeiro reporte") e em EM_EXECUCAO (só registra a
 * interação). A action decide qual dos dois pelo status; aqui valida quem e
 * quando.
 */
export function validarReporte(
  demanda: DemandaParaRegras,
  atorId: string,
  conteudo: string | null | undefined,
): Veredito {
  const status = demanda.status as StatusDemanda;
  if (!STATUS_EM_ANDAMENTO.includes(status)) {
    if (status === "ENVIADA") {
      return nega("Aceite a demanda antes de reportar — o aceite é o compromisso com o prazo.");
    }
    return nega("Reporte vale para demanda aceita ou em execução.");
  }
  if (!ehResponsavel(atorId, demanda)) {
    return nega("Só o responsável reporta progresso da demanda.");
  }
  if (!conteudo?.trim()) return nega("O reporte precisa de conteúdo.");
  return OK;
}

// ── Flag de risco ───────────────────────────────────────────────────────────

/**
 * `emRisco` liga em ACEITA e EM_EXECUCAO (spec §4). Podem ligar: o responsável
 * (botão "⚠️ Em risco"), o solicitante (que enxergou o risco antes) — e o
 * SISTEMA (classificador, cron de aceite), que passa `atorId: null`.
 * Desligar segue as mesmas portas; o histórico fica nos eventos.
 */
export function validarMarcarEmRisco(
  demanda: DemandaParaRegras,
  atorId: string | null,
): Veredito {
  const status = demanda.status as StatusDemanda;
  if (!STATUS_EM_ANDAMENTO.includes(status)) {
    return nega("O sinal de risco vale para demanda aceita ou em execução.");
  }
  if (atorId !== null && papelNaDemanda(atorId, demanda) === "TERCEIRO") {
    return nega("Só quem participa da demanda marca risco.");
  }
  return OK;
}

// ── Regra 5: aceite ativo ───────────────────────────────────────────────────

/**
 * Até quando o aceite pode esperar: `enviadaEm` + 24/48/72h conforme a
 * criticidade. O cron de aceite (PR 5) compara com o agora; passou, cobra o
 * aceite e registra evento de risco. Nula se a demanda ainda não foi enviada.
 */
export function prazoLimiteAceite(demanda: {
  enviadaEm: Date | null;
  criticidade: number;
}): Date | null {
  if (!demanda.enviadaEm) return null;
  const horas = HORAS_LIMITE_ACEITE[demanda.criticidade as Criticidade];
  if (!horas) return null;
  return new Date(demanda.enviadaEm.getTime() + horas * 60 * 60 * 1000);
}

// ── Prazo vindo do formulário ───────────────────────────────────────────────

/**
 * O prazo digitado, como INSTANTE. Aceita as duas formas de input:
 *
 *   - "2026-09-05T14:30" (<input datetime-local>) → aquele horário em
 *     BRASÍLIA, mesma regra de dataHoraDoFormularioBrasilia (lib/datas.ts);
 *   - "2026-09-05" (<input date>) → 23:59:59 de Brasília DAQUELE dia. Prazo
 *     "até sexta" significa sexta inteira — meia-noite UTC seria 21:00 da
 *     QUINTA em Brasília, e a cobrança de atraso dispararia com o dia ainda
 *     valendo.
 *
 * Devolve null para qualquer outra coisa — prazo é timestamp, nunca texto
 * livre (spec §3.5), e quem valida a obrigatoriedade é validarCriacao.
 */
export function prazoDoFormulario(valor: string | null | undefined): Date | null {
  const texto = (valor ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    const d = new Date(`${texto}T23:59:59-03:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(texto)) {
    const d = new Date(`${texto}-03:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// ── Eventos (log imutável) ──────────────────────────────────────────────────

/** Os tipos de evento que as actions gravam — PR 5/6 somam os do motor. */
export const TIPOS_EVENTO = [
  "CRIADA",
  "ENVIADA",
  "ACEITA",
  "EXECUCAO_INICIADA",
  "REPACTUADA",
  "ENTREGUE",
  "DEVOLVIDA",
  "ENCERRADA",
  "CANCELADA",
  "EM_RISCO_LIGADO",
  "EM_RISCO_DESLIGADO",
] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

/** O evento que cada transição gera — 1:1, para o log nunca ficar para trás. */
export const EVENTO_DA_TRANSICAO: Record<Transicao, TipoEvento> = {
  ENVIAR: "ENVIADA",
  ACEITAR: "ACEITA",
  INICIAR_EXECUCAO: "EXECUCAO_INICIADA",
  ENTREGAR: "ENTREGUE",
  ENCERRAR: "ENCERRADA",
  DEVOLVER: "DEVOLVIDA",
  CANCELAR: "CANCELADA",
};
