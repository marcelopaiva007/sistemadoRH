"use server";

import { revalidatePath } from "next/cache";
import { prisma, type Cliente } from "@/lib/prisma";
import { requireDelegacoesAccess } from "@/lib/delegacoes-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { podeVerDemanda } from "@/lib/delegacoes/consultas";
import { sistemasPermitidos } from "@/lib/permissoes/efetivas";
import { garantirAcessoDoColaborador, PAPEL_PORTAL } from "@/lib/delegacoes/acesso-colaborador";
import { avisarDemandaEnviada, avisarDemandaEntregue } from "@/lib/delegacoes/telegram";
import { avisarDemandaEnviadaPorEmail, avisarDemandaEntreguePorEmail } from "@/lib/delegacoes/email";
import { cobrarAceite } from "@/lib/delegacoes/cobranca-aceite";
import { classificarInteracao } from "@/lib/delegacoes/classificar";
import type { ActionResult } from "@/lib/constants";
import {
  EVENTO_DA_TRANSICAO,
  prazoDoFormulario,
  validarCriacao,
  validarMarcarEmRisco,
  validarRepactuacao,
  validarReporte,
  validarTransicao,
  type TipoEvento,
} from "@/lib/delegacoes/estados";

// Server actions do módulo Delegações — a ÚNICA porta de escrita das demandas.
//
// Divisão de trabalho com lib/delegacoes/estados.ts: lá mora a decisão (pode?
// quem? com que dados?), aqui mora a execução (transação, evento, revalidate).
// Nenhuma action muda status sem `validarTransicao` dizer sim antes — é assim
// que "o responsável nunca encerra" vale também por chamada direta de API, não
// só na tela.
//
// Identidade SEMPRE da sessão (requireUser), nunca de parâmetro — o mesmo
// contrato do portal. `solicitanteId` é quem está logado criando; nas demais
// actions o id da sessão é comparado com os papéis da demanda pela máquina.
//
// Toda action começa por `requireDelegacoesAccess()` — a guarda do módulo —, e
// só depois pergunta à máquina se ESTE ator pode ESTA transição nesta demanda.
// São dois portões diferentes: o primeiro é "você entra no módulo?", o segundo
// é "você é o dono desta demanda?". Nenhum cobre o outro.
//
// CONCORRÊNCIA: a transição valida contra o retrato lido e grava com
// `updateMany({ where: { id, status: <o status lido> } })`. Dois cliques
// simultâneos (dois aceites, aceitar × devolver) não aplicam duas vezes: o
// segundo encontra o status já mudado, atualiza 0 linhas e volta erro de
// conflito em vez de gravar evento dobrado.

const CAMINHO_MODULO = "/delegacoes";

/** Telas chegam no PR 3 — revalidar o layout inteiro do módulo já é o certo. */
function revalidarModulo() {
  revalidatePath(CAMINHO_MODULO, "layout");
}

type Ator = { id: string; nome: string; role: string };

async function atorDaSessao(): Promise<Ator | null> {
  const user = await requireDelegacoesAccess();
  if (!user.id) return null;
  return { id: user.id, nome: user.name ?? "(sem nome)", role: user.role };
}

/**
 * Lê a demanda e recusa quem não participa dela — com "não encontrada", nunca
 * "você não pode". A diferença importa: mensagens distintas para "não existe"
 * e "existe mas não é sua" transformam qualquer tela em oráculo de ids, que é
 * exatamente a classe de vazamento que o pentest de 27/08/2026 fechou nas
 * telas do RH. Aqui já nasce fechado.
 *
 * A máquina de estados ainda vai checar a autoria da AÇÃO logo depois; esta
 * checagem é a de LEITURA, e as duas são necessárias — ver um ao outro não é
 * o mesmo que agir sobre.
 */
async function carregarDemanda(id: string, ator: Ator) {
  const demanda = await prisma.demanda.findUnique({
    where: { id },
    select: SELECT_REGRAS,
  });
  if (!demanda || !podeVerDemanda(ator, demanda)) return null;
  return demanda;
}

const ERRO_SESSAO = "Sessão sem identificação — saia e entre de novo.";
const ERRO_NAO_ENCONTRADA = "Demanda não encontrada.";
const ERRO_CONFLITO =
  "A demanda mudou enquanto você agia — recarregue e veja o estado atual antes de repetir.";

/** O log imutável: um evento por acontecimento, com autor em snapshot. */
async function registrarEvento(
  tx: Cliente,
  demandaId: string,
  tipoEvento: TipoEvento,
  ator: { id: string | null; nome: string },
  dados?: Record<string, unknown>,
) {
  await tx.demandaEvento.create({
    data: {
      demandaId,
      tipoEvento,
      autorId: ator.id,
      autorNome: ator.nome,
      dados: dados ? (dados as object) : undefined,
    },
  });
}

const SELECT_REGRAS = {
  id: true,
  status: true,
  solicitanteId: true,
  responsavelId: true,
  prazo: true,
  criterioAceite: true,
  evidenciaExigida: true,
  emRisco: true,
} as const;

// ── Criar (e opcionalmente já enviar) ───────────────────────────────────────

