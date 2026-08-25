"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { lerAnexo } from "@/lib/anexos";
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

  // A pessoa É desta empresa? Era a ÚNICA action do RH que gravava na ficha de
  // um colaborador sem esta conferência — todas as irmãs a fazem
  // (rh-ausencias.ts, rh-cat.ts, rh-epi.ts, rh-folha.ts, rh-sst.ts), e as
  // outras três funções deste mesmo arquivo também. Como "use server" é
  // endpoint público, um POST à mão com o `empresaId` do próprio usuário e o
  // `colaboradorId` de alguém de OUTRO CNPJ gravava advertência, suspensão e
  // desconto na ficha dessa pessoa — a chave estrangeira aponta para
  // Colaborador(id) global, então o insert passava.
  if (!colaboradorId) return { ok: false, error: "Selecione o colaborador." };
  const colaborador = await prisma.colaborador.findFirst({
    where: { id: colaboradorId, empresaId },
    select: { id: true },
  });
  if (!colaborador) return { ok: false, error: "Colaborador não encontrado nesta empresa." };

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
  // Sem atribuir: quem registrou fica na trilha por `registrarAuditoria`, que
  // lê a sessão sozinho. A chamada aqui é a guarda de acesso, não o autor.
  await requireEmpresaAccess(empresaId);

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

/**
 * Guarda a VIA ASSINADA digitalizada de uma medida disciplinar.
 *
 * O sistema já gerava o documento em branco e já registrava o status da
 * assinatura, mas o papel assinado não tinha onde entrar — ficava na pasta
 * física. Status é afirmação; o anexo é a prova, e é ele que se pede numa
 * reclamatória.
 *
 * Recebe `FormData` (e não os campos soltos) porque é assim que um File
 * atravessa uma server action. Mesmo caminho de `registrarAusencia`.
 */
/**
 * Exclui uma medida disciplinar — para registro feito por engano ou teste.
 *
 * A justificativa é OBRIGATÓRIA e o conteúdo integral da ocorrência vai para
 * `detalhes` da auditoria antes do delete: medida disciplinar é registro com
 * peso legal (Art. 482 CLT, gradação de penas), e uma exclusão sem motivo e
 * sem cópia seria indistinguível de adulteração de histórico. Com o snapshot,
 * a exclusão é reversível e a trilha responde "o que foi apagado, por quem e
 * por quê".
 *
 * O anexo (via assinada) é apagado junto, dentro da mesma transação — o FK é
 * SET NULL e o arquivo ficaria órfão no banco, sem tela por onde alcançá-lo
 * (mesmo cuidado de excluirAusencia).
 */
export async function excluirOcorrenciaDisciplinar(
  empresaId: string,
  ocorrenciaId: string,
  motivoExclusao: string,
): Promise<ActionResult> {
  // Prisma remove `undefined` do WHERE: sem esta guarda, um POST direto com
  // empresaId ausente faria o findFirst buscar só por id — alcançando
  // ocorrência de OUTRA empresa para ADMIN/DIRETORIA, com auditoria fora da
  // trilha da empresa dona.
  if (typeof empresaId !== "string" || empresaId === "" || typeof ocorrenciaId !== "string" || ocorrenciaId === "") {
    return { ok: false, error: "Ocorrência ou empresa não informada." };
  }
  await requireEmpresaAccess(empresaId);

  const motivo = String(motivoExclusao ?? "").trim();
  if (motivo.length < 5) {
    return { ok: false, error: "Escreva o motivo da exclusão (mínimo 5 caracteres) — ele fica na trilha de auditoria." };
  }

  const atual = await prisma.ocorrenciaDisciplinar.findFirst({
    where: { id: ocorrenciaId, empresaId },
    include: { colaborador: { select: { nome: true } } },
  });
  if (!atual) return { ok: false, error: "Ocorrência não encontrada nesta empresa." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.ocorrenciaDisciplinar.delete({ where: { id: atual.id } });
      if (atual.arquivoId) await tx.arquivo.delete({ where: { id: atual.arquivoId } });
    });
  } catch (error) {
    console.error("Erro ao excluir ocorrência disciplinar:", error);
    return { ok: false, error: "Falha ao excluir a ocorrência. Tente de novo." };
  }

  // DEPOIS do delete, nunca antes: registrarAuditoria engole a própria falha
  // (nunca lança), então auditar antes podia deixar trilha de exclusão de um
  // registro que continuou existindo. O snapshot vem da linha já lida — o
  // conteúdo integral sobrevive na trilha mesmo com a linha apagada.
  const { colaborador, ...snapshot } = atual;
  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "OcorrenciaDisciplinar",
    entidadeId: atual.id,
    resumo: `Medida disciplinar (${atual.tipo}) de ${colaborador.nome} excluída. Motivo: ${motivo}`,
    detalhes: { motivoExclusao: motivo, ocorrencia: snapshot },
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${atual.colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/disciplinar`);
  return { ok: true };
}

export async function anexarViaAssinadaOcorrencia(
  empresaId: string,
  ocorrenciaId: string,
  formData: FormData,
): Promise<ActionResult> {
  const usuario = await requireEmpresaAccess(empresaId);

  const lido = await lerAnexo(formData);
  if (!lido.ok) return { ok: false, error: lido.error };
  if (!lido.anexo) return { ok: false, error: "Escolha o arquivo digitalizado." };
  const anexo = lido.anexo;

  // A ocorrência tem que ser DESTA empresa: o id vem do cliente.
  const atual = await prisma.ocorrenciaDisciplinar.findFirst({
    where: { id: ocorrenciaId, empresaId },
    select: { id: true, arquivoId: true, colaboradorId: true, colaborador: { select: { nome: true } } },
  });
  if (!atual) return { ok: false, error: "Ocorrência não encontrada nesta empresa." };

  try {
    await prisma.$transaction(async (tx) => {
      const arquivo = await tx.arquivo.create({
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
      });

      await tx.ocorrenciaDisciplinar.update({
        where: { id: atual.id },
        data: { arquivoId: arquivo.id },
      });

      // A relação é 1-para-1 (arquivoId é UNIQUE): substituir a via deixaria o
      // anexo anterior órfão no banco, sem nenhuma tela por onde alcançá-lo.
      // Apagado DEPOIS de trocar o vínculo, dentro da mesma transação.
      if (atual.arquivoId) await tx.arquivo.delete({ where: { id: atual.arquivoId } });
    });
  } catch (error) {
    console.error("Erro ao anexar via assinada:", error);
    return { ok: false, error: "Falha ao guardar o arquivo. Tente de novo." };
  }

  await registrarAuditoria({
    empresaId,
    acao: "ATUALIZAR",
    entidade: "OcorrenciaDisciplinar",
    entidadeId: atual.id,
    resumo: `Anexou a via assinada da ocorrência disciplinar de ${atual.colaborador.nome}`,
    detalhes: { arquivo: anexo.nome, substituiu: Boolean(atual.arquivoId) },
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${atual.colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/disciplinar`);
  return { ok: true };
}
