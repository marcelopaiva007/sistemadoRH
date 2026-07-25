"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { dataDoFormulario } from "@/lib/datas";
import { AVALIADORES_AUTOMATICOS, COMPETENCIAS, tipoAvaliadorLabel, tipoCicloLabel } from "@/lib/constants-avaliacao";
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

  const notas: { competencia: string; nota: number }[] = [];
  for (const c of COMPETENCIAS) {
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