export type NovaDemanda = {
  titulo: string;
  descricao?: string | null;
  /**
   * Quem executa. UM dos dois, nunca os dois: `responsavelId` quando a pessoa
   * já é usuário do sistema, `responsavelColaboradorId` quando é funcionário
   * sem login — nesse caso o acesso de portal é criado na hora e a demanda
   * passa a apontar para ele. A demanda continua com UM dono (regra 1); o que
   * muda é só por onde ele chegou.
   */
  responsavelId?: string;
  responsavelColaboradorId?: string;
  criterioAceite: string;
  /** LINK | ARQUIVO | NUMERO | TEXTO */
  evidenciaExigida: string;
  /** 1 crítica · 2 alta · 3 normal */
  criticidade: number;
  /** "aaaa-mm-dd" ou "aaaa-mm-ddThh:mm" — ver prazoDoFormulario. */
  prazo: string;
  /** Esforço esperado, em horas. Ausente/≤0 grava null — só a IA sempre estima algo. */
  horasEstimadas?: number | null;
  periodicidadeRetorno: string;
  marcaId?: string | null;
  area?: string | null;
  /** true = cria e envia num passo só (o fluxo normal da tela). */
  enviar?: boolean;
};

/**
 * Cria a demanda com quem está LOGADO como solicitante. Sem critério de
 * aceite ou sem prazo, a criação FALHA — regra 2, no backend.
 *
 * `avisoTelegram` volta preenchido quando o responsável não tem Telegram
 * vinculado (decisão da Direção de 28/08/2026: avisa, não bloqueia — a
 * cobrança dessa pessoa sai só por e-mail e painel até ela vincular o bot).
 */
export async function criarDemanda(
  input: NovaDemanda,
): Promise<ActionResult & { id?: string; avisoTelegram?: string }> {
  const ator = await atorDaSessao();
  if (!ator) return { ok: false, error: ERRO_SESSAO };

  // Funcionário sem login vira (ou reencontra) o acesso de portal ANTES da
  // validação: daqui para baixo existe só um responsável, que é um `User`.
  let responsavelId = input.responsavelId ?? "";
  let ehPortal = false;
  if (!responsavelId && input.responsavelColaboradorId) {
    const acesso = await garantirAcessoDoColaborador(input.responsavelColaboradorId);
    if (!acesso.ok) return { ok: false, error: acesso.erro };
    responsavelId = acesso.userId;
    ehPortal = true;
  }

  const prazo = prazoDoFormulario(input.prazo);
  const veredito = validarCriacao({
    titulo: input.titulo,
    criterioAceite: input.criterioAceite,
    evidenciaExigida: input.evidenciaExigida,
    criticidade: input.criticidade,
    prazo,
    periodicidadeRetorno: input.periodicidadeRetorno,
    solicitanteId: ator.id,
    responsavelId,
  });
  if (!veredito.ok) return { ok: false, error: veredito.erro };

  const responsavel = await prisma.user.findUnique({
    where: { id: responsavelId },
    select: {
      id: true,
      nome: true,
      role: true,
      ativo: true,
      colaborador: { select: { telegramChatId: true } },
    },
  });
  if (!responsavel || !responsavel.ativo) {
    return { ok: false, error: "Responsável não encontrado entre os usuários ativos." };
  }
  // A tela já filtra a lista, mas a recusa mora AQUI: sem isto, uma chamada
  // direta grava uma demanda para quem a guarda redireciona — e ela fica presa
  // em "aguardando aceite" para sempre, com o relógio correndo contra alguém
  // que nunca vai ver a tela. Filtro de front não é regra.
  // Acesso de portal NÃO precisa alcançar o módulo: ele responde pelo portal,
  // que tem porta própria. A exigência vale para quem é usuário do sistema —
  // aí sim, delegar a quem a guarda barra criaria demanda que ninguém vê.
  // `ehPortal` cobre quem acabou de ganhar o acesso; `role === PAPEL_PORTAL`
  // cobre quem já o tinha de uma demanda anterior. Sem o segundo, delegar duas
  // vezes para a mesma pessoa falhava na segunda.
  if (
    !ehPortal &&
    responsavel.role !== PAPEL_PORTAL &&
    !(await sistemasPermitidos(responsavel)).includes("delegacoes")
  ) {
    return {
      ok: false,
      error: `${responsavel.nome} ainda não tem acesso ao módulo Delegações — libere em Usuários e perfis antes de delegar.`,
    };
  }

  if (input.marcaId) {
    const marca = await prisma.marca.findUnique({
      where: { id: input.marcaId },
      select: { ativo: true },
    });
    if (!marca || !marca.ativo) return { ok: false, error: "Marca não encontrada." };
  }

  const enviar = input.enviar === true;
  const agora = new Date();

  const demanda = await prisma.$transaction(async (tx) => {
    const criada = await tx.demanda.create({
      data: {
        titulo: input.titulo.trim(),
        descricao: input.descricao?.trim() || null,
        solicitanteId: ator.id,
        responsavelId: responsavel.id,
        criterioAceite: input.criterioAceite.trim(),
        evidenciaExigida: input.evidenciaExigida,
        criticidade: input.criticidade,
        horasEstimadas:
          typeof input.horasEstimadas === "number" && input.horasEstimadas > 0
            ? input.horasEstimadas
            : null,
        prazo: prazo!,
        // Regra 6: gravado UMA vez, aqui — nenhuma outra action escreve nele.
        prazoOriginal: prazo!,
        periodicidadeRetorno: input.periodicidadeRetorno,
        marcaId: input.marcaId || null,
        area: input.area?.trim() || null,
        status: enviar ? "ENVIADA" : "RASCUNHO",
        enviadaEm: enviar ? agora : null,
      },
      select: { id: true },
    });
    await registrarEvento(tx, criada.id, "CRIADA", ator, {
      responsavelId: responsavel.id,
      responsavelNome: responsavel.nome,
      prazo: prazo!.toISOString(),
      criticidade: input.criticidade,
    });
    if (enviar) await registrarEvento(tx, criada.id, "ENVIADA", ator);
    return criada;
  });

  // Duas trilhas, de propósito, e não é redundância: `DemandaEvento` é a
  // história DA DEMANDA (aparece na tela de detalhe, para quem participa dela),
  // e `AuditLog` é a trilha LGPD do sistema inteiro (tela de Auditoria, para
  // quem administra). Sem empresaId: a demanda atravessa o grupo.
  await registrarAuditoria({
    acao: "CRIAR",
    entidade: "Demanda",
    entidadeId: demanda.id,
    resumo: `Delegou "${input.titulo.trim()}" para ${responsavel.nome}`,
  });

  // Os avisos por Telegram E por e-mail saem DEPOIS de a demanda estar
  // gravada, e a falha de um (ou dos dois) não desfaz nada: a demanda existe,
  // vale no painel, e o que não chegou volta para a tela em vez de virar
  // exceção. Os dois canais são tentados sempre — não é fallback um do outro.
  const avisos: string[] = [];
  if (enviar) {
    const [aviso, avisoEmail] = await Promise.all([
      avisarDemandaEnviada(demanda.id),
      avisarDemandaEnviadaPorEmail(demanda.id),
    ]);
    if (!aviso.ok) avisos.push(`não avisei pelo Telegram: ${aviso.motivo}`);
    if (!avisoEmail.ok) avisos.push(`não avisei por e-mail: ${avisoEmail.motivo}`);
  } else if (!responsavel.colaborador?.telegramChatId) {
    avisos.push(
      `${responsavel.nome} ainda não vinculou o Telegram ao sistema — o vínculo é feito por ela mesma, enviando /start ao bot do RH.`,
    );
  }

  revalidarModulo();
  return {
    ok: true,
    id: demanda.id,
    avisoTelegram: avisos.length > 0 ? `Demanda criada, mas ${avisos.join("; ")}.` : undefined,
  };
}

