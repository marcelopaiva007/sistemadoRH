"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { lerAnexo } from "@/lib/anexos";
import { violouUnique } from "@/lib/prisma-erros";
import { ETAPAS_FUNIL, etapaFunilLabel, gerarSlugVaga, statusVagaLabel } from "@/lib/constants-ats";
import type { ActionResult } from "@/lib/constants";

const ETAPAS_VALIDAS = new Set<string>(ETAPAS_FUNIL.map((e) => e.value));
const STATUS_VALIDOS = new Set<string>(["ABERTA", "PAUSADA", "ENCERRADA"]);

const soDigitos = (v: string) => v.replace(/\D/g, "");

export async function criarVaga(
  empresaId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);

  const titulo = String(formData.get("titulo") ?? "").trim();
  if (!titulo) return { ok: false, error: "Dê um título à vaga." };

  const quantidadeTexto = String(formData.get("quantidade") ?? "1").trim();
  const quantidade = Number.parseInt(quantidadeTexto, 10);
  if (!Number.isInteger(quantidade) || quantidade < 1) {
    return { ok: false, error: "A quantidade de posições deve ser pelo menos 1." };
  }

  const setorId = String(formData.get("setorId") ?? "").trim() || null;
  const posicaoId = String(formData.get("posicaoId") ?? "").trim() || null;
  if (setorId) {
    const setor = await prisma.setor.findFirst({ where: { id: setorId, empresaId }, select: { id: true } });
    if (!setor) return { ok: false, error: "Setor não encontrado nesta empresa." };
  }
  if (posicaoId) {
    const posicao = await prisma.posicao.findFirst({ where: { id: posicaoId, empresaId }, select: { id: true } });
    if (!posicao) return { ok: false, error: "Cargo não encontrado nesta empresa." };
  }

  const vaga = await prisma.vaga.create({
    data: {
      empresaId,
      titulo,
      setorId,
      posicaoId,
      descricao: String(formData.get("descricao") ?? "").trim() || null,
      requisitos: String(formData.get("requisitos") ?? "").trim() || null,
      tipoContrato: String(formData.get("tipoContrato") ?? "").trim() || null,
      faixaSalarial: String(formData.get("faixaSalarial") ?? "").trim() || null,
      quantidade,
      slug: gerarSlugVaga(titulo),
      publicada: formData.get("publicada") === "true",
      criadoPorId: usuario?.id ?? null,
      criadoPorNome: usuario?.name ?? null,
    },
  });

  await registrarAuditoria({
    empresaId,
    acao: "CRIAR",
    entidade: "Vaga",
    entidadeId: vaga.id,
    resumo: `Vaga "${titulo}" aberta (${quantidade} posição(ões)).`,
  });

  revalidatePath(`/rh/${empresaId}/vagas`);
  return { ok: true };
}

export async function atualizarVaga(
  empresaId: string,
  vagaId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const vaga = await prisma.vaga.findFirst({ where: { id: vagaId, empresaId } });
  if (!vaga) return { ok: false, error: "Vaga não encontrada nesta empresa." };

  const status = String(formData.get("status") ?? "");
  if (!STATUS_VALIDOS.has(status)) return { ok: false, error: "Status inválido." };

  const quantidadeTexto = String(formData.get("quantidade") ?? "1").trim();
  const quantidade = Number.parseInt(quantidadeTexto, 10);
  if (!Number.isInteger(quantidade) || quantidade < 1) {
    return { ok: false, error: "A quantidade de posições deve ser pelo menos 1." };
  }

  await prisma.vaga.update({
    where: { id: vagaId },
    data: {
      status,
      quantidade,
      publicada: formData.get("publicada") === "true",
      descricao: String(formData.get("descricao") ?? "").trim() || null,
      requisitos: String(formData.get("requisitos") ?? "").trim() || null,
      faixaSalarial: String(formData.get("faixaSalarial") ?? "").trim() || null,
      // Só carimba o encerramento na transição — reabrir limpa a data.
      encerradaEm: status === "ENCERRADA" ? (vaga.encerradaEm ?? new Date()) : null,
    },
  });

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "Vaga",
    entidadeId: vagaId,
    resumo: `Vaga "${vaga.titulo}" atualizada — ${statusVagaLabel(status)}.`,
  });

  revalidatePath(`/rh/${empresaId}/vagas`);
  revalidatePath(`/rh/${empresaId}/vagas/${vagaId}`);
  return { ok: true };
}

export async function excluirVaga(empresaId: string, vagaId: string): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const vaga = await prisma.vaga.findFirst({
    where: { id: vagaId, empresaId },
    select: { id: true, titulo: true, _count: { select: { candidaturas: true } } },
  });
  if (!vaga) return { ok: false, error: "Vaga não encontrada nesta empresa." };
  if (vaga._count.candidaturas > 0) {
    return {
      ok: false,
      error: "Esta vaga já tem candidatos. Encerre a vaga em vez de excluir — o histórico do processo seletivo não pode ser apagado.",
    };
  }

  await prisma.vaga.delete({ where: { id: vagaId } });
  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "Vaga",
    entidadeId: vagaId,
    resumo: `Vaga "${vaga.titulo}" excluída (sem candidatos).`,
  });

  revalidatePath(`/rh/${empresaId}/vagas`);
  return { ok: true };
}

/**
 * Cadastra um candidato pelo RH e já o inscreve na vaga. Se o CPF já existir
 * na empresa, reaproveita o candidato do banco de talentos em vez de duplicar.
 */
