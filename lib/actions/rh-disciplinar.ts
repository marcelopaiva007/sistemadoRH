"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import type { ActionResult } from "@/lib/constants";

// Devolve o id da ocorrência criada porque a tela precisa dele para oferecer,
// logo após o registro, o link do documento a ser impresso e assinado
// (/api/rh/[empresaId]/disciplinar/[ocorrenciaId]/documento).
export type ResultadoOcorrencia = ActionResult & { ocorrenciaId?: string };

export async function criarOcorrenciaDisciplinar(
  empresaId: string,
  _prev: ResultadoOcorrencia,
  formData: FormData,
): Promise<ResultadoOcorrencia> {
  const usuario = await requireEmpresaAccess(empresaId);

  const colaboradorId = formData.get("colaboradorId") as string;
  const tipo = formData.get("tipo") as string;
  const motivo = formData.get("motivo") as string;
  const detalhes = (formData.get("detalhes") as string) || null;
  const dataFatoRaw = formData.get("dataFato") as string;

  if (!colaboradorId || !tipo || !motivo || !dataFatoRaw) {
    return { ok: false, error: "Preencha todos os campos obrigatórios." };
  }

  const diasSuspensaoRaw = formData.get("diasSuspensao") as string;
  const valorDescontoRaw = formData.get("valorDesconto") as string;

  const diasSuspensao = diasSuspensaoRaw ? parseInt(diasSuspensaoRaw, 10) : null;
  const valorDesconto = valorDescontoRaw ? parseFloat(valorDescontoRaw) : null;

  try {
    const ocorrencia = await prisma.ocorrenciaDisciplinar.create({
      data: {
        empresaId,
        colaboradorId,
        emitidoPorId: usuario.id,
        emitidoPorNome: usuario.username,
        tipo,
        motivo,
        detalhes,
        dataFato: new Date(dataFatoRaw),
        diasSuspensao,
        valorDesconto,
        statusAssinatura: "PENDENTE",
      },
      include: {
        colaborador: { select: { nome: true } },
      },
    });

    await registrarAuditoria({
      empresaId,
      acao: "CRIAR",
      entidade: "OcorrenciaDisciplinar",
      entidadeId: ocorrencia.id,
      resumo: `Criou medida disciplinar (${tipo}) para ${ocorrencia.colaborador.nome}`,
      detalhes: { tipo, motivo, colaboradorId },
    });

    revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
    revalidatePath(`/rh/${empresaId}/disciplinar`);

    return { ok: true, ocorrenciaId: ocorrencia.id };
  } catch (error) {
    console.error("Erro ao criar ocorrência disciplinar:", error);
    return { ok: false, error: "Falha ao salvar a ocorrência disciplinar." };
  }
}

export async function registrarAssinaturaOcorrencia(
  empresaId: string,
  ocorrenciaId: string,
  recusou: boolean,
  testemunha1?: { nome: string; cpf: string },
  testemunha2?: { nome: string; cpf: string },
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);

  try {
    const dados = recusou
      ? {
          statusAssinatura: "RECUSADO_COM_TESTEMUNHAS",
          dataAssinatura: new Date(),
          testemunha1Nome: testemunha1?.nome ?? null,
          testemunha1Cpf: testemunha1?.cpf ?? null,
          testemunha2Nome: testemunha2?.nome ?? null,
          testemunha2Cpf: testemunha2?.cpf ?? null,
        }
      : {
          statusAssinatura: "ASSINADO",
          dataAssinatura: new Date(),
        };

    const ocorrencia = await prisma.ocorrenciaDisciplinar.update({
      where: { id: ocorrenciaId, empresaId },
      data: dados,
      include: { colaborador: { select: { id: true, nome: true } } },
    });

    await registrarAuditoria({
      empresaId,
      acao: "ATUALIZAR",
      entidade: "OcorrenciaDisciplinar",
      entidadeId: ocorrencia.id,
      resumo: `${recusou ? "Registrou recusa com 2 testemunhas" : "Confirmou assinatura"} da ocorrência disciplinar de ${ocorrencia.colaborador.nome}`,
      detalhes: { recusou, testemunha1, testemunha2 },
    });

    revalidatePath(`/rh/${empresaId}/colaboradores/${ocorrencia.colaboradorId}`);
    revalidatePath(`/rh/${empresaId}/disciplinar`);

    return { ok: true };
  } catch (error) {
    console.error("Erro ao atualizar assinatura:", error);
    return { ok: false, error: "Falha ao atualizar o status de assinatura." };
  }
}