// ── Transições simples ──────────────────────────────────────────────────────

/**
 * O miolo comum: lê o retrato, pergunta à máquina, grava com guarda de
 * concorrência e registra o evento. Cada action de transição só diz QUAL
 * transição, o que muda nas colunas e o que vai no evento.
 */
async function executarTransicao(params: {
  demandaId: string;
  transicao: Parameters<typeof validarTransicao>[0];
  dadosValidacao?: Parameters<typeof validarTransicao>[3];
  colunas: Record<string, unknown>;
  dadosEvento?: Record<string, unknown>;
  extras?: (tx: Cliente, ator: Ator) => Promise<void>;
}): Promise<ActionResult> {
  const ator = await atorDaSessao();
  if (!ator) return { ok: false, error: ERRO_SESSAO };

  const demanda = await carregarDemanda(params.demandaId, ator);
  if (!demanda) return { ok: false, error: ERRO_NAO_ENCONTRADA };

  const veredito = validarTransicao(params.transicao, demanda, ator.id, params.dadosValidacao);
  if (!veredito.ok) return { ok: false, error: veredito.erro };

  const resultado = await prisma.$transaction(async (tx) => {
    const { count } = await tx.demanda.updateMany({
      // O `status` do retrato lido na cláusula: se outra aba já moveu a
      // demanda, aqui atualiza 0 linhas e nada é gravado — nem o evento.
      where: { id: demanda.id, status: demanda.status },
      data: params.colunas,
    });
    if (count === 0) return "conflito" as const;
    await registrarEvento(tx, demanda.id, EVENTO_DA_TRANSICAO[params.transicao], ator, params.dadosEvento);
    if (params.extras) await params.extras(tx, ator);
    return "ok" as const;
  });

  if (resultado === "conflito") return { ok: false, error: ERRO_CONFLITO };
  await registrarAuditoria({
    acao: ACAO_AUDITORIA[params.transicao],
    entidade: "Demanda",
    entidadeId: demanda.id,
    resumo: `${RESUMO_AUDITORIA[params.transicao]} (demanda ${demanda.id})`,
    detalhes: params.dadosEvento,
  });
  revalidarModulo();
  return { ok: true };
}

/**
 * Como cada transição aparece na trilha LGPD. `APROVAR`/`REPROVAR` para o
 * aceite e a devolução da entrega porque é literalmente isso que o solicitante
 * está fazendo — e são os verbos que a tela de Auditoria já sabe filtrar.
 */
const ACAO_AUDITORIA: Record<
  Parameters<typeof validarTransicao>[0],
  Parameters<typeof registrarAuditoria>[0]["acao"]
> = {
  ENVIAR: "ATUALIZAR",
  ACEITAR: "ATUALIZAR",
  INICIAR_EXECUCAO: "ATUALIZAR",
  ENTREGAR: "ATUALIZAR",
  ENCERRAR: "APROVAR",
  DEVOLVER: "REPROVAR",
  CANCELAR: "CANCELAR",
};

