"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEmpresaAccess } from "@/lib/rh-auth-guard";
import { registrarAuditoria } from "@/lib/audit";
import { dataDoFormulario } from "@/lib/datas";
import { lerAnexo } from "@/lib/anexos";
import { TIPOS_DOCUMENTO, tipoDocumentoLabel } from "@/lib/constants-dp";
import type { ActionResult } from "@/lib/constants";
import { MSG_PROVA_DE_RECEBIMENTO, recibosConfirmadosTravando } from "@/lib/contracheques/protecao";
import {
  resolverMetadadosContrachequeManual,
  decidirSegundoContrachequeDossie,
} from "@/lib/contracheques/dossie";
import { camposResetAposInvalidacao } from "@/lib/contracheques/invalidacao";
import { gerarTokenAssinatura } from "@/lib/contracheques/token-auth";

const TIPOS_VALIDOS = new Set<string>(TIPOS_DOCUMENTO.map((t) => t.value));

export async function criarDocumento(
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
  if (!TIPOS_VALIDOS.has(tipo)) return { ok: false, error: "Selecione o tipo do documento." };

  const anexoLido = await lerAnexo(formData);
  if (!anexoLido.ok) return { ok: false, error: anexoLido.error };

  const descricao = String(formData.get("descricao") ?? "").trim() || null;
  const observacoes = String(formData.get("observacoes") ?? "").trim() || null;
  const emitidoEm = dataDoFormulario(formData.get("emitidoEm"));
  const validoAte = dataDoFormulario(formData.get("validoAte"));

  if (emitidoEm && validoAte && validoAte < emitidoEm) {
    return { ok: false, error: "A validade não pode ser anterior à emissão." };
  }

  const anexo = anexoLido.anexo;

  if (tipo === "CONTRACHEQUE") {
    if (!anexo) {
      return { ok: false, error: "Anexe o arquivo PDF do contracheque." };
    }
    const competenciaParam = String(formData.get("competencia") ?? "").trim() || null;
    const tipoFolhaParam = String(formData.get("tipoFolha") ?? "").trim() || null;
    const metadados = resolverMetadadosContrachequeManual({
      competencia: competenciaParam,
      tipoFolha: tipoFolhaParam,
      descricao,
    });
    if (!metadados) {
      return {
        ok: false,
        error: "Informe a competência do contracheque (mês e ano) no formulário ou na descrição.",
      };
    }

    const agora = new Date();

    const resultado = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT "id" FROM rh."Colaborador" WHERE "id" = ${colaboradorId} FOR UPDATE`;

      const candidatos = await tx.documentoColaborador.findMany({
        where: {
          colaboradorId,
          OR: [
            { chaveDedupe: metadados.chaveDedupe },
            ...(metadados.tipoFolha === "MENSAL"
              ? [
                  { tipo: "CONTRACHEQUE", competencia: metadados.competencia, chaveDedupe: null },
                  { tipo: "CONTRACHEQUE", competencia: null, descricao: { contains: metadados.mesAno, mode: "insensitive" as const } },
                ]
              : []),
          ],
        },
        select: {
          id: true,
          arquivoId: true,
          chaveDedupe: true,
          recibo: {
            select: {
              id: true,
              confirmadoEm: true,
            },
          },
        },
      });

      const candidatoEscolhido =
        candidatos.find((c) => Boolean(c.recibo?.confirmadoEm)) ??
        candidatos.find((c) => c.chaveDedupe === metadados.chaveDedupe) ??
        candidatos[0] ??
        null;

      const decisao = decidirSegundoContrachequeDossie(candidatoEscolhido, metadados.rotulo);

      if (decisao.acao === "BLOQUEAR_JA_ASSINADO") {
        return { ok: false as const, error: decisao.error };
      }

      if (decisao.acao === "SUBSTITUIR_PENDENTE") {
        const novoArquivo = await tx.arquivo.create({
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

        await tx.documentoColaborador.update({
          where: { id: decisao.documentoId },
          data: {
            arquivoId: novoArquivo.id,
            competencia: metadados.competencia,
            chaveDedupe: metadados.chaveDedupe,
            descricao: descricao ?? metadados.descricaoPadrao,
            emitidoEm,
            validoAte,
            observacoes,
            conferidoEm: agora,
            conferidoPorNome: usuario?.name ?? null,
          },
        });

        if (decisao.reciboId) {
          await tx.reciboContracheque.update({
            where: { id: decisao.reciboId },
            data: camposResetAposInvalidacao(gerarTokenAssinatura()),
          });
        }

        if (decisao.arquivoAnteriorId) {
          const [emUsoDocs, emUsoRecibos, emUsoInvalidados] = await Promise.all([
            tx.documentoColaborador.count({
              where: { arquivoId: decisao.arquivoAnteriorId },
            }),
            tx.reciboContracheque.count({
              where: {
                OR: [
                  { fotoArquivoId: decisao.arquivoAnteriorId },
                  { comprovanteArquivoId: decisao.arquivoAnteriorId },
                ],
              },
            }),
            tx.reciboContrachequeInvalidado.count({
              where: {
                OR: [
                  { fotoArquivoId: decisao.arquivoAnteriorId },
                  { comprovanteArquivoId: decisao.arquivoAnteriorId },
                ],
              },
            }),
          ]);

          if (emUsoDocs === 0 && emUsoRecibos === 0 && emUsoInvalidados === 0) {
            await tx.arquivo.delete({ where: { id: decisao.arquivoAnteriorId } });
          }
        }

        return {
          ok: true as const,
          substituido: true,
          documentoId: decisao.documentoId,
        };
      }

      // decisao.acao === "CRIAR"
      const novoArquivo = await tx.arquivo.create({
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

      const novoDoc = await tx.documentoColaborador.create({
        data: {
          empresaId,
          colaboradorId,
          tipo: "CONTRACHEQUE",
          descricao: descricao ?? metadados.descricaoPadrao,
          observacoes,
          emitidoEm,
          validoAte,
          competencia: metadados.competencia,
          chaveDedupe: metadados.chaveDedupe,
          arquivoId: novoArquivo.id,
          origem: "RH",
          conferidoEm: agora,
          conferidoPorNome: usuario?.name ?? null,
          criadoPorId: usuario?.id ?? null,
          criadoPorNome: usuario?.name ?? null,
        },
        select: { id: true },
      });

      return {
        ok: true as const,
        substituido: false,
        documentoId: novoDoc.id,
      };
    });

    if (!resultado.ok) {
      return { ok: false, error: resultado.error };
    }

    await registrarAuditoria({
      empresaId,
      acao: resultado.substituido ? "ATUALIZAR" : "CRIAR",
      entidade: "DocumentoColaborador",
      entidadeId: resultado.documentoId,
      resumo: resultado.substituido
        ? `Segunda via do contracheque ${metadados.rotulo} de ${colaborador.nome} anexada no Dossiê (substituiu PDF pendente anterior).`
        : `Contracheque ${metadados.rotulo} de ${colaborador.nome} anexado no Dossiê.`,
      detalhes: {
        tipo: "CONTRACHEQUE",
        competencia: metadados.mesAno,
        tipoFolha: metadados.tipoFolha,
        chaveDedupe: metadados.chaveDedupe,
        arquivo: anexo.nome,
        substituido: resultado.substituido,
      },
    });

    revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
    revalidatePath(`/rh/${empresaId}/vencimentos`);
    revalidatePath(`/rh/${empresaId}/contracheques`);
    revalidatePath("/portal");
    return { ok: true };
  }

  // O blob vai numa linha própria antes do documento (numa transação, para não
  // sobrar arquivo órfão se a segunda inserção falhar).
  const documento = await prisma.$transaction(async (tx) => {
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

    return tx.documentoColaborador.create({
      data: {
        empresaId,
        colaboradorId,
        tipo,
        descricao,
        observacoes,
        emitidoEm,
        validoAte,
        arquivoId: arquivo?.id ?? null,
        criadoPorId: usuario?.id ?? null,
        criadoPorNome: usuario?.name ?? null,
      },
    });
  });

  await registrarAuditoria({
    empresaId,
    acao: "CRIAR",
    entidade: "DocumentoColaborador",
    entidadeId: documento.id,
    resumo: `${tipoDocumentoLabel(tipo)} de ${colaborador.nome} ${anexo ? "anexado" : "cadastrado sem arquivo"}.`,
    detalhes: { tipo, arquivo: anexo?.nome ?? null, validoAte: validoAte?.toISOString() ?? null },
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/vencimentos`);
  return { ok: true };
}

