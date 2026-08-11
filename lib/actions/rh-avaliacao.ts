"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { dataDoFormulario, formatarData } from "@/lib/datas";
import { AVALIADORES_AUTOMATICOS, tipoAvaliadorLabel, tipoCicloLabel } from "@/lib/constants-avaliacao";
import { sendTelegramMessage } from "@/lib/telegram";
import { opcoesDoCatalogo } from "@/lib/catalogos";
import type { ActionResult } from "@/lib/constants";

export async function criarCiclo(
  empresaId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);

  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) return { ok: false, error: "Dê um nome ao ciclo (ex.: \"1º Semestre 2026\")." };

  const tipo = String(formData.get("tipo") ?? "");
  if (!["90", "180", "360"].includes(tipo)) return { ok: false, error: "Escolha o tipo do ciclo." };

  const dataInicio = dataDoFormulario(formData.get("dataInicio"));
  const dataFim = dataDoFormulario(formData.get("dataFim"));
  if (!dataInicio || !dataFim) return { ok: false, error: "Informe o início e o fim do ciclo." };
  if (dataFim < dataInicio) return { ok: false, error: "O fim não pode vir antes do início." };

  const ciclo = await prisma.cicloAvaliacao.create({
    data: {
      empresaId,
      nome,
      tipo,
      dataInicio,
      dataFim,
      criadoPorId: usuario?.id ?? null,
      criadoPorNome: usuario?.name ?? null,
    },
  });

  await registrarAuditoria({
    empresaId,
    acao: "CRIAR",
    entidade: "CicloAvaliacao",
    entidadeId: ciclo.id,
    resumo: `Ciclo de avaliação "${nome}" (${tipoCicloLabel(tipo)}) criado.`,
  });

  revalidatePath(`/rh/${empresaId}/avaliacoes`);
  return { ok: true };
}

export async function encerrarCiclo(empresaId: string, cicloId: string): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const ciclo = await prisma.cicloAvaliacao.findFirst({ where: { id: cicloId, empresaId } });
  if (!ciclo) return { ok: false, error: "Ciclo não encontrado nesta empresa." };
  if (ciclo.encerrado) return { ok: false, error: "Este ciclo já está encerrado." };

  await prisma.cicloAvaliacao.update({
    where: { id: cicloId },
    data: { encerrado: true, encerradoEm: new Date() },
  });

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "CicloAvaliacao",
    entidadeId: cicloId,
    resumo: `Ciclo de avaliação "${ciclo.nome}" encerrado.`,
  });

  revalidatePath(`/rh/${empresaId}/avaliacoes`);
  revalidatePath(`/rh/${empresaId}/avaliacoes/${cicloId}`);
  return { ok: true };
}

// Cria a autoavaliação e/ou a avaliação do gestor de cada colaborador ativo,
// conforme o tipo do ciclo — pula quem já tem a linha (reexecutar é seguro) e
// pula GESTOR para quem não tem supervisor definido (não tem quem preencher).
export async function gerarAvaliacoes(empresaId: string, cicloId: string): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const ciclo = await prisma.cicloAvaliacao.findFirst({ where: { id: cicloId, empresaId } });
  if (!ciclo) return { ok: false, error: "Ciclo não encontrado nesta empresa." };
  if (ciclo.encerrado) return { ok: false, error: "Este ciclo está encerrado — reabra um novo ciclo para gerar avaliações." };

  const tiposAutomaticos = AVALIADORES_AUTOMATICOS[ciclo.tipo] ?? [];
  const colaboradores = await prisma.colaborador.findMany({
    where: { empresaId, ativo: true },
    select: { id: true, nome: true, supervisorId: true, supervisor: { select: { nome: true } } },
  });

  const existentes = await prisma.avaliacaoDesempenho.findMany({
    where: { cicloId },
    select: { colaboradorId: true, avaliadorId: true },
  });
  const jaTem = new Set(existentes.map((e) => `${e.colaboradorId}:${e.avaliadorId}`));

  const linhas: {
    empresaId: string;
    colaboradorId: string;
    cicloId: string;
    tipoAvaliador: string;
    avaliadorId: string;
    avaliadorNome: string | null;
  }[] = [];

  for (const c of colaboradores) {
    if (tiposAutomaticos.includes("AUTOAVALIACAO") && !jaTem.has(`${c.id}:${c.id}`)) {
      linhas.push({
        empresaId,
        colaboradorId: c.id,
        cicloId,
        tipoAvaliador: "AUTOAVALIACAO",
        avaliadorId: c.id,
        avaliadorNome: c.nome,
      });
    }
    if (tiposAutomaticos.includes("GESTOR") && c.supervisorId && !jaTem.has(`${c.id}:${c.supervisorId}`)) {
      linhas.push({
        empresaId,
        colaboradorId: c.id,
        cicloId,
        tipoAvaliador: "GESTOR",
        avaliadorId: c.supervisorId,
        avaliadorNome: c.supervisor?.nome ?? null,
      });
    }
  }

  if (linhas.length === 0) {
    return { ok: false, error: "Nada para gerar — já existem avaliações para todo mundo, ou ninguém tem gestor definido." };
  }

  await prisma.avaliacaoDesempenho.createMany({ data: linhas });

  await registrarAuditoria({
    empresaId,
    acao: "CRIAR",
    entidade: "AvaliacaoDesempenho",
    entidadeId: cicloId,
    resumo: `${linhas.length} avaliação(ões) geradas para o ciclo "${ciclo.nome}".`,
  });

  revalidatePath(`/rh/${empresaId}/avaliacoes/${cicloId}`);
  return { ok: true };
}