const RESUMO_AUDITORIA: Record<Parameters<typeof validarTransicao>[0], string> = {
  ENVIAR: "Enviou a demanda ao responsável",
  ACEITAR: "Aceitou a demanda",
  INICIAR_EXECUCAO: "Iniciou a execução da demanda",
  ENTREGAR: "Entregou a demanda com evidência",
  ENCERRAR: "Aceitou a entrega e encerrou a demanda",
  DEVOLVER: "Devolveu a entrega da demanda",
  CANCELAR: "Cancelou a demanda",
};

/** RASCUNHO → ENVIADA, pelo solicitante. Revalida critério e prazo na porta. */
export async function enviarDemanda(
  input: { id: string },
): Promise<ActionResult & { aviso?: string }> {
  // A guarda vem ANTES da leitura, e não só antes da escrita: consultar o
  // banco para quem ainda não provou quem é já é uso indevido, mesmo quando o
  // resultado não volta para a tela.
  const ator = await atorDaSessao();
  if (!ator) return { ok: false, error: ERRO_SESSAO };
  const demanda = await carregarDemanda(input.id, ator);
  if (!demanda) return { ok: false, error: ERRO_NAO_ENCONTRADA };
  const r = await executarTransicao({
    demandaId: input.id,
    transicao: "ENVIAR",
    dadosValidacao: { criterioAceite: demanda.criterioAceite, prazo: demanda.prazo },
    colunas: { status: "ENVIADA", enviadaEm: new Date() },
  });
  if (!r.ok) return r;
  // Mesmo contrato de `criarDemanda`: avisa depois de gravar, e a falha do
  // aviso NÃO vira erro. A demanda foi enviada de verdade — devolver `ok:
  // false` faria a tela convidar a pessoa a tentar de novo, e a segunda
  // tentativa seria recusada pela máquina ("já foi enviada"), deixando-a com
  // a impressão de que nada funcionou. O que não chegou volta como AVISO, que
  // é o que de fato aconteceu — pelos DOIS canais, sempre tentados.
  const [aviso, avisoEmail] = await Promise.all([
    avisarDemandaEnviada(input.id),
    avisarDemandaEnviadaPorEmail(input.id),
  ]);
  const problemas: string[] = [];
  if (!aviso.ok) problemas.push(`não avisei pelo Telegram: ${aviso.motivo}`);
  if (!avisoEmail.ok) problemas.push(`não avisei por e-mail: ${avisoEmail.motivo}`);
  return problemas.length > 0
    ? { ok: true, aviso: `Enviada, mas ${problemas.join("; ")}.` }
    : { ok: true };
}

/** ENVIADA → ACEITA — só o responsável; registra `aceiteEm` (regra 5). */
export async function aceitarDemanda(input: { id: string }): Promise<ActionResult> {
  return executarTransicao({
    demandaId: input.id,
    transicao: "ACEITAR",
    colunas: { status: "ACEITA", aceiteEm: new Date() },
  });
}

/** Qualquer estado não terminal → CANCELADA — só o solicitante, com motivo. */
export async function cancelarDemanda(input: { id: string; motivo: string }): Promise<ActionResult> {
  return executarTransicao({
    demandaId: input.id,
    transicao: "CANCELAR",
    dadosValidacao: { motivo: input.motivo },
    colunas: { status: "CANCELADA" },
    dadosEvento: { motivo: input.motivo.trim() },
  });
}

// ── Repactuação (regra 6) ───────────────────────────────────────────────────

/**
 * Muda `prazo`, MANTÉM o status e o `prazoOriginal`, grava a linha em
 * DemandaRepactuacao com motivo — só o responsável.
 */
export async function repactuarPrazo(input: {
  id: string;
  /** "aaaa-mm-dd" ou "aaaa-mm-ddThh:mm". */
  prazoNovo: string;
  motivo: string;
}): Promise<ActionResult> {
  const ator = await atorDaSessao();
  if (!ator) return { ok: false, error: ERRO_SESSAO };

  const demanda = await carregarDemanda(input.id, ator);
  if (!demanda) return { ok: false, error: ERRO_NAO_ENCONTRADA };

  const prazoNovo = prazoDoFormulario(input.prazoNovo);
  const veredito = validarRepactuacao(demanda, ator.id, {
    prazoNovo,
    motivo: input.motivo,
  });
  if (!veredito.ok) return { ok: false, error: veredito.erro };

  const resultado = await prisma.$transaction(async (tx) => {
    const { count } = await tx.demanda.updateMany({
      // Guarda dupla: status E prazo lidos — duas repactuações simultâneas não
      // gravam o mesmo `prazoAnterior` duas vezes.
      where: { id: demanda.id, status: demanda.status, prazo: demanda.prazo },
      data: { prazo: prazoNovo! },
    });
    if (count === 0) return "conflito" as const;
    await tx.demandaRepactuacao.create({
      data: {
        demandaId: demanda.id,
        prazoAnterior: demanda.prazo,
        prazoNovo: prazoNovo!,
        motivo: input.motivo.trim(),
        autorId: ator.id,
        autorNome: ator.nome,
      },
    });
    await registrarEvento(tx, demanda.id, "REPACTUADA", ator, {
      prazoAnterior: demanda.prazo.toISOString(),
      prazoNovo: prazoNovo!.toISOString(),
      motivo: input.motivo.trim(),
    });
    return "ok" as const;
  });

  if (resultado === "conflito") return { ok: false, error: ERRO_CONFLITO };
  await registrarAuditoria({
    acao: "ATUALIZAR",
    entidade: "Demanda",
    entidadeId: demanda.id,
    resumo: `Repactuou o prazo da demanda (de ${demanda.prazo.toISOString().slice(0, 10)} para ${prazoNovo!.toISOString().slice(0, 10)})`,
    detalhes: { motivo: input.motivo.trim() },
  });
  revalidarModulo();
  return { ok: true };
}

