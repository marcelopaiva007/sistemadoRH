"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { lerAnexo } from "@/lib/anexos";
import { dataDoFormulario, formatarData } from "@/lib/datas";
import { calcularValidade } from "@/lib/conformidade";
import {
  NORMAS_REGULAMENTADORAS,
  RESULTADOS_EXAME,
  TIPOS_EXAME,
  normaLabel,
  tipoExameLabel,
  validadePadraoDoExame,
} from "@/lib/constants-sst";
import type { ActionResult } from "@/lib/constants";

const NORMAS_VALIDAS = new Set<string>(NORMAS_REGULAMENTADORAS.map((n) => n.value));
const TIPOS_EXAME_VALIDOS = new Set<string>(TIPOS_EXAME.map((t) => t.value));
const RESULTADOS_VALIDOS = new Set<string>(RESULTADOS_EXAME.map((r) => r.value));

function lerInteiro(valor: FormDataEntryValue | null): number | null {
  const texto = typeof valor === "string" ? valor.trim() : "";
  if (texto === "") return null;
  const n = Number.parseInt(texto, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// ---------------------------------------------------------------
// Requisitos de NR por função
// ---------------------------------------------------------------

export async function definirRequisitoNR(
  empresaId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const posicaoId = String(formData.get("posicaoId") ?? "").trim();
  const norma = String(formData.get("norma") ?? "").trim();
  if (!NORMAS_VALIDAS.has(norma)) return { ok: false, error: "Selecione a norma." };

  const posicao = await prisma.posicao.findFirst({
    where: { id: posicaoId, empresaId },
    select: { id: true, nome: true },
  });
  if (!posicao) return { ok: false, error: "Função inválida para esta empresa." };

  const validadeMeses = lerInteiro(formData.get("validadeMeses"));
  if (validadeMeses !== null && validadeMeses > 120) {
    return { ok: false, error: "Periodicidade acima de 120 meses — confira o valor." };
  }
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null;

  // Upsert: redefinir a mesma norma para a mesma função atualiza a
  // periodicidade em vez de recusar com erro de duplicidade.
  await prisma.requisitoNR.upsert({
    where: { posicaoId_norma: { posicaoId, norma } },
    create: { empresaId, posicaoId, norma, validadeMeses, observacoes },
    update: { validadeMeses, observacoes },
  });

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "RequisitoNR",
    entidadeId: posicaoId,
    resumo: `${normaLabel(norma)} passou a ser exigida da função ${posicao.nome}.`,
    detalhes: { norma, validadeMeses },
  });

  revalidatePath(`/rh/${empresaId}/conformidade`);
  return { ok: true };
}

export async function removerRequisitoNR(empresaId: string, id: string): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const requisito = await prisma.requisitoNR.findFirst({
    where: { id, empresaId },
    select: { id: true, norma: true, posicao: { select: { nome: true } } },
  });
  if (!requisito) return { ok: false, error: "Requisito não encontrado." };

  await prisma.requisitoNR.delete({ where: { id } });
  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "RequisitoNR",
    entidadeId: id,
    resumo: `${normaLabel(requisito.norma)} deixou de ser exigida da função ${requisito.posicao.nome}.`,
  });

  revalidatePath(`/rh/${empresaId}/conformidade`);
  return { ok: true };
}

// ---------------------------------------------------------------
// Certificados de NR
// ---------------------------------------------------------------

