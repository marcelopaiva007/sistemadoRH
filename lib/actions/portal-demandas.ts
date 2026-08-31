"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { lerSessaoPortal } from "@/lib/portal-auth";
import type { ActionResult } from "@/lib/constants";
import {
  EVENTO_DA_TRANSICAO,
  validarReporte,
  validarTransicao,
  type Transicao,
} from "@/lib/delegacoes/estados";
import { diasAtePrazo, prazoEmTexto } from "@/lib/delegacoes/consultas";
import { rotuloEvidencia, severidadeDoPrazo, type SeveridadePrazo } from "@/lib/constants-delegacoes";
import { formatarDataHoraBrasilia } from "@/lib/datas";

// As demandas pela porta do COLABORADOR — o portal.
//
// Decisão da Direção em 29/08/2026: demanda vai para qualquer pessoa, usuário
// ou funcionário. Quem tem login usa as telas de /delegacoes; quem não tem
// responde por aqui, no mesmo portal em que já bate ponto e confirma entrega,
// autenticado pelo bot do Telegram — sem senha e sem cadastro novo.
//
// COMO A IDENTIDADE ATRAVESSA. A sessão do portal conhece o COLABORADOR; a
// demanda aponta para um USER (regra 1, dono único). A ponte é
// `User.colaboradorId`, resolvida aqui a cada chamada — nunca recebida por
// parâmetro. É o mesmo contrato das demais actions do portal: o id da pessoa
// vem SEMPRE da sessão, nunca do formulário.
//
// O que o colaborador pode fazer daqui é deliberadamente o lado dele do
// combinado: aceitar, reportar e entregar. Encerrar continua sendo de quem
// pediu (regra 3), e nem existe botão — a máquina recusaria de qualquer forma.

const CAMINHO_PORTAL = "/portal";

type Autor = { userId: string; colaboradorId: string; nome: string };

const ERRO_SESSAO = "Sua sessão expirou. Peça /portal ao bot para entrar de novo.";
const ERRO_NAO_ENCONTRADA = "Demanda não encontrada.";
const ERRO_CONFLITO = "A demanda mudou enquanto você respondia — recarregue a página.";

/**
 * Quem está falando, resolvido da sessão para o `User` correspondente.
 *
 * Sem usuário ligado à ficha não há demanda possível: só existe `User` para o
 * colaborador que já recebeu alguma (é `criarDemanda` que o cria). Devolver
 * null aqui é o caso normal de quem nunca recebeu nada, não um erro.
 */
async function autorDaSessao(): Promise<Autor | null> {
  const sessao = await lerSessaoPortal();
  if (!sessao) return null;
  const user = await prisma.user.findUnique({
    where: { colaboradorId: sessao.colaboradorId },
    select: { id: true, nome: true, ativo: true },
  });
  if (!user || !user.ativo) return null;
  return { userId: user.id, colaboradorId: sessao.colaboradorId, nome: user.nome };
}

export type DemandaNoPortal = {
  id: string;
  titulo: string;
  descricao: string | null;
  criterioAceite: string;
  evidenciaRotulo: string;
  status: string;
  prazoTexto: string;
  diasParaPrazo: number;
  severidade: SeveridadePrazo;
  solicitanteNome: string;
  /** O que ESTA pessoa pode fazer agora — decidido pela máquina, no servidor. */
  podeAceitar: boolean;
  podeReportar: boolean;
  podeEntregar: boolean;
  /**
   * O que ELA MESMA já reportou, do mais recente para o mais antigo. Sem isto
   * a pessoa escrevia no escuro: dava para mandar notícia, mas não para ver o
   * que já tinha mandado — e o caminho até a entrega só existia na tela de
   * quem delegou. Só as RECEBIDAS (o que ela disse), nunca as ENVIADAS (as
   * cobranças que o sistema disparou), que aqui virariam ruído.
   */
  atualizacoes: { id: string; quandoTexto: string; conteudo: string }[];
};

/** As demandas em aberto desta pessoa, da mais urgente para a menos. */
export async function minhasDemandasNoPortal(): Promise<DemandaNoPortal[]> {
  const autor = await autorDaSessao();
  if (!autor) return [];

  const linhas = await prisma.demanda.findMany({
    where: {
      responsavelId: autor.userId,
      // Só o que ainda pede algo dela. Encerrada e cancelada não têm o que
      // responder, e entregue já está com quem pediu.
      status: { in: ["ENVIADA", "ACEITA", "EM_EXECUCAO"] },
    },
    select: {
      id: true,
      titulo: true,
      descricao: true,
      criterioAceite: true,
      evidenciaExigida: true,
      status: true,
      prazo: true,
      solicitanteId: true,
      responsavelId: true,
      solicitante: { select: { nome: true } },
      interacoes: {
        where: { tipo: "RECEBIDA" },
        orderBy: { createdAt: "desc" },
        select: { id: true, conteudo: true, createdAt: true },
      },
    },
    orderBy: { prazo: "asc" },
  });

  return linhas.map((d) => {
    const dias = diasAtePrazo(d.prazo);
    const regras = {
      status: d.status,
      solicitanteId: d.solicitanteId,
      responsavelId: d.responsavelId,
      evidenciaExigida: d.evidenciaExigida,
    };
    return {
      id: d.id,
      titulo: d.titulo,
      descricao: d.descricao,
      criterioAceite: d.criterioAceite,
      evidenciaRotulo: rotuloEvidencia(d.evidenciaExigida),
      status: d.status,
      prazoTexto: prazoEmTexto(d.prazo),
      diasParaPrazo: dias,
      severidade: severidadeDoPrazo(dias, 3),
      solicitanteNome: d.solicitante.nome,
      podeAceitar: validarTransicao("ACEITAR", regras, autor.userId).ok,
      podeReportar: validarReporte(regras, autor.userId, "?").ok,
      // Evidência fictícia só para saber se o botão existiria; a de verdade é
      // cobrada na hora de entregar, com o que a pessoa escrever.
      podeEntregar: validarTransicao("ENTREGAR", regras, autor.userId, {
        evidenciaTexto: "?",
        arquivoId: null,
      }).ok,
      atualizacoes: d.interacoes.map((i) => ({
        id: i.id,
        quandoTexto: formatarDataHoraBrasilia(i.createdAt),
        conteudo: i.conteudo,
      })),
    };
  });
}