// ── Reporte de progresso ────────────────────────────────────────────────────

/**
 * O responsável contando onde está — registra a interação (canal PAINEL; o
 * Telegram chega no PR 4 pelo mesmo caminho) e, no PRIMEIRO reporte de uma
 * demanda ACEITA, dispara sozinho ACEITA → EM_EXECUCAO (spec §4).
 */
export async function reportarProgresso(input: {
  id: string;
  conteudo: string;
}): Promise<ActionResult> {
  const ator = await atorDaSessao();
  if (!ator) return { ok: false, error: ERRO_SESSAO };

  const demanda = await carregarDemanda(input.id, ator);
  if (!demanda) return { ok: false, error: ERRO_NAO_ENCONTRADA };

  const veredito = validarReporte(demanda, ator.id, input.conteudo);
  if (!veredito.ok) return { ok: false, error: veredito.erro };

  const resultado = await prisma.$transaction(async (tx) => {
    if (demanda.status === "ACEITA") {
      const inicio = validarTransicao("INICIAR_EXECUCAO", demanda, ator.id);
      if (!inicio.ok) return "conflito" as const; // não acontece: mesmo retrato validado acima
      const { count } = await tx.demanda.updateMany({
        where: { id: demanda.id, status: "ACEITA" },
        data: { status: "EM_EXECUCAO" },
      });
      if (count === 0) return "conflito" as const;
      await registrarEvento(tx, demanda.id, "EXECUCAO_INICIADA", ator);
    }
    const interacao = await tx.demandaInteracao.create({
      data: {
        demandaId: demanda.id,
        tipo: "RECEBIDA",
        canal: "PAINEL",
        conteudo: input.conteudo.trim(),
      },
      select: { id: true },
    });
    return interacao.id;
  });

  if (resultado === "conflito") return { ok: false, error: ERRO_CONFLITO };
  await registrarAuditoria({
    acao: "ATUALIZAR",
    entidade: "Demanda",
    entidadeId: demanda.id,
    // O texto do reporte NÃO vai para a trilha: ele é conversa entre as duas
    // pessoas e já vive em DemandaInteracao. A trilha registra QUE houve.
    resumo: "Reportou andamento da demanda",
  });
  // O classificador (PR 6) lê o texto DEPOIS de gravado — falhar aqui nunca
  // desfaz o reporte, que já vale independente de a IA conseguir lê-lo.
  await classificarInteracao(demanda.id, resultado);
  revalidarModulo();
  return { ok: true };
}

// ── Flag de risco ───────────────────────────────────────────────────────────

/** Liga/desliga `emRisco` — flag ortogonal, sem mudar o status. */
export async function marcarEmRisco(input: { id: string; ligar: boolean }): Promise<ActionResult> {
  const ator = await atorDaSessao();
  if (!ator) return { ok: false, error: ERRO_SESSAO };

  const demanda = await carregarDemanda(input.id, ator);
  if (!demanda) return { ok: false, error: ERRO_NAO_ENCONTRADA };

  const veredito = validarMarcarEmRisco(demanda, ator.id);
  if (!veredito.ok) return { ok: false, error: veredito.erro };

  // Já está como pediu: nada a gravar — evento repetido só sujaria o log.
  if (demanda.emRisco === input.ligar) return { ok: true };

  const resultado = await prisma.$transaction(async (tx) => {
    // Mesma guarda das transições, e pelo mesmo motivo: `update` cru gravaria
    // risco numa demanda que outra aba acabou de encerrar, e ainda somaria um
    // evento ao log imutável — que não se apaga. `emRisco` entra no `where`
    // junto porque dois cliques no mesmo botão não podem virar dois eventos.
    const { count } = await tx.demanda.updateMany({
      where: { id: demanda.id, status: demanda.status, emRisco: demanda.emRisco },
      data: { emRisco: input.ligar },
    });
    if (count === 0) return "conflito" as const;
    await registrarEvento(
      tx,
      demanda.id,
      input.ligar ? "EM_RISCO_LIGADO" : "EM_RISCO_DESLIGADO",
      ator,
    );
    return "ok" as const;
  });

  if (resultado === "conflito") return { ok: false, error: ERRO_CONFLITO };
  await registrarAuditoria({
    acao: "ATUALIZAR",
    entidade: "Demanda",
    entidadeId: demanda.id,
    resumo: input.ligar ? "Marcou a demanda em risco" : "Removeu o sinal de risco da demanda",
  });
  revalidarModulo();
  return { ok: true };
}

