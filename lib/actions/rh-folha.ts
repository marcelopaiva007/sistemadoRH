"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { violouUnique } from "@/lib/prisma-erros";
import {
  RUBRICAS,
  competenciaUTC,
  fimDaCompetencia,
  formatarCompetencia,
  rubricaLabel,
  rubricaUnidade,
} from "@/lib/constants-folha";
import type { ActionResult } from "@/lib/constants";

const RUBRICAS_VALIDAS = new Set<string>(RUBRICAS.map((r) => r.value));

type Competencia = NonNullable<Awaited<ReturnType<typeof prisma.competenciaFolha.findFirst>>>;

/** Competência fechada não aceita mais nada — foi o que o escritório recebeu. */
async function competenciaAberta(
  empresaId: string,
  competenciaId: string,
): Promise<{ ok: false; erro: string } | { ok: true; competencia: Competencia }> {
  const c = await prisma.competenciaFolha.findFirst({ where: { id: competenciaId, empresaId } });
  if (!c) return { ok: false, erro: "Competência não encontrada nesta empresa." };
  if (c.status === "FECHADA") {
    return { ok: false, erro: "Esta competência está fechada. Reabra antes de alterar." };
  }
  return { ok: true, competencia: c };
}

export async function abrirCompetencia(
  empresaId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const ano = Number.parseInt(String(formData.get("ano") ?? ""), 10);
  const mes = Number.parseInt(String(formData.get("mes") ?? ""), 10);
  if (!Number.isInteger(ano) || ano < 2020 || ano > 2100) return { ok: false, error: "Ano inválido." };
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return { ok: false, error: "Mês inválido." };

  const referencia = competenciaUTC(ano, mes);

  try {
    const competencia = await prisma.competenciaFolha.create({ data: { empresaId, referencia } });
    await registrarAuditoria({
      empresaId,
      acao: "CRIAR",
      entidade: "CompetenciaFolha",
      entidadeId: competencia.id,
      resumo: `Competência ${formatarCompetencia(referencia)} aberta.`,
    });
  } catch (e) {
    if (violouUnique(e, "CompetenciaFolha_empresaId_referencia_key")) {
      return { ok: false, error: `A competência ${formatarCompetencia(referencia)} já existe.` };
    }
    throw e;
  }

  revalidatePath(`/rh/${empresaId}/folha`);
  return { ok: true };
}

/**
 * Traz para a competência o que o sistema já sabe: faltas injustificadas do
 * período e benefícios vigentes. Apaga só os DERIVADOS antes de recriar —
 * lançamento manual do RH nunca é tocado, senão recalcular perderia trabalho.
 */
export async function importarEventosDerivados(
  empresaId: string,
  competenciaId: string,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);
  const guarda = await competenciaAberta(empresaId, competenciaId);
  if (!guarda.ok) return { ok: false, error: guarda.erro };

  const inicio = guarda.competencia.referencia;
  const fim = fimDaCompetencia(inicio);

  const [faltas, beneficios] = await Promise.all([
    // Falta injustificada = não abonada. Abonada não desconta (ver Fase 1).
    prisma.ausencia.findMany({
      where: {
        empresaId,
        abonada: false,
        status: "APROVADA",
        dataInicio: { lte: fim },
        dataFim: { gte: inicio },
      },
      select: { colaboradorId: true, dias: true },
    }),
    prisma.beneficioColaborador.findMany({
      where: {
        empresaId,
        dataInicio: { lte: fim },
        OR: [{ dataFim: null }, { dataFim: { gte: inicio } }],
      },
      select: { colaboradorId: true, valorColaborador: true },
    }),
  ]);

  const porColaborador = new Map<string, { faltas: number; desconto: number }>();
  for (const f of faltas) {
    const a = porColaborador.get(f.colaboradorId) ?? { faltas: 0, desconto: 0 };
    a.faltas += f.dias;
    porColaborador.set(f.colaboradorId, a);
  }
  for (const b of beneficios) {
    if (!b.valorColaborador) continue;
    const a = porColaborador.get(b.colaboradorId) ?? { faltas: 0, desconto: 0 };
    a.desconto += b.valorColaborador;
    porColaborador.set(b.colaboradorId, a);
  }

  const novos: {
    empresaId: string;
    competenciaId: string;
    colaboradorId: string;
    tipo: string;
    quantidade: number | null;
    valor: number | null;
    origem: string;
    criadoPorId: string | null;
    criadoPorNome: string | null;
  }[] = [];

  for (const [colaboradorId, dados] of porColaborador) {
    const base = {
      empresaId,
      competenciaId,
      colaboradorId,
      origem: "DERIVADO",
      criadoPorId: usuario?.id ?? null,
      criadoPorNome: usuario?.name ?? null,
    };
    if (dados.faltas > 0) {
      novos.push({ ...base, tipo: "FALTA", quantidade: dados.faltas, valor: null });
    }
    if (dados.desconto > 0) {
      novos.push({ ...base, tipo: "BENEFICIO", quantidade: null, valor: dados.desconto });
    }
  }

  const removidos = await prisma.$transaction(async (tx) => {
    const { count } = await tx.eventoFolha.deleteMany({ where: { competenciaId, origem: "DERIVADO" } });
    if (novos.length > 0) await tx.eventoFolha.createMany({ data: novos });
    return count;
  });

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "CompetenciaFolha",
    entidadeId: competenciaId,
    resumo: `Eventos derivados da competência ${formatarCompetencia(inicio)} recalculados: ${novos.length} lançamento(s) (${removidos} anterior(es) substituído(s)). Lançamentos manuais preservados.`,
  });

  revalidatePath(`/rh/${empresaId}/folha/${competenciaId}`);
  return { ok: true };
}