export async function registrarCertificado(
  empresaId: string,
  colaboradorId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);

  const colaborador = await prisma.colaborador.findFirst({
    where: { id: colaboradorId, empresaId },
    select: { id: true, nome: true, posicaoId: true },
  });
  if (!colaborador) return { ok: false, error: "Colaborador não encontrado nesta empresa." };

  const norma = String(formData.get("norma") ?? "").trim();
  if (!NORMAS_VALIDAS.has(norma)) return { ok: false, error: "Selecione a norma." };

  const realizadoEm = dataDoFormulario(formData.get("realizadoEm"));
  if (!realizadoEm) return { ok: false, error: "Informe a data do treinamento." };

  // A periodicidade que vale é a do requisito da função; sem requisito
  // cadastrado, aceita a validade digitada no formulário.
  const requisito = await prisma.requisitoNR.findUnique({
    where: { posicaoId_norma: { posicaoId: colaborador.posicaoId, norma } },
    select: { validadeMeses: true },
  });
  const validadeInformada = lerInteiro(formData.get("validadeMeses"));
  const validoAte =
    dataDoFormulario(formData.get("validoAte")) ??
    calcularValidade(realizadoEm, requisito?.validadeMeses ?? validadeInformada);

  if (validoAte && validoAte < realizadoEm) {
    return { ok: false, error: "A validade não pode ser anterior à realização." };
  }

  const anexoLido = await lerAnexo(formData);
  if (!anexoLido.ok) return { ok: false, error: anexoLido.error };
  const anexo = anexoLido.anexo;

  const certificado = await prisma.$transaction(async (tx) => {
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

    return tx.certificadoNR.create({
      data: {
        empresaId,
        colaboradorId,
        norma,
        realizadoEm,
        validoAte,
        cargaHoraria: lerInteiro(formData.get("cargaHoraria")),
        instrutor: String(formData.get("instrutor") ?? "").trim() || null,
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
    entidade: "CertificadoNR",
    entidadeId: certificado.id,
    resumo: `${normaLabel(norma)} de ${colaborador.nome} registrada (${formatarData(realizadoEm)}${validoAte ? `, válida até ${formatarData(validoAte)}` : ""}).`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/conformidade`);
  revalidatePath(`/rh/${empresaId}/vencimentos`);
  return { ok: true };
}

export async function excluirCertificado(
  empresaId: string,
  colaboradorId: string,
  id: string,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const certificado = await prisma.certificadoNR.findFirst({
    where: { id, empresaId, colaboradorId },
    select: { id: true, norma: true, arquivoId: true, colaborador: { select: { nome: true } } },
  });
  if (!certificado) return { ok: false, error: "Certificado não encontrado." };

  // FK é SET NULL: o anexo precisa ir junto para não ficar órfão no banco.
  await prisma.$transaction(async (tx) => {
    await tx.certificadoNR.delete({ where: { id } });
    if (certificado.arquivoId) await tx.arquivo.delete({ where: { id: certificado.arquivoId } });
  });

  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "CertificadoNR",
    entidadeId: id,
    resumo: `${normaLabel(certificado.norma)} de ${certificado.colaborador.nome} excluída.`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/conformidade`);
  revalidatePath(`/rh/${empresaId}/vencimentos`);
  return { ok: true };
}

// ---------------------------------------------------------------
// Exames ocupacionais (ASO / PCMSO)
// ---------------------------------------------------------------

export async function registrarExame(
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
  if (!TIPOS_EXAME_VALIDOS.has(tipo)) return { ok: false, error: "Selecione o tipo do exame." };

  const resultado = String(formData.get("resultado") ?? "").trim();
  if (!RESULTADOS_VALIDOS.has(resultado)) return { ok: false, error: "Informe o resultado do exame." };

  const realizadoEm = dataDoFormulario(formData.get("realizadoEm"));
  if (!realizadoEm) return { ok: false, error: "Informe a data do exame." };

  const validoAte =
    dataDoFormulario(formData.get("validoAte")) ?? calcularValidade(realizadoEm, validadePadraoDoExame(tipo));
  if (validoAte && validoAte < realizadoEm) {
    return { ok: false, error: "A validade não pode ser anterior à realização." };
  }

  const restricoes = String(formData.get("restricoes") ?? "").trim() || null;
  if (resultado === "APTO_COM_RESTRICAO" && !restricoes) {
    return { ok: false, error: "Descreva a restrição — é ela que o gestor precisa respeitar na escala." };
  }

  const anexoLido = await lerAnexo(formData);
  if (!anexoLido.ok) return { ok: false, error: anexoLido.error };
  const anexo = anexoLido.anexo;

  const exame = await prisma.$transaction(async (tx) => {
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

    return tx.exameOcupacional.create({
      data: {
        empresaId,
        colaboradorId,
        tipo,
        realizadoEm,
        validoAte,
        resultado,
        restricoes,
        medico: String(formData.get("medico") ?? "").trim() || null,
        crm: String(formData.get("crm") ?? "").trim() || null,
        clinica: String(formData.get("clinica") ?? "").trim() || null,
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
    entidade: "ExameOcupacional",
    entidadeId: exame.id,
    // O resultado entra na trilha porque é o que define aptidão; a restrição
    // em si é dado de saúde e fica só no registro.
    resumo: `ASO ${tipoExameLabel(tipo).toLowerCase()} de ${colaborador.nome} em ${formatarData(realizadoEm)} — ${resultado.toLowerCase().replace(/_/g, " ")}.`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/conformidade`);
  revalidatePath(`/rh/${empresaId}/vencimentos`);
  return { ok: true };
}

export async function excluirExame(
  empresaId: string,
  colaboradorId: string,
  id: string,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const exame = await prisma.exameOcupacional.findFirst({
    where: { id, empresaId, colaboradorId },
    select: { id: true, tipo: true, arquivoId: true, colaborador: { select: { nome: true } } },
  });
  if (!exame) return { ok: false, error: "Exame não encontrado." };

  await prisma.$transaction(async (tx) => {
    await tx.exameOcupacional.delete({ where: { id } });
    if (exame.arquivoId) await tx.arquivo.delete({ where: { id: exame.arquivoId } });
  });

  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "ExameOcupacional",
    entidadeId: id,
    resumo: `ASO ${tipoExameLabel(exame.tipo).toLowerCase()} de ${exame.colaborador.nome} excluído.`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/conformidade`);
  revalidatePath(`/rh/${empresaId}/vencimentos`);
  return { ok: true };
}
