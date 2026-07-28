"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { lerSessaoPortal } from "@/lib/portal-auth";
import { registrarAuditoria } from "@/lib/audit";
import { lerAnexo } from "@/lib/anexos";
import { enviarParaBlob } from "@/lib/blob";
import { dataDoFormulario } from "@/lib/datas";
import { TIPOS_DOCUMENTO } from "@/lib/constants-dp";
import type { ActionResult } from "@/lib/constants";

// Autoatendimento cadastral do colaborador.
//
// A divisão entre o que entra direto e o que espera conferência não é
// burocracia: quem tomar o Telegram de alguém não pode trocar a chave PIX e
// desviar o pagamento. Então contato e endereço — errados, o pior caso é uma
// correspondência perdida — entram na hora; documento, banco e dependente
// passam pelo RH.
//
// Nada aqui recebe colaboradorId por parâmetro: sempre sai da sessão. Server
// action é endpoint público, e aceitar o id de fora deixaria qualquer pessoa
// logada editar a ficha de outra.

const texto = (fd: FormData, campo: string, max = 200) =>
  String(fd.get(campo) ?? "").trim().slice(0, max) || null;

/** Campos sem impacto em folha ou pagamento — gravam direto. */
export async function atualizarMeusDados(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const sessao = await lerSessaoPortal();
  if (!sessao) return { ok: false, error: "Sua sessão expirou. Peça /portal ao bot novamente." };

  const colaborador = await prisma.colaborador.findUnique({
    where: { id: sessao.colaboradorId },
    select: { id: true, nome: true, empresaId: true },
  });
  if (!colaborador) return { ok: false, error: "Cadastro não encontrado." };

  const email = texto(formData, "email");
  if (email && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) {
    return { ok: false, error: "E-mail inválido. Confira o endereço." };
  }
  const cep = String(formData.get("cep") ?? "").replace(/\D/g, "").slice(0, 8) || null;
  if (cep && cep.length !== 8) return { ok: false, error: "O CEP precisa ter 8 dígitos." };

  await prisma.colaborador.update({
    where: { id: colaborador.id },
    data: {
      email,
      telefone: texto(formData, "telefone", 40),
      estadoCivil: texto(formData, "estadoCivil", 40),
      escolaridade: texto(formData, "escolaridade", 60),
      nomeMae: texto(formData, "nomeMae"),
      nomePai: texto(formData, "nomePai"),
      nacionalidade: texto(formData, "nacionalidade", 60),
      naturalidade: texto(formData, "naturalidade", 80),
      cep,
      logradouro: texto(formData, "logradouro"),
      numeroEndereco: texto(formData, "numeroEndereco", 20),
      complemento: texto(formData, "complemento", 80),
      bairro: texto(formData, "bairro", 80),
      cidade: texto(formData, "cidade", 80),
      uf: String(formData.get("uf") ?? "").trim().toUpperCase().slice(0, 2) || null,
      emergenciaNome: texto(formData, "emergenciaNome"),
      emergenciaParentesco: texto(formData, "emergenciaParentesco", 40),
      emergenciaTelefone: texto(formData, "emergenciaTelefone", 40),
    },
  });

  await registrarAuditoria({
    empresaId: colaborador.empresaId,
    acao: "ATUALIZAR",
    entidade: "Colaborador",
    entidadeId: colaborador.id,
    resumo: `${colaborador.nome} atualizou os próprios dados cadastrais pelo portal.`,
  });

  revalidatePath("/portal");
  return { ok: true };
}

/**
 * Envio de cópia de documento. Entra como pendência: `origem = COLABORADOR` e
 * `conferidoEm` nulo. O RH confere o anexo contra o que foi digitado antes de
 * o dado virar verdade cadastral — um anexo trocado ou ilegível não pode
 * entrar na ficha sem ninguém olhar.
 */
export async function enviarMeuDocumento(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const sessao = await lerSessaoPortal();
  if (!sessao) return { ok: false, error: "Sua sessão expirou. Peça /portal ao bot novamente." };

  const colaborador = await prisma.colaborador.findUnique({
    where: { id: sessao.colaboradorId },
    select: { id: true, nome: true, empresaId: true },
  });
  if (!colaborador) return { ok: false, error: "Cadastro não encontrado." };

  const tipo = String(formData.get("tipo") ?? "").trim();
  if (!TIPOS_DOCUMENTO.some((t) => t.value === tipo)) {
    return { ok: false, error: "Selecione o tipo de documento." };
  }

  const leitura = await lerAnexo(formData);
  if (!leitura.ok) return { ok: false, error: leitura.error };
  if (!leitura.anexo) return { ok: false, error: "Anexe a foto ou o PDF do documento." };

  const envio = await enviarParaBlob({
    empresaId: colaborador.empresaId,
    colaboradorId: colaborador.id,
    nome: leitura.anexo.nome,
    mimeType: leitura.anexo.mimeType,
    bytes: leitura.anexo.bytes,
  });
  if (!envio.ok) return { ok: false, error: envio.error };

  const arquivo = await prisma.arquivo.create({
    data: {
      empresaId: colaborador.empresaId,
      nome: leitura.anexo.nome,
      mimeType: leitura.anexo.mimeType,
      tamanhoBytes: leitura.anexo.bytes.byteLength,
      blobUrl: envio.url,
      criadoPorNome: colaborador.nome,
    },
  });

  await prisma.documentoColaborador.create({
    data: {
      empresaId: colaborador.empresaId,
      colaboradorId: colaborador.id,
      tipo,
      descricao: texto(formData, "descricao"),
      emitidoEm: dataDoFormulario(formData.get("emitidoEm")),
      validoAte: dataDoFormulario(formData.get("validoAte")),
      observacoes: texto(formData, "observacoes", 500),
      origem: "COLABORADOR",
      criadoPorNome: colaborador.nome,
      arquivoId: arquivo.id,
    },
  });

  await registrarAuditoria({
    empresaId: colaborador.empresaId,
    acao: "CRIAR",
    entidade: "DocumentoColaborador",
    entidadeId: colaborador.id,
    resumo: `${colaborador.nome} enviou um documento pelo portal (aguardando conferência).`,
  });

  revalidatePath("/portal");
  revalidatePath(`/rh/${colaborador.empresaId}/pendencias`);
  return { ok: true };
}