export async function lancarEvento(
  empresaId: string,
  competenciaId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);
  const guarda = await competenciaAberta(empresaId, competenciaId);
  if (!guarda.ok) return { ok: false, error: guarda.erro };

  const colaboradorId = String(formData.get("colaboradorId") ?? "").trim();
  const colaborador = await prisma.colaborador.findFirst({
    where: { id: colaboradorId, empresaId },
    select: { id: true, nome: true },
  });
  if (!colaborador) return { ok: false, error: "Escolha um colaborador desta empresa." };

  const tipo = String(formData.get("tipo") ?? "");
  if (!RUBRICAS_VALIDAS.has(tipo)) return { ok: false, error: "Escolha a rubrica." };

  const unidade = rubricaUnidade(tipo);
  const bruto = String(formData.get("quantidade") ?? "").replace(",", ".").trim();
  const numero = bruto ? Number.parseFloat(bruto) : null;
  if (numero === null || !Number.isFinite(numero) || numero <= 0) {
    return { ok: false, error: `Informe ${unidade === "VALOR" ? "o valor" : "a quantidade"}, maior que zero.` };
  }

  const evento = await prisma.eventoFolha.create({
    data: {
      empresaId,
      competenciaId,
      colaboradorId,
      tipo,
      quantidade: unidade === "VALOR" ? null : numero,
      valor: unidade === "VALOR" ? numero : null,
      observacoes: String(formData.get("observacoes") ?? "").trim() || null,
      origem: "MANUAL",
      criadoPorId: usuario?.id ?? null,
      criadoPorNome: usuario?.name ?? null,
    },
  });

  await registrarAuditoria({
    empresaId,
    acao: "CRIAR",
    entidade: "EventoFolha",
    entidadeId: evento.id,
    // Quantidade de hora extra não é sigilosa; valor em dinheiro entra como
    // "lançado", seguindo a mesma regra de salário na trilha.
    resumo:
      unidade === "VALOR"
        ? `${rubricaLabel(tipo)} lançado para ${colaborador.nome} em ${formatarCompetencia(guarda.competencia.referencia)} (valor lançado).`
        : `${rubricaLabel(tipo)}: ${numero} para ${colaborador.nome} em ${formatarCompetencia(guarda.competencia.referencia)}.`,
  });

  revalidatePath(`/rh/${empresaId}/folha/${competenciaId}`);
  return { ok: true };
}

export async function excluirEvento(
  empresaId: string,
  competenciaId: string,
  id: string,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);
  const guarda = await competenciaAberta(empresaId, competenciaId);
  if (!guarda.ok) return { ok: false, error: guarda.erro };

  const evento = await prisma.eventoFolha.findFirst({
    where: { id, empresaId, competenciaId },
    select: { id: true, tipo: true, colaborador: { select: { nome: true } } },
  });
  if (!evento) return { ok: false, error: "Lançamento não encontrado." };

  await prisma.eventoFolha.delete({ where: { id } });
  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "EventoFolha",
    entidadeId: id,
    resumo: `${rubricaLabel(evento.tipo)} de ${evento.colaborador.nome} removido da competência ${formatarCompetencia(guarda.competencia.referencia)}.`,
  });

  revalidatePath(`/rh/${empresaId}/folha/${competenciaId}`);
  return { ok: true };
}

export async function alternarFechamento(
  empresaId: string,
  competenciaId: string,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);

  const competencia = await prisma.competenciaFolha.findFirst({ where: { id: competenciaId, empresaId } });
  if (!competencia) return { ok: false, error: "Competência não encontrada nesta empresa." };

  const fechando = competencia.status === "ABERTA";
  if (fechando) {
    const total = await prisma.eventoFolha.count({ where: { competenciaId } });
    if (total === 0) {
      return { ok: false, error: "Não dá para fechar uma competência sem nenhum lançamento." };
    }
  }

  await prisma.competenciaFolha.update({
    where: { id: competenciaId },
    data: fechando
      ? {
          status: "FECHADA",
          fechadaEm: new Date(),
          fechadaPorId: usuario?.id ?? null,
          fechadaPorNome: usuario?.name ?? null,
        }
      : { status: "ABERTA", fechadaEm: null, fechadaPorId: null, fechadaPorNome: null },
  });

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "CompetenciaFolha",
    entidadeId: competenciaId,
    resumo: `Competência ${formatarCompetencia(competencia.referencia)} ${fechando ? "fechada" : "reaberta"}.`,
  });

  revalidatePath(`/rh/${empresaId}/folha`);
  revalidatePath(`/rh/${empresaId}/folha/${competenciaId}`);
  return { ok: true };
}
