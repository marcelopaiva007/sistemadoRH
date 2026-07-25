"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { lerAnexo } from "@/lib/anexos";
import { violouUnique } from "@/lib/prisma-erros";
import { dataDoFormulario } from "@/lib/datas";
import { COMPETENCIAS } from "@/lib/constants-avaliacao";
import type { ActionResult } from "@/lib/constants";

const COMPETENCIAS_VALIDAS = new Set<string>(COMPETENCIAS.map((c) => c.value));

function lerCompetencias(formData: FormData): string[] {
  return formData.getAll("competencias").map(String).filter((c) => COMPETENCIAS_VALIDAS.has(c));
}

export async function criarTreinamento(
  empresaId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) return { ok: false, error: "Dê um nome ao treinamento." };

  const cargaTexto = String(formData.get("cargaHoraria") ?? "").trim();
  const cargaHoraria = cargaTexto ? Number.parseInt(cargaTexto, 10) : null;
  if (cargaHoraria !== null && (!Number.isInteger(cargaHoraria) || cargaHoraria <= 0)) {
    return { ok: false, error: "Carga horária deve ser um número positivo." };
  }

  try {
    const treinamento = await prisma.treinamento.create({
      data: {
        empresaId,
        nome,
        descricao: String(formData.get("descricao") ?? "").trim() || null,
        categoria: String(formData.get("categoria") ?? "").trim() || null,
        cargaHoraria,
        competencias: lerCompetencias(formData),
      },
    });

    await registrarAuditoria({
      empresaId,
      acao: "CRIAR",
      entidade: "Treinamento",
      entidadeId: treinamento.id,
      resumo: `Treinamento "${nome}" adicionado ao catálogo.`,
    });
  } catch (e) {
    if (violouUnique(e, "Treinamento_empresaId_nome_key")) {
      return { ok: false, error: "Já existe um treinamento com este nome." };
    }
    throw e;
  }

  revalidatePath(`/rh/${empresaId}/treinamentos`);
  return { ok: true };
}

export async function alternarTreinamentoAtivo(empresaId: string, treinamentoId: string): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const treinamento = await prisma.treinamento.findFirst({ where: { id: treinamentoId, empresaId } });
  if (!treinamento) return { ok: false, error: "Treinamento não encontrado nesta empresa." };

  await prisma.treinamento.update({ where: { id: treinamentoId }, data: { ativo: !treinamento.ativo } });

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "Treinamento",
    entidadeId: treinamentoId,
    resumo: `Treinamento "${treinamento.nome}" ${treinamento.ativo ? "desativado" : "ativado"}.`,
  });

  revalidatePath(`/rh/${empresaId}/treinamentos`);
  return { ok: true };
}

export async function registrarParticipacao(
  empresaId: string,
  colaboradorId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);

  const colaborador = await prisma.colaborador.findFirst({ where: { id: colaboradorId, empresaId }, select: { nome: true } });
  if (!colaborador) return { ok: false, error: "Colaborador não encontrado nesta empresa." };

  const treinamentoId = String(formData.get("treinamentoId") ?? "").trim();
  const treinamento = await prisma.treinamento.findFirst({ where: { id: treinamentoId, empresaId }, select: { nome: true } });
  if (!treinamento) return { ok: false, error: "Selecione um treinamento válido." };

  const dataRealizacao = dataDoFormulario(formData.get("dataRealizacao"));
  if (!dataRealizacao) return { ok: false, error: "Informe a data de realização." };

  const notaTexto = String(formData.get("notaAvaliacao") ?? "").trim();
  const notaAvaliacao = notaTexto ? Number.parseInt(notaTexto, 10) : null;
  if (notaAvaliacao !== null && (notaAvaliacao < 1 || notaAvaliacao > 5)) {
    return { ok: false, error: "A nota de avaliação deve ser de 1 a 5." };
  }

  const anexoLido = await lerAnexo(formData);
  if (!anexoLido.ok) return { ok: false, error: anexoLido.error };
  const anexo = anexoLido.anexo;

  try {
    const participacao = await prisma.$transaction(async (tx) => {
      const arquivo = anexo
        ? await tx.arquivo.create({
            data: {
              empresaId,
              nome: anexo.nome,
              mimeType: anexo.mimeType,
              tamanhoBytes: anexo.bytes.byteLength,
              conteudo: anexo.bytes,
              criadoPorId: usuario?.id ?? null,
              criadoPorNome: usuario?.name ?? null,
            },
            select: { id: true },
          })
        : null;

      return tx.participacaoTreinamento.create({
        data: {
          empresaId,
          colaboradorId,
          treinamentoId,
          dataRealizacao,
          presente: formData.get("presente") === "true",
          notaAvaliacao,
          certificadoEmitido: formData.get("certificadoEmitido") === "true",
          observacoes: String(formData.get("observacoes") ?? "").trim() || null,
          arquivoId: arquivo?.id ?? null,
          registradoPorId: usuario?.id ?? null,
          registradoPorNome: usuario?.name ?? null,
        },
      });
    });

    await registrarAuditoria({
      empresaId,
      acao: "CRIAR",
      entidade: "ParticipacaoTreinamento",
      entidadeId: participacao.id,
      resumo: `${colaborador.nome} participou de "${treinamento.nome}" em ${dataRealizacao.toISOString().slice(0, 10)}.`,
    });
  } catch (e) {
    if (violouUnique(e, "ParticipacaoTreinamento_colaboradorId_treinamentoId_dataRea_key")) {
      return { ok: false, error: "Já existe um registro deste treinamento para esta pessoa nesta data." };
    }
    throw e;
  }

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/treinamentos`);
  return { ok: true };
}

export async function excluirParticipacao(
  empresaId: string,
  colaboradorId: string,
  id: string,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const participacao = await prisma.participacaoTreinamento.findFirst({
    where: { id, empresaId, colaboradorId },
    select: { id: true, arquivoId: true, treinamento: { select: { nome: true } }, colaborador: { select: { nome: true } } },
  });
  if (!participacao) return { ok: false, error: "Registro não encontrado." };

  await prisma.$transaction(async (tx) => {
    await tx.participacaoTreinamento.delete({ where: { id } });
    if (participacao.arquivoId) await tx.arquivo.delete({ where: { id: participacao.arquivoId } });
  });

  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "ParticipacaoTreinamento",
    entidadeId: id,
    resumo: `Participação de ${participacao.colaborador.nome} em "${participacao.treinamento.nome}" removida.`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/treinamentos`);
  return { ok: true };
}