/**
 * Troca o responsável de uma demanda que AINDA NÃO foi aceita (RASCUNHO ou
 * ENVIADA) — só quem pediu decide, mesma regra 1 (dono único) de sempre, só
 * que reatribuível até o aceite: depois disso a pessoa já se comprometeu com
 * o prazo, e trocar vira "devolver" ou "cancelar e criar de novo", não isto.
 *
 * Mesmas checagens de `criarDemanda` para o NOVO responsável (ativo, alcança
 * o módulo ou ganha acesso de portal) — é o mesmo risco de delegar para quem
 * a guarda barra, só que na troca em vez da criação. Reinicia `enviadaEm` e
 * `emRisco` quando a demanda já estava ENVIADA: o relógio da regra 5 é desta
 * pessoa, que ainda nem viu a demanda — não pode nascer já "cobrada".
 */
export async function transferirDemanda(input: {
  id: string;
  novoResponsavelId?: string;
  novoResponsavelColaboradorId?: string;
}): Promise<ActionResult> {
  const ator = await atorDaSessao();
  if (!ator) return { ok: false, error: ERRO_SESSAO };

  const demanda = await carregarDemanda(input.id, ator);
  if (!demanda) return { ok: false, error: ERRO_NAO_ENCONTRADA };
  if (demanda.solicitanteId !== ator.id) {
    return { ok: false, error: "Só quem pediu a demanda pode transferi-la." };
  }
  if (demanda.status !== "RASCUNHO" && demanda.status !== "ENVIADA") {
    return {
      ok: false,
      error: "Só dá para transferir antes do aceite — depois disso, devolva ou cancele e crie de novo.",
    };
  }

  let novoResponsavelId = input.novoResponsavelId ?? "";
  let ehPortal = false;
  if (!novoResponsavelId && input.novoResponsavelColaboradorId) {
    const acesso = await garantirAcessoDoColaborador(input.novoResponsavelColaboradorId);
    if (!acesso.ok) return { ok: false, error: acesso.erro };
    novoResponsavelId = acesso.userId;
    ehPortal = true;
  }
  if (!novoResponsavelId) return { ok: false, error: "Escolha para quem transferir." };
  if (novoResponsavelId === demanda.responsavelId) {
    return { ok: false, error: "A demanda já é dessa pessoa." };
  }

  const novoResponsavel = await prisma.user.findUnique({
    where: { id: novoResponsavelId },
    select: { id: true, nome: true, role: true, ativo: true },
  });
  if (!novoResponsavel || !novoResponsavel.ativo) {
    return { ok: false, error: "Responsável não encontrado entre os usuários ativos." };
  }
  if (
    !ehPortal &&
    novoResponsavel.role !== PAPEL_PORTAL &&
    !(await sistemasPermitidos(novoResponsavel)).includes("delegacoes")
  ) {
    return {
      ok: false,
      error: `${novoResponsavel.nome} ainda não tem acesso ao módulo Delegações — libere em Usuários e perfis antes de transferir.`,
    };
  }

  const antigoResponsavel = await prisma.user.findUnique({
    where: { id: demanda.responsavelId },
    select: { nome: true },
  });

  const resultado = await prisma.$transaction(async (tx) => {
    const { count } = await tx.demanda.updateMany({
      where: { id: demanda.id, status: demanda.status, responsavelId: demanda.responsavelId },
      data: {
        responsavelId: novoResponsavel.id,
        ...(demanda.status === "ENVIADA" ? { enviadaEm: new Date(), emRisco: false } : {}),
      },
    });
    if (count === 0) return "conflito" as const;
    await registrarEvento(tx, demanda.id, "TRANSFERIDA", ator, {
      responsavelAnteriorId: demanda.responsavelId,
      responsavelAnteriorNome: antigoResponsavel?.nome ?? "—",
      novoResponsavelId: novoResponsavel.id,
      novoResponsavelNome: novoResponsavel.nome,
    });
    return "ok" as const;
  });

  if (resultado === "conflito") return { ok: false, error: ERRO_CONFLITO };
  await registrarAuditoria({
    acao: "ATUALIZAR",
    entidade: "Demanda",
    entidadeId: demanda.id,
    resumo: `Transferiu a demanda de ${antigoResponsavel?.nome ?? "—"} para ${novoResponsavel.nome}`,
  });
  revalidarModulo();

  // Mesmo aviso duplo de sempre — pro NOVO responsável, que ainda não viu
  // nada disso. Falha aqui não desfaz a troca, que já está gravada.
  if (demanda.status === "ENVIADA") {
    await Promise.all([avisarDemandaEnviada(demanda.id), avisarDemandaEnviadaPorEmail(demanda.id)]);
  }
  return { ok: true };
}

/**
 * Cobra o aceite AGORA, por vontade de quem pediu — sem esperar o prazo de
 * 24/48/72h da regra 5 (`cobranca-aceite.ts`, que roda 4x/dia sozinha). Mesma
 * função dos dois: `cobrarAceite` liga `emRisco` e manda o mesmo aviso duplo
 * (Telegram com botão + e-mail) — aqui só muda QUEM decide a hora.
 *
 * Só o SOLICITANTE, e só enquanto ENVIADA: cobrar depois de aceita não faz
 * sentido (é outra régua, a de cobranca.ts), e cobrar quem não pediu abriria
 * a porta pra qualquer um incomodar o responsável de uma demanda alheia.
 */