/** Lê a demanda garantindo que ela é DESTA pessoa. */
async function minhaDemanda(id: string, autor: Autor) {
  const d = await prisma.demanda.findFirst({
    where: { id, responsavelId: autor.userId },
    select: {
      id: true,
      status: true,
      solicitanteId: true,
      responsavelId: true,
      evidenciaExigida: true,
    },
  });
  return d;
}

async function registrarEventoPortal(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  demandaId: string,
  transicao: Transicao,
  autor: Autor,
) {
  await tx.demandaEvento.create({
    data: {
      demandaId,
      tipoEvento: EVENTO_DA_TRANSICAO[transicao],
      autorId: autor.userId,
      autorNome: autor.nome,
    },
  });
}

/** "✅ Aceito" — o compromisso com o prazo, do lado de quem executa. */
export async function aceitarNoPortal(input: { id: string }): Promise<ActionResult> {
  const autor = await autorDaSessao();
  if (!autor) return { ok: false, error: ERRO_SESSAO };
  const demanda = await minhaDemanda(input.id, autor);
  if (!demanda) return { ok: false, error: ERRO_NAO_ENCONTRADA };

  const veredito = validarTransicao("ACEITAR", demanda, autor.userId);
  if (!veredito.ok) return { ok: false, error: veredito.erro };

  const r = await prisma.$transaction(async (tx) => {
    const { count } = await tx.demanda.updateMany({
      where: { id: demanda.id, status: demanda.status },
      data: { status: "ACEITA", aceiteEm: new Date() },
    });
    if (count === 0) return "conflito" as const;
    await registrarEventoPortal(tx, demanda.id, "ACEITAR", autor);
    return "ok" as const;
  });
  if (r === "conflito") return { ok: false, error: ERRO_CONFLITO };
  revalidatePath(CAMINHO_PORTAL);
  return { ok: true };
}

/** "Onde está" — vira interação e, no primeiro reporte, inicia a execução. */
export async function reportarNoPortal(input: {
  id: string;
  conteudo: string;
}): Promise<ActionResult> {
  const autor = await autorDaSessao();
  if (!autor) return { ok: false, error: ERRO_SESSAO };
  const demanda = await minhaDemanda(input.id, autor);
  if (!demanda) return { ok: false, error: ERRO_NAO_ENCONTRADA };

  const veredito = validarReporte(demanda, autor.userId, input.conteudo);
  if (!veredito.ok) return { ok: false, error: veredito.erro };

  const r = await prisma.$transaction(async (tx) => {
    if (demanda.status === "ACEITA") {
      const { count } = await tx.demanda.updateMany({
        where: { id: demanda.id, status: "ACEITA" },
        data: { status: "EM_EXECUCAO" },
      });
      if (count === 0) return "conflito" as const;
      await registrarEventoPortal(tx, demanda.id, "INICIAR_EXECUCAO", autor);
    }
    await tx.demandaInteracao.create({
      data: {
        demandaId: demanda.id,
        tipo: "RECEBIDA",
        canal: "PAINEL",
        conteudo: input.conteudo.trim(),
      },
    });
    return "ok" as const;
  });
  if (r === "conflito") return { ok: false, error: ERRO_CONFLITO };
  revalidatePath(CAMINHO_PORTAL);
  return { ok: true };
}

/**
 * A entrega, com a evidência que a demanda exige (regra 4). Daqui só sai
 * evidência de TEXTO/LINK/NÚMERO — anexo de arquivo depende da esteira de
 * upload, que ainda não está nesta tela nem na do sistema.
 */
export async function entregarNoPortal(input: {
  id: string;
  evidencia: string;
  resultado?: string | null;
}): Promise<ActionResult> {
  const autor = await autorDaSessao();
  if (!autor) return { ok: false, error: ERRO_SESSAO };
  const demanda = await minhaDemanda(input.id, autor);
  if (!demanda) return { ok: false, error: ERRO_NAO_ENCONTRADA };

  const veredito = validarTransicao("ENTREGAR", demanda, autor.userId, {
    evidenciaTexto: input.evidencia,
    arquivoId: null,
  });
  if (!veredito.ok) return { ok: false, error: veredito.erro };

  const r = await prisma.$transaction(async (tx) => {
    const { count } = await tx.demanda.updateMany({
      where: { id: demanda.id, status: demanda.status },
      data: { status: "ENTREGUE" },
    });
    if (count === 0) return "conflito" as const;
    await tx.demandaEntrega.create({
      data: {
        demandaId: demanda.id,
        evidenciaTipo: demanda.evidenciaExigida,
        evidenciaTexto: input.evidencia.trim(),
        resultado: input.resultado?.trim() || null,
      },
    });
    await registrarEventoPortal(tx, demanda.id, "ENTREGAR", autor);
    return "ok" as const;
  });
  if (r === "conflito") return { ok: false, error: ERRO_CONFLITO };
  revalidatePath(CAMINHO_PORTAL);
  return { ok: true };
}