export async function excluirDocumento(
  empresaId: string,
  colaboradorId: string,
  id: string,
): Promise<ActionResult> {
  await requireEmpresaAccess(empresaId);

  const documento = await prisma.documentoColaborador.findFirst({
    where: { id, empresaId, colaboradorId },
    select: {
      id: true,
      tipo: true,
      arquivoId: true,
      colaborador: { select: { nome: true } },
    },
  });
  if (!documento) return { ok: false, error: "Documento não encontrado." };

  // O FK é ON DELETE SET NULL: apagar só o documento deixaria o blob órfão no
  // banco — some da tela mas continua guardado, o oposto do que a LGPD pede.
  // Contracheque que a pessoa já confirmou com foto é prova de recebimento:
  // apagar o documento levaria a prova junto (o recibo sai em cascata).
  // Conferido DENTRO da transação, com o recibo travado.
  const apagou = await prisma.$transaction(async (tx) => {
    if ((await recibosConfirmadosTravando(tx, { documentoId: id })) > 0) return false;
    await tx.documentoColaborador.delete({ where: { id } });
    if (documento.arquivoId) await tx.arquivo.delete({ where: { id: documento.arquivoId } });
    return true;
  });
  if (!apagou) return { ok: false, error: MSG_PROVA_DE_RECEBIMENTO };

  await registrarAuditoria({
    empresaId,
    acao: "EXCLUIR",
    entidade: "DocumentoColaborador",
    entidadeId: id,
    resumo: `${tipoDocumentoLabel(documento.tipo)} de ${documento.colaborador.nome} excluído (arquivo removido do banco).`,
  });

  revalidatePath(`/rh/${empresaId}/colaboradores/${colaboradorId}`);
  revalidatePath(`/rh/${empresaId}/vencimentos`);
  return { ok: true };
}
