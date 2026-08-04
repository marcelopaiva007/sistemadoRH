"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { lerAnexo } from "@/lib/anexos";
import { dataDoFormulario, formatarData } from "@/lib/datas";
import { calcularValidade } from "@/lib/conformidade";
import { tipoEpiLabel } from "@/lib/constants-epi";
import { opcoesDoCatalogo, valoresValidosDoCatalogo } from "@/lib/catalogos";
import type { ActionResult } from "@/lib/constants";

function lerInteiro(valor: FormDataEntryValue | null): number | null {
  const texto = typeof valor === "string" ? valor.trim() : "";
  if (texto === "") return null;
  const n = Number.parseInt(texto, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function registrarEntregaEpi(
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
  const tiposDisponiveis = await opcoesDoCatalogo(empresaId, "TIPO_EPI");
  const opcaoTipo = tiposDisponiveis.find((t) => t.value === tipo);
  if (!opcaoTipo) return { ok: false, error: "Selecione o tipo de EPI." };

  const motivo = String(formData.get("motivo") ?? "PRIMEIRA_ENTREGA").trim();
  const motivosValidos = await valoresValidosDoCatalogo(empresaId, "MOTIVO_ENTREGA_EPI");
  if (!motivosValidos.has(motivo)) return { ok: false, error: "Motivo da entrega inválido." };

  const dataEntrega = dataDoFormulario(formData.get("dataEntrega"));
  if (!dataEntrega) return { ok: false, error: "Informe a data da entrega." };

  const validadeInformada = lerInteiro(formData.get("validadeMeses"));
  const validadeMeses = validadeInformada ?? opcaoTipo.validadeMeses ?? null;
  const validoAte = dataDoFormulario(formData.get("validoAte")) ?? calcularValidade(dataEntrega, validadeMeses);
  if (validoAte && validoAte < dataEntrega) {
    return { ok: false, error: "A validade não pode ser anterior à entrega." };
  }

  const quantidade = lerInteiro(formData.get("quantidade")) ?? 1;
  const assinado = formData.get("assinado") === "true";

  const anexoLido = await lerAnexo(formData);
  if (!anexoLido.ok) return { ok: false, error: anexoLido.error };
  const anexo = anexoLido.anexo;

  const entrega = await prisma.$transaction(async (tx) => {
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

    return tx.entregaEPI.create({
      data: {
        empresaId,
        colaboradorId,
        tipo,
        motivo,
        ca: String(formData.get("ca") ?? "").trim() || null,
        fabricante: String(formData.get("fabricante") ?? "").trim() || null,
        quantidade,
        dataEntrega,
        validadeMeses,
        validoAte,
        assinado,
        observacoes: String(formData.get("observacoes") ?? "").trim() || null,
        arquivoId: arquivo?.id ?? null,
        criadoPorId: usuario?.id ?? null,
        criadoPorNome: usuario?.name ?? null,
      },
    });
  });

  await registrarAuditoria({
    empresaId,
    acao: "CRIAR",
    entidade: "EntregaEPI",
    entidadeId: entrega.id,
    resumo: `${tipoEpiLabel(tipo)} entregue a ${colaborador.nome} em ${formatarData(dataEntrega)}${assinado ? " (ficha assinada)" : " (assinatura pendente)"}.`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/vencimentos`);
  return { ok: true };
}

export async function confirmarAssinaturaEpi(
  empresaId: string,
  colaboradorId: string,
  id: string,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const entrega = await prisma.entregaEPI.findFirst({
    where: { id, empresaId, colaboradorId },
    select: { id: true, tipo: true, assinado: true, colaborador: { select: { nome: true } } },
  });
  if (!entrega) return { ok: false, error: "Entrega não encontrada." };
  if (entrega.assinado) return { ok: false, error: "Esta entrega já está marcada como assinada." };

  await prisma.entregaEPI.update({ where: { id }, data: { assinado: true } });
  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "EntregaEPI",
    entidadeId: id,
    resumo: `Ficha de ${tipoEpiLabel(entrega.tipo)} de ${entrega.colaborador.nome} marcada como assinada.`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  return { ok: true };
}

export async function excluirEntregaEpi(
  empresaId: string,
  colaboradorId: string,
  id: string,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const entrega = await prisma.entregaEPI.findFirst({
    where: { id, empresaId, colaboradorId },
    select: { id: true, tipo: true, arquivoId: true, colaborador: { select: { nome: true } } },
  });
  if (!entrega) return { ok: false, error: "Entrega não encontrada." };

  await prisma.$transaction(async (tx) => {
    await tx.entregaEPI.delete({ where: { id } });
    if (entrega.arquivoId) await tx.arquivo.delete({ where: { id: entrega.arquivoId } });
  });

  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "EntregaEPI",
    entidadeId: id,
    resumo: `Entrega de ${tipoEpiLabel(entrega.tipo)} de ${entrega.colaborador.nome} excluída.`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/vencimentos`);
  return { ok: true };
}