/** Primeiro nome, capitalizado — a base veio do elleven em CAIXA ALTA. */
const primeiroNome = (nome: string) =>
  nome.trim().split(/\s+/)[0].toLowerCase().replace(/^./, (c) => c.toUpperCase());

function convite(params: {
  nome: string;
  marca: string;
  aFazer: number;
  temEquipe: boolean;
  prazo: string;
}): string {
  const { nome, marca, aFazer, temEquipe, prazo } = params;
  const passos =
    "1. Me mande /portal\n" +
    "2. Abra o link que eu te enviar\n" +
    "3. Toque na aba Avaliação";

  if (temEquipe) {
    return (
      `Oi, ${primeiroNome(nome)}! 👋\n\n` +
      "A avaliação de desempenho do 1º semestre está aberta. Você avalia a sua equipe, " +
      "além da sua própria autoavaliação.\n\n" +
      `${passos}\n\n` +
      "Confira se a sua equipe está completa: no alto da aba, em \"Quem mais você avalia?\", " +
      "busque pelo nome e toque em Incluir para cada pessoa que faltar — mesmo de outra " +
      "empresa do grupo. Quem você incluir passa a responder também a própria autoavaliação.\n\n" +
      `Hoje são ${aFazer} avaliação(ões) na sua lista. São 6 notas de 1 a 5 e três campos ` +
      "para escrever, cerca de 3 minutos cada. Dá para responder aos poucos.\n\n" +
      `Prazo: ${prazo}.\n\n` +
      "O que você escrever vira a base da conversa de feedback com cada um.\n\n" +
      `RH — ${marca}`
    );
  }

  return (
    `Oi, ${primeiroNome(nome)}! 👋\n\n` +
    "Começou a avaliação de desempenho do 1º semestre e a sua autoavaliação está esperando " +
    "você.\n\n" +
    "São 6 notas de 1 a 5 e três campos para escrever. Leva 3 minutos.\n\n" +
    `${passos}\n\n` +
    `Prazo: ${prazo}.\n\n` +
    "Sua resposta vai para o seu gestor e para o RH — não é anônima. É o seu espaço de dizer " +
    "como o semestre foi do seu ponto de vista, antes que alguém diga por você.\n\n" +
    `RH — ${marca}`
  );
}

export type ResultadoConvites = {
  enviados: number;
  falhas: number;
  semTelegram: number;
  nadaPendente: number;
};

/**
 * Convida pelo Telegram quem tem avaliação pendente no ciclo.
 *
 * Uma mensagem por PESSOA, não por avaliação: quem tem oito na lista recebe um
 * aviso, não oito. O texto muda para quem avalia equipe — essa pessoa precisa
 * saber que também monta a própria lista, e quem só tem a autoavaliação não
 * precisa ouvir falar disso.
 *
 * Reexecutar é a cobrança: quem já respondeu tudo sai da lista sozinho.
 */