export async function cobrarAceiteAgora(input: { id: string }): Promise<ActionResult> {
  const ator = await atorDaSessao();
  if (!ator) return { ok: false, error: ERRO_SESSAO };

  const demanda = await carregarDemanda(input.id, ator);
  if (!demanda) return { ok: false, error: ERRO_NAO_ENCONTRADA };
  if (demanda.solicitanteId !== ator.id) {
    return { ok: false, error: "Só quem pediu a demanda pode cobrar o aceite." };
  }
  if (demanda.status !== "ENVIADA") {
    return { ok: false, error: "Só dá para cobrar aceite de demanda enviada, ainda sem aceite." };
  }

  const resultado = await cobrarAceite(demanda.id);
  if (resultado === "conflito") {
    return {
      ok: false,
      error: "Já foi cobrada (ou a pessoa acabou de aceitar) — recarregue a tela.",
    };
  }
  await registrarAuditoria({
    acao: "ATUALIZAR",
    entidade: "Demanda",
    entidadeId: demanda.id,
    resumo: "Cobrou o aceite fora do prazo automático (a pedido de quem pediu a demanda)",
  });
  revalidarModulo();
  return { ok: true };
}

// ── Entrega, aceite e devolução ─────────────────────────────────────────────

/**
 * ACEITA/EM_EXECUCAO → ENTREGUE, só o responsável, e NUNCA sem evidência
 * (regra 4) — do tipo que a demanda exigiu. A demanda fica aguardando o
 * solicitante: aceitar encerra, devolver reabre.
 */
export async function entregarDemanda(input: {
  id: string;
  /** O que foi feito, na palavra do responsável. */
  resultado?: string | null;
  /** A evidência quando é LINK, NUMERO ou TEXTO. */
  evidenciaTexto?: string | null;
  /** A evidência quando é ARQUIVO — id na esteira Arquivo/Blob. */
  arquivoId?: string | null;
}): Promise<ActionResult & { aviso?: string }> {
  const ator = await atorDaSessao();
  if (!ator) return { ok: false, error: ERRO_SESSAO };

  const demanda = await carregarDemanda(input.id, ator);
  if (!demanda) return { ok: false, error: ERRO_NAO_ENCONTRADA };

  // `evidenciaExigida` NÃO vai no payload: ele faz parte do retrato da
  // demanda (SELECT_REGRAS já o traz), e é assim que a regra 4 falha fechada.
  const veredito = validarTransicao("ENTREGAR", demanda, ator.id, {
    evidenciaTexto: input.evidenciaTexto,
    arquivoId: input.arquivoId,
  });
  if (!veredito.ok) return { ok: false, error: veredito.erro };

  if (input.arquivoId) {
    const arquivo = await prisma.arquivo.findUnique({
      where: { id: input.arquivoId },
      select: { id: true, criadoPorId: true, demandaEntrega: { select: { id: true } } },
    });
    // Só um arquivo que O PRÓPRIO responsável subiu: aceitar qualquer id
    // deixaria apontar documento alheio (o dossiê de um colaborador, p.ex.)
    // como "evidência" — e a tela do solicitante o exibiria. Mesma classe de
    // furo dos IDOR do pentest; fechado na origem.
    if (!arquivo || arquivo.criadoPorId !== ator.id) {
      return { ok: false, error: "Arquivo de evidência não encontrado entre os seus envios." };
    }
    if (arquivo.demandaEntrega) {
      return { ok: false, error: "Este arquivo já é evidência de outra entrega." };
    }
  }

  const resultado = await prisma.$transaction(async (tx) => {
    const { count } = await tx.demanda.updateMany({
      where: { id: demanda.id, status: demanda.status },
      data: { status: "ENTREGUE" },
    });
    if (count === 0) return "conflito" as const;
    await tx.demandaEntrega.create({
      data: {
        demandaId: demanda.id,
        evidenciaTipo: demanda.evidenciaExigida,
        evidenciaTexto: input.evidenciaTexto?.trim() || null,
        arquivoId: input.arquivoId || null,
        resultado: input.resultado?.trim() || null,
      },
    });
    await registrarEvento(tx, demanda.id, "ENTREGUE", ator, {
      evidenciaTipo: demanda.evidenciaExigida,
      comArquivo: !!input.arquivoId,
    });
    return "ok" as const;
  });

  if (resultado === "conflito") return { ok: false, error: ERRO_CONFLITO };
  await registrarAuditoria({
    acao: "ATUALIZAR",
    entidade: "Demanda",
    entidadeId: demanda.id,
    resumo: "Entregou a demanda com evidência",
    detalhes: { evidenciaTipo: demanda.evidenciaExigida, comArquivo: !!input.arquivoId },
  });
  revalidarModulo();
  // Mesmo contrato de `enviarDemanda`: a entrega já está gravada, e a falha do
  // aviso NÃO vira erro — só um aviso na tela dizendo o que não chegou.
  const [aviso, avisoEmail] = await Promise.all([
    avisarDemandaEntregue(demanda.id),
    avisarDemandaEntreguePorEmail(demanda.id),
  ]);
  const problemas: string[] = [];
  if (!aviso.ok) problemas.push(`não avisei pelo Telegram: ${aviso.motivo}`);
  if (!avisoEmail.ok) problemas.push(`não avisei por e-mail: ${avisoEmail.motivo}`);
  return problemas.length > 0
    ? { ok: true, aviso: `Entregue, mas ${problemas.join("; ")}.` }
    : { ok: true };
}

/**
 * ENTREGUE → ENCERRADA — SÓ o solicitante (regra 3; o responsável é barrado
 * pela máquina com a mensagem que explica a regra). Marca a entrega pendente
 * como aceita, zera o escalonamento e desliga o risco.
 */
