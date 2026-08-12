"use server";

import { prisma } from "@/lib/prisma";
import { ActionResult } from "@/lib/constants";

export async function listarAtualizacoes(): Promise<ActionResult> {
  try {
    const atualizacoes = await prisma.atualizacao.findMany({
      orderBy: { dataSaida: "desc" },
    });
    return { ok: true, data: atualizacoes };
  } catch (error) {
    console.error("Erro ao listar atualizações:", error);
    return { ok: false, erro: "Erro ao carregar atualizações" };
  }
}

export async function criarAtualizacao(
  versao: string,
  titulo: string,
  descricao: string,
  dataSaida: Date,
  autor?: string,
  commit?: string,
): Promise<ActionResult> {
  try {
    const atualizacao = await prisma.atualizacao.create({
      data: {
        versao,
        titulo,
        descricao,
        dataSaida,
        autor,
        commit,
      },
    });
    return { ok: true, data: atualizacao };
  } catch (error) {
    console.error("Erro ao criar atualizacao:", error);
    return { ok: false, erro: "Erro ao criar atualizacao" };
  }
}

export async function atualizarAtualizacao(
  id: string,
  titulo: string,
  descricao: string,
  dataSaida: Date,
  autor?: string,
  commit?: string,
): Promise<ActionResult> {
  try {
    const atualizacao = await prisma.atualizacao.update({
      where: { id },
      data: {
        titulo,
        descricao,
        dataSaida,
        autor,
        commit,
      },
    });
    return { ok: true, data: atualizacao };
  } catch (error) {
    console.error("Erro ao atualizar atualizacao:", error);
    return { ok: false, erro: "Erro ao atualizar atualizacao" };
  }
}

export async function deletarAtualizacao(id: string): Promise<ActionResult> {
  try {
    await prisma.atualizacao.delete({
      where: { id },
    });
    return { ok: true };
  } catch (error) {
    console.error("Erro ao deletar atualizacao:", error);
    return { ok: false, erro: "Erro ao deletar atualizacao" };
  }
}