export async function enviarConvitesDoCiclo(
  empresaId: string,
  cicloId: string,
): Promise<ActionResult & { resultado?: ResultadoConvites }> {
  await requireEmpresaAccess(empresaId);

  const ciclo = await prisma.cicloAvaliacao.findFirst({ where: { id: cicloId, empresaId } });
  if (!ciclo) return { ok: false, error: "Ciclo não encontrado nesta empresa." };
  if (ciclo.encerrado) return { ok: false, error: "Este ciclo está encerrado." };

  const pendentes = await prisma.avaliacaoDesempenho.findMany({
    where: { cicloId, status: { not: "CONCLUIDA" } },
    select: { avaliadorId: true, tipoAvaliador: true },
  });
  if (pendentes.length === 0) {
    return { ok: false, error: "Ninguém tem avaliação pendente neste ciclo." };
  }

  // Uma linha por avaliador, com o que ele tem a fazer.
  const porAvaliador = new Map<string, { total: number; temEquipe: boolean }>();
  for (const p of pendentes) {
    const atual = porAvaliador.get(p.avaliadorId) ?? { total: 0, temEquipe: false };
    atual.total += 1;
    if (p.tipoAvaliador !== "AUTOAVALIACAO") atual.temEquipe = true;
    porAvaliador.set(p.avaliadorId, atual);
  }

  const avaliadores = await prisma.colaborador.findMany({
    where: { id: { in: [...porAvaliador.keys()] }, ativo: true },
    select: {
      id: true,
      nome: true,
      telegramChatId: true,
      empresa: { select: { marca: { select: { nome: true } } } },
    },
  });

  const prazo = formatarData(ciclo.dataFim);
  let enviados = 0;
  let falhas = 0;
  let semTelegram = 0;

  for (const a of avaliadores) {
    if (!a.telegramChatId) {
      semTelegram++;
      continue;
    }
    const dele = porAvaliador.get(a.id)!;
    const texto = convite({
      nome: a.nome,
      // Assina a marca da pessoa, nunca as do grupo: quem é da Centrysol lendo
      // "LM Telecom" acha que a mensagem veio trocada.
      marca: a.empresa.marca.nome,
      aFazer: dele.total,
      temEquipe: dele.temEquipe,
      prazo,
    });
    const r = await sendTelegramMessage(a.telegramChatId, texto);
    if (r.ok) enviados++;
    else falhas++;
  }

  await registrarAuditoria({
    empresaId,
    acao: "ENVIAR_CONVITE",
    entidade: "CicloAvaliacao",
    entidadeId: cicloId,
    resumo: `Convite do ciclo "${ciclo.nome}" enviado pelo Telegram: ${enviados} enviado(s), ${falhas} falha(s), ${semTelegram} sem Telegram vinculado.`,
  });

  return {
    ok: true,
    resultado: { enviados, falhas, semTelegram, nadaPendente: 0 },
  };
}

export async function adicionarAvaliadorExtra(
  empresaId: string,
  cicloId: string,
  colaboradorId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const ciclo = await prisma.cicloAvaliacao.findFirst({ where: { id: cicloId, empresaId } });
  if (!ciclo) return { ok: false, error: "Ciclo não encontrado nesta empresa." };

  const tipoAvaliador = String(formData.get("tipoAvaliador") ?? "");
  if (!["PAR", "SUBORDINADO"].includes(tipoAvaliador)) {
    return { ok: false, error: "Escolha se o avaliador extra é um par ou um subordinado." };
  }

  const avaliadorId = String(formData.get("avaliadorId") ?? "").trim();
  if (!avaliadorId) return { ok: false, error: "Escolha quem vai avaliar." };
  if (avaliadorId === colaboradorId) return { ok: false, error: "A pessoa não pode ser avaliadora de si mesma nesta função." };

  const [colaborador, avaliador] = await Promise.all([
    prisma.colaborador.findFirst({ where: { id: colaboradorId, empresaId }, select: { id: true, nome: true } }),
    prisma.colaborador.findFirst({ where: { id: avaliadorId, empresaId }, select: { id: true, nome: true } }),
  ]);
  if (!colaborador) return { ok: false, error: "Colaborador não encontrado nesta empresa." };
  if (!avaliador) return { ok: false, error: "Avaliador não encontrado nesta empresa." };

  const existente = await prisma.avaliacaoDesempenho.findUnique({
    where: { colaboradorId_cicloId_avaliadorId: { colaboradorId, cicloId, avaliadorId } },
  });
  if (existente) return { ok: false, error: "Esta pessoa já está registrada como avaliadora neste ciclo." };

  await prisma.avaliacaoDesempenho.create({
    data: { empresaId, colaboradorId, cicloId, tipoAvaliador, avaliadorId, avaliadorNome: avaliador.nome },
  });

  await registrarAuditoria({
    empresaId,
    acao: "CRIAR",
    entidade: "AvaliacaoDesempenho",
    entidadeId: colaboradorId,
    resumo: `${avaliador.nome} adicionado como avaliador (${tipoAvaliadorLabel(tipoAvaliador)}) de ${colaborador.nome} no ciclo "${ciclo.nome}".`,
  });

  revalidatePath(`/rh/${empresaId}/avaliacoes/${cicloId}`);
  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  return { ok: true };
}