export async function aceitarEntrega(input: { id: string }): Promise<ActionResult> {
  const agora = new Date();
  return executarTransicao({
    demandaId: input.id,
    transicao: "ENCERRAR",
    colunas: {
      status: "ENCERRADA",
      encerradaEm: agora,
      // Spec §6.2: o nível "só zera quando a demanda é encerrada" — aqui.
      nivelEscalonamento: 0,
      emRisco: false,
      proximaCobranca: null,
    },
    extras: async (tx) => {
      await avaliarEntregaPendente(tx, input.id, { aceita: true, avaliadaEm: agora });
    },
  });
}

/**
 * ENTREGUE → EM_EXECUCAO — só o solicitante, com motivo. A entrega devolvida
 * FICA no histórico (`aceita=false` + motivo): é ela que conta quantas vezes
 * a demanda voltou.
 */
export async function devolverEntrega(input: { id: string; motivo: string }): Promise<ActionResult> {
  const agora = new Date();
  return executarTransicao({
    demandaId: input.id,
    transicao: "DEVOLVER",
    dadosValidacao: { motivo: input.motivo },
    colunas: { status: "EM_EXECUCAO" },
    dadosEvento: { motivo: input.motivo.trim() },
    extras: async (tx) => {
      await avaliarEntregaPendente(tx, input.id, {
        aceita: false,
        motivoDevolucao: input.motivo.trim(),
        avaliadaEm: agora,
      });
    },
  });
}

/** A entrega aguardando avaliação é a mais recente ainda sem veredito. */
async function avaliarEntregaPendente(
  tx: Cliente,
  demandaId: string,
  dados: { aceita: boolean; motivoDevolucao?: string; avaliadaEm: Date },
) {
  const pendente = await tx.demandaEntrega.findFirst({
    where: { demandaId, aceita: null },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  // ENTREGUE sem entrega pendente não existe pelo fluxo — mas se existir (dado
  // mexido fora do app), avaliar "nada" não pode quebrar o encerramento.
  if (!pendente) return;
  await tx.demandaEntrega.update({ where: { id: pendente.id }, data: dados });
}

// ── Favoritos de quem delega ────────────────────────────────────────────────

/**
 * Liga/desliga uma pessoa na SUA lista de favoritos — a turma que aparece com
 * um clique na hora de delegar.
 *
 * A lista é de cada um: `userId` vem sempre da sessão, nunca do formulário.
 * Favoritar não concede acesso nenhum a ninguém (é preferência de tela), e por
 * isso NÃO gera evento nem auditoria: seria ruído numa trilha que existe para
 * responder quem mexeu em demanda.
 *
 * Só entra na lista quem realmente alcança o módulo — favoritar alguém que a
 * guarda barra criaria um atalho para o erro que `criarDemanda` recusa.
 */
export async function alternarFavorito(input: {
  /** Id de `User` OU de `Colaborador` — ver `ehColaborador`. */
  favoritoId: string;
  /**
   * true quando o id é de uma FICHA (pessoa que ainda não recebeu demanda
   * nenhuma e por isso ainda não tem acesso de portal). Favoritar cria o
   * acesso — o mesmo que a primeira demanda criaria —, porque a lista de
   * favoritos guarda `User.id`. O acesso criado não abre nada sozinho: sem
   * senha e sem e-mail, ele só existe para a pessoa ser alcançável.
   */
  ehColaborador?: boolean;
  favoritar: boolean;
}): Promise<ActionResult> {
  const ator = await atorDaSessao();
  if (!ator) return { ok: false, error: ERRO_SESSAO };

  let favoritoId = input.favoritoId;
  if (input.ehColaborador) {
    const acesso = await garantirAcessoDoColaborador(input.favoritoId);
    if (!acesso.ok) return { ok: false, error: acesso.erro };
    favoritoId = acesso.userId;
  }

  if (input.favoritar) {
    const pessoa = await prisma.user.findUnique({
      where: { id: favoritoId },
      select: { id: true, nome: true, role: true, ativo: true },
    });
    if (!pessoa || !pessoa.ativo) {
      return { ok: false, error: "Pessoa não encontrada entre os usuários ativos." };
    }
    // Acesso de portal não precisa alcançar o módulo — ele responde pelo
    // portal. A exigência vale só para quem opera o sistema.
    if (
      !input.ehColaborador &&
      pessoa.role !== PAPEL_PORTAL &&
      !(await sistemasPermitidos(pessoa)).includes("delegacoes")
    ) {
      return {
        ok: false,
        error: `${pessoa.nome} ainda não tem acesso ao módulo Delegações — libere em Usuários e perfis.`,
      };
    }
    // `upsert` em vez de `create`: favoritar duas vezes (dois cliques, duas
    // abas) não pode virar erro de chave duplicada na cara de quem usa.
    await prisma.delegacaoFavorito.upsert({
      where: { userId_favoritoId: { userId: ator.id, favoritoId: pessoa.id } },
      create: { userId: ator.id, favoritoId: pessoa.id },
      update: {},
    });
  } else {
    // `deleteMany` em vez de `delete`: desfavoritar quem já não está na lista
    // é sucesso, não erro — o estado final é o que a pessoa pediu.
    await prisma.delegacaoFavorito.deleteMany({
      where: { userId: ator.id, favoritoId },
    });
  }

  revalidarModulo();
  return { ok: true };
}