export async function inscreverCandidato(
  empresaId: string,
  vagaId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);

  const vaga = await prisma.vaga.findFirst({ where: { id: vagaId, empresaId }, select: { id: true, titulo: true } });
  if (!vaga) return { ok: false, error: "Vaga não encontrada nesta empresa." };

  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) return { ok: false, error: "Informe o nome do candidato." };

  const cpfBruto = String(formData.get("cpf") ?? "").trim();
  const cpf = cpfBruto ? soDigitos(cpfBruto) : null;
  if (cpf && cpf.length !== 11) return { ok: false, error: "CPF deve ter 11 dígitos." };

  const anexoLido = await lerAnexo(formData);
  if (!anexoLido.ok) return { ok: false, error: anexoLido.error };
  const anexo = anexoLido.anexo;

  const dadosContato = {
    email: String(formData.get("email") ?? "").trim() || null,
    telefone: String(formData.get("telefone") ?? "").trim() || null,
    cidade: String(formData.get("cidade") ?? "").trim() || null,
    linkedin: String(formData.get("linkedin") ?? "").trim() || null,
    observacoes: String(formData.get("observacoes") ?? "").trim() || null,
  };

  const existente = cpf
    ? await prisma.candidato.findUnique({ where: { empresaId_cpf: { empresaId, cpf } }, select: { id: true } })
    : null;

  try {
    await prisma.$transaction(async (tx) => {
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

      const candidato = existente
        ? await tx.candidato.update({
            where: { id: existente.id },
            // Currículo novo substitui o antigo; sem anexo, mantém o que já tinha.
            data: { nome, ...dadosContato, ...(arquivo ? { arquivoId: arquivo.id } : {}) },
          })
        : await tx.candidato.create({
            data: { empresaId, nome, cpf, ...dadosContato, origem: "RH", arquivoId: arquivo?.id ?? null },
          });

      const candidatura = await tx.candidatura.create({
        data: { empresaId, vagaId, candidatoId: candidato.id, etapa: "TRIAGEM" },
      });
      await tx.eventoCandidatura.create({
        data: {
          candidaturaId: candidatura.id,
          etapaNova: "TRIAGEM",
          motivo: "Inscrição cadastrada pelo RH.",
          registradoPorId: usuario?.id ?? null,
          registradoPorNome: usuario?.name ?? null,
        },
      });
    });
  } catch (e) {
    if (violouUnique(e, "Candidatura_vagaId_candidatoId_key")) {
      return { ok: false, error: "Este candidato já está inscrito nesta vaga." };
    }
    throw e;
  }

  await registrarAuditoria({
    empresaId,
    acao: "CRIAR",
    entidade: "Candidatura",
    entidadeId: vagaId,
    resumo: `${nome} inscrito(a) na vaga "${vaga.titulo}".`,
  });

  revalidatePath(`/rh/${empresaId}/vagas/${vagaId}`);
  revalidatePath(`/rh/${empresaId}/candidatos`);
  return { ok: true };
}

export async function moverEtapa(
  empresaId: string,
  candidaturaId: string,
  etapaNova: string,
  motivo?: string,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);

  if (!ETAPAS_VALIDAS.has(etapaNova)) return { ok: false, error: "Etapa inválida." };

  const candidatura = await prisma.candidatura.findFirst({
    where: { id: candidaturaId, empresaId },
    select: {
      id: true,
      etapa: true,
      vagaId: true,
      candidato: { select: { nome: true } },
      vaga: { select: { titulo: true } },
    },
  });
  if (!candidatura) return { ok: false, error: "Candidatura não encontrada." };
  if (candidatura.etapa === etapaNova) return { ok: false, error: "O candidato já está nesta etapa." };

  await prisma.$transaction(async (tx) => {
    await tx.candidatura.update({
      where: { id: candidaturaId },
      data: { etapa: etapaNova, motivo: motivo?.trim() || null },
    });
    await tx.eventoCandidatura.create({
      data: {
        candidaturaId,
        etapaAnterior: candidatura.etapa,
        etapaNova,
        motivo: motivo?.trim() || null,
        registradoPorId: usuario?.id ?? null,
        registradoPorNome: usuario?.name ?? null,
      },
    });
  });

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "Candidatura",
    entidadeId: candidaturaId,
    resumo: `${candidatura.candidato.nome} movido(a) de ${etapaFunilLabel(candidatura.etapa)} para ${etapaFunilLabel(etapaNova)} na vaga "${candidatura.vaga.titulo}".`,
  });

  revalidatePath(`/rh/${empresaId}/vagas/${candidatura.vagaId}`);
  revalidatePath(`/rh/${empresaId}/candidatos`);
  return { ok: true };
}

export async function excluirCandidatura(empresaId: string, candidaturaId: string): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const candidatura = await prisma.candidatura.findFirst({
    where: { id: candidaturaId, empresaId },
    select: { id: true, vagaId: true, candidato: { select: { nome: true } }, vaga: { select: { titulo: true } } },
  });
  if (!candidatura) return { ok: false, error: "Candidatura não encontrada." };

  // Só a candidatura sai; o candidato continua no banco de talentos.
  await prisma.candidatura.delete({ where: { id: candidaturaId } });

  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "Candidatura",
    entidadeId: candidaturaId,
    resumo: `Candidatura de ${candidatura.candidato.nome} na vaga "${candidatura.vaga.titulo}" removida (candidato mantido no banco de talentos).`,
  });

  revalidatePath(`/rh/${empresaId}/vagas/${candidatura.vagaId}`);
  return { ok: true };
}
