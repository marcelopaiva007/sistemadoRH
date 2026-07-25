"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { lerAnexo } from "@/lib/anexos";
import { dataDoFormulario, formatarData, formatarDataHoraBrasilia } from "@/lib/datas";
import { TIPOS_ACIDENTE, tipoAcidenteLabel } from "@/lib/constants-cat";
import type { ActionResult } from "@/lib/constants";

const TIPOS_VALIDOS = new Set<string>(TIPOS_ACIDENTE.map((t) => t.value));

/** Lê data + hora de dois campos separados (<input type=date> + <input type=time>). */
function lerDataHora(formData: FormData, campoData: string, campoHora: string): Date | null {
  const data = dataDoFormulario(formData.get(campoData));
  if (!data) return null;
  const hora = String(formData.get(campoHora) ?? "").trim();
  const match = /^(\d{2}):(\d{2})$/.exec(hora);
  if (!match) return data;
  const [, hh, mm] = match;
  return new Date(data.getTime() + (Number(hh) * 60 + Number(mm)) * 60_000);
}

export async function registrarAcidente(
  empresaId: string,
  colaboradorId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);

  const colaborador = await prisma.colaborador.findFirst({
    where: { id: colaboradorId, empresaId },
    select: { id: true, nome: true },
  });
  if (!colaborador) return { ok: false, error: "Colaborador não encontrado nesta empresa." };

  const tipo = String(formData.get("tipo") ?? "").trim();
  if (!TIPOS_VALIDOS.has(tipo)) return { ok: false, error: "Selecione o tipo do acidente." };

  const dataHora = lerDataHora(formData, "data", "hora");
  if (!dataHora) return { ok: false, error: "Informe a data do acidente." };

  const descricao = String(formData.get("descricao") ?? "").trim();
  if (descricao.length < 5) return { ok: false, error: "Descreva o que aconteceu." };

  let houveAfastamento = formData.get("houveAfastamento") === "true";
  const ausenciaId = String(formData.get("ausenciaId") ?? "").trim() || null;

  if (ausenciaId) {
    const ausencia = await prisma.ausencia.findFirst({
      where: { id: ausenciaId, colaboradorId, tipo: "ACIDENTE_TRABALHO" },
      select: { id: true, acidente: { select: { id: true } } },
    });
    if (!ausencia) return { ok: false, error: "Ausência selecionada não é um afastamento por acidente deste colaborador." };
    if (ausencia.acidente) return { ok: false, error: "Essa ausência já está vinculada a outro registro de acidente." };
    houveAfastamento = true;
  }

  const anexoLido = await lerAnexo(formData);
  if (!anexoLido.ok) return { ok: false, error: anexoLido.error };
  const anexo = anexoLido.anexo;

  const acidente = await prisma.$transaction(async (tx) => {
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

    return tx.acidenteTrabalho.create({
      data: {
        empresaId,
        colaboradorId,
        tipo,
        dataHora,
        local: String(formData.get("local") ?? "").trim() || null,
        descricao,
        parteCorpoAtingida: String(formData.get("parteCorpoAtingida") ?? "").trim() || null,
        natureza: String(formData.get("natureza") ?? "").trim() || null,
        houveAfastamento,
        ausenciaId,
        testemunhas: String(formData.get("testemunhas") ?? "").trim() || null,
        arquivoId: arquivo?.id ?? null,
        registradoPorId: usuario?.id ?? null,
        registradoPorNome: usuario?.name ?? null,
      },
    });
  });

  await registrarAuditoria({
    empresaId,
    acao: "CRIAR",
    entidade: "AcidenteTrabalho",
    entidadeId: acidente.id,
    resumo: `Acidente de trabalho (${tipoAcidenteLabel(tipo)}) de ${colaborador.nome} registrado em ${formatarDataHoraBrasilia(dataHora)}.`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/acidentes`);
  return { ok: true };
}

export async function marcarCatEmitida(
  empresaId: string,
  colaboradorId: string,
  id: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const acidente = await prisma.acidenteTrabalho.findFirst({
    where: { id, empresaId, colaboradorId },
    select: { id: true, catEmitida: true, colaborador: { select: { nome: true } } },
  });
  if (!acidente) return { ok: false, error: "Acidente não encontrado." };
  if (acidente.catEmitida) return { ok: false, error: "A CAT deste acidente já está marcada como emitida." };

  const catNumero = String(formData.get("catNumero") ?? "").trim();
  if (!catNumero) return { ok: false, error: "Informe o número da CAT emitida." };
  const catEmitidaEm = dataDoFormulario(formData.get("catEmitidaEm"));
  if (!catEmitidaEm) return { ok: false, error: "Informe a data de emissão da CAT." };

  await prisma.acidenteTrabalho.update({
    where: { id },
    data: { catEmitida: true, catNumero, catEmitidaEm },
  });
  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "AcidenteTrabalho",
    entidadeId: id,
    resumo: `CAT nº ${catNumero} emitida para o acidente de ${acidente.colaborador.nome} (${formatarData(catEmitidaEm)}).`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/acidentes`);
  return { ok: true };
}

export async function concluirAcidente(
  empresaId: string,
  colaboradorId: string,
  id: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const acidente = await prisma.acidenteTrabalho.findFirst({
    where: { id, empresaId, colaboradorId },
    select: { id: true, situacao: true, colaborador: { select: { nome: true } } },
  });
  if (!acidente) return { ok: false, error: "Acidente não encontrado." };
  if (acidente.situacao === "CONCLUIDO") return { ok: false, error: "Este registro já está concluído." };

  const medidasCorretivas = String(formData.get("medidasCorretivas") ?? "").trim() || null;

  await prisma.acidenteTrabalho.update({
    where: { id },
    data: { situacao: "CONCLUIDO", medidasCorretivas },
  });
  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "AcidenteTrabalho",
    entidadeId: id,
    resumo: `Investigação do acidente de ${acidente.colaborador.nome} concluída.`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/acidentes`);
  return { ok: true };
}

export async function excluirAcidente(
  empresaId: string,
  colaboradorId: string,
  id: string,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const acidente = await prisma.acidenteTrabalho.findFirst({
    where: { id, empresaId, colaboradorId },
    select: { id: true, tipo: true, arquivoId: true, colaborador: { select: { nome: true } } },
  });
  if (!acidente) return { ok: false, error: "Acidente não encontrado." };

  // Apaga só o registro do acidente — a Ausencia vinculada (o afastamento em
  // si) permanece intacta, é um dado independente que já existia antes.
  await prisma.$transaction(async (tx) => {
    await tx.acidenteTrabalho.delete({ where: { id } });
    if (acidente.arquivoId) await tx.arquivo.delete({ where: { id: acidente.arquivoId } });
  });

  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "AcidenteTrabalho",
    entidadeId: id,
    resumo: `Registro de acidente de trabalho de ${acidente.colaborador.nome} excluído.`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/acidentes`);
  return { ok: true };
}
