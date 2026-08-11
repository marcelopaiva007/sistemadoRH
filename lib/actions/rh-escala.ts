"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { dataDoFormulario, formatarData } from "@/lib/datas";
import { tipoTurnoLabel } from "@/lib/constants-escala";
import { valoresValidosDoCatalogo } from "@/lib/catalogos";
import type { ActionResult } from "@/lib/constants";

/**
 * Define (ou apaga, se turno vier vazio) o turno de um colaborador num dia.
 * Upsert pela chave (colaboradorId, data) — reatribuir é update, não empilha
 * registro novo por dia.
 */
export async function definirTurno(
  empresaId: string,
  colaboradorId: string,
  dataTexto: string,
  turno: string,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);

  const colaborador = await prisma.colaborador.findFirst({
    where: { id: colaboradorId, empresaId, ativo: true },
    select: { id: true, nome: true },
  });
  if (!colaborador) return { ok: false, error: "Colaborador não encontrado ou inativo nesta empresa." };

  const data = dataDoFormulario(dataTexto);
  if (!data) return { ok: false, error: "Data inválida." };

  if (turno === "") {
    await prisma.escalaTurno.deleteMany({ where: { colaboradorId, data } });
    revalidatePath(`/rh/${empresaId}/escalas`);
    return { ok: true };
  }

  const turnosValidos = await valoresValidosDoCatalogo(empresaId, "TIPO_TURNO");
  if (!turnosValidos.has(turno)) return { ok: false, error: "Turno inválido." };

  await prisma.escalaTurno.upsert({
    where: { colaboradorId_data: { colaboradorId, data } },
    create: {
      empresaId,
      colaboradorId,
      data,
      turno,
      criadoPorId: usuario?.id ?? null,
      criadoPorNome: usuario?.name ?? null,
    },
    update: { turno },
  });

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "EscalaTurno",
    entidadeId: colaboradorId,
    resumo: `Escala de ${colaborador.nome} em ${formatarData(data)}: ${tipoTurnoLabel(turno)}.`,
  });

  revalidatePath(`/rh/${empresaId}/escalas`);
  return { ok: true };
}

/**
 * Copia a semana de origem para a semana de destino — o pedido mais comum
 * numa escala de rodízio ("repete a semana passada"). Não sobrescreve dias já
 * preenchidos no destino, para não apagar ajuste manual por engano.
 */
export async function copiarSemana(
  empresaId: string,
  inicioOrigemTexto: string,
  inicioDestinoTexto: string,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);

  const inicioOrigem = dataDoFormulario(inicioOrigemTexto);
  const inicioDestino = dataDoFormulario(inicioDestinoTexto);
  if (!inicioOrigem || !inicioDestino) return { ok: false, error: "Semana inválida." };

  const fimOrigem = new Date(inicioOrigem.getTime() + 6 * 86_400_000);
  const deslocamentoDias = Math.round((inicioDestino.getTime() - inicioOrigem.getTime()) / 86_400_000);

  const origem = await prisma.escalaTurno.findMany({
    where: { empresaId, data: { gte: inicioOrigem, lte: fimOrigem } },
  });
  if (origem.length === 0) return { ok: false, error: "A semana de origem não tem nenhuma escala definida." };

  const destinoExistente = await prisma.escalaTurno.findMany({
    where: {
      empresaId,
      data: { gte: inicioDestino, lte: new Date(inicioDestino.getTime() + 6 * 86_400_000) },
    },
    select: { colaboradorId: true, data: true },
  });
  const jaPreenchido = new Set(destinoExistente.map((d) => `${d.colaboradorId}::${d.data.toISOString()}`));

  let copiados = 0;
  for (const linha of origem) {
    const novaData = new Date(linha.data.getTime() + deslocamentoDias * 86_400_000);
    const chave = `${linha.colaboradorId}::${novaData.toISOString()}`;
    if (jaPreenchido.has(chave)) continue;

    await prisma.escalaTurno.upsert({
      where: { colaboradorId_data: { colaboradorId: linha.colaboradorId, data: novaData } },
      create: {
        empresaId,
        colaboradorId: linha.colaboradorId,
        data: novaData,
        turno: linha.turno,
        criadoPorId: usuario?.id ?? null,
        criadoPorNome: usuario?.name ?? null,
      },
      update: {},
    });
    copiados++;
  }

  await registrarAuditoria({
    empresaId,
    acao: "CRIAR",
    entidade: "EscalaTurno",
    resumo: `Escala de ${formatarData(inicioOrigem)} copiada para a semana de ${formatarData(inicioDestino)} (${copiados} turno(s), dias já preenchidos foram preservados).`,
  });

  revalidatePath(`/rh/${empresaId}/escalas`);
  return { ok: true };
}