export async function salvarNotasAvaliacao(
  empresaId: string,
  avaliacaoId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const avaliacao = await prisma.avaliacaoDesempenho.findFirst({
    where: { id: avaliacaoId, empresaId },
    include: { colaborador: { select: { nome: true } } },
  });
  if (!avaliacao) return { ok: false, error: "Avaliação não encontrada nesta empresa." };

  const competencias = await opcoesDoCatalogo(empresaId, "COMPETENCIA");
  const notas: { competencia: string; nota: number }[] = [];
  for (const c of competencias) {
    const bruto = String(formData.get(`nota_${c.value}`) ?? "").trim();
    if (!bruto) return { ok: false, error: `Falta a nota de "${c.label}".` };
    const nota = Number.parseInt(bruto, 10);
    if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
      return { ok: false, error: `A nota de "${c.label}" deve ser de 1 a 5.` };
    }
    notas.push({ competencia: c.value, nota });
  }

  const notaFinal = notas.reduce((soma, n) => soma + n.nota, 0) / notas.length;

  const potencialBruto = String(formData.get("potencial") ?? "");
  const potencial = avaliacao.tipoAvaliador === "GESTOR" && potencialBruto ? potencialBruto : null;

  await prisma.$transaction(async (tx) => {
    await tx.notaCompetencia.deleteMany({ where: { avaliacaoId } });
    await tx.notaCompetencia.createMany({
      data: notas.map((n) => ({ avaliacaoId, competencia: n.competencia, nota: n.nota })),
    });
    await tx.avaliacaoDesempenho.update({
      where: { id: avaliacaoId },
      data: {
        notaFinal,
        potencial,
        pontosFortes: String(formData.get("pontosFortes") ?? "").trim() || null,
        pontosDesenvolvimento: String(formData.get("pontosDesenvolvimento") ?? "").trim() || null,
        comentarios: String(formData.get("comentarios") ?? "").trim() || null,
        status: "CONCLUIDA",
        concluidaEm: new Date(),
      },
    });
  });

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "AvaliacaoDesempenho",
    entidadeId: avaliacaoId,
    // A nota em si não é sigilosa como salário/CID, mas os comentários podem
    // conter opinião sensível sobre a pessoa — a trilha registra que a
    // avaliação foi concluída, não o conteúdo dos comentários.
    resumo: `Avaliação de ${avaliacao.colaborador.nome} (${tipoAvaliadorLabel(avaliacao.tipoAvaliador)}) concluída — nota ${notaFinal.toFixed(1)}.`,
  });

  revalidatePath(`/rh/${empresaId}/avaliacoes/${avaliacao.cicloId}`);
  revalidatePath(`/rh/${empresaId}/colaboradores/${avaliacao.colaboradorId}`);
  return { ok: true };
}

export async function excluirAvaliacao(empresaId: string, avaliacaoId: string): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const avaliacao = await prisma.avaliacaoDesempenho.findFirst({
    where: { id: avaliacaoId, empresaId },
    include: { colaborador: { select: { nome: true } } },
  });
  if (!avaliacao) return { ok: false, error: "Avaliação não encontrada nesta empresa." };

  await prisma.avaliacaoDesempenho.delete({ where: { id: avaliacaoId } });

  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "AvaliacaoDesempenho",
    entidadeId: avaliacaoId,
    resumo: `Avaliação de ${avaliacao.colaborador.nome} (${tipoAvaliadorLabel(avaliacao.tipoAvaliador)}, ${avaliacao.avaliadorNome ?? "avaliador removido"}) excluída${avaliacao.status === "CONCLUIDA" ? " — já estava concluída" : ""}.`,
  });

  revalidatePath(`/rh/${empresaId}/avaliacoes/${avaliacao.cicloId}`);
  revalidatePath(`/rh/${empresaId}/colaboradores/${avaliacao.colaboradorId}`);
  return { ok: true };
}
