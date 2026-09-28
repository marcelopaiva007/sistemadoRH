// Envio de contracheques — o lado do colaborador: abrir e confirmar.
//
// A confirmação é a "assinatura" do recebimento: só vale depois de a pessoa
// ABRIR o contracheque (vistoEm), leva uma selfie (a mesma régua da foto do
// ponto, lib/ponto-foto.ts) e grava o hash do arquivo que ela viu — se o
// contracheque for trocado depois, a prova continua dizendo qual era.
//
// Quem chama (a rota e a action do portal) já conferiu a sessão; aqui tudo é
// amarrado ao colaboradorId dela, nunca ao id que veio da tela.
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/audit";
import { baixarDoBlob, blobConfigurado, enviarParaBlob, removerDoBlob } from "@/lib/blob";
import { fotoDeBatidaValida, REGEX_FOTO_DATA_URL } from "@/lib/ponto-foto";
import { rotuloDoContracheque } from "./situacao";

const ator = (id: string, nome: string) => ({ id, nome, papel: "COLABORADOR" as const });

async function bytesDo(arquivo: { blobUrl: string | null; conteudo: Uint8Array | null }): Promise<Uint8Array | null> {
  if (arquivo.blobUrl) {
    const lido = await baixarDoBlob(arquivo.blobUrl);
    return lido.ok ? new Uint8Array(lido.bytes) : null;
  }
  return arquivo.conteudo ? new Uint8Array(arquivo.conteudo) : null;
}

/**
 * Abre o contracheque da própria pessoa: devolve o arquivo e marca a primeira
 * abertura. Só recibo já enviado — o que o RH ainda não mandou não aparece.
 */
export async function abrirContracheque(reciboId: string, colaboradorId: string) {
  const recibo = await prisma.reciboContracheque.findFirst({
    where: { id: reciboId, colaboradorId, enviadoEm: { not: null } },
    select: {
      id: true,
      empresaId: true,
      vistoEm: true,
      competencia: true,
      tipoFolha: true,
      colaborador: { select: { nome: true } },
      documento: { select: { arquivo: { select: { nome: true, mimeType: true, blobUrl: true, conteudo: true } } } },
    },
  });
  const arquivo = recibo?.documento.arquivo;
  if (!recibo || !arquivo) return null;
  const bytes = await bytesDo(arquivo);
  if (!bytes) return null;
  if (!recibo.vistoEm) {
    await prisma.reciboContracheque.updateMany({ where: { id: recibo.id, vistoEm: null }, data: { vistoEm: new Date() } });
    await registrarAuditoria({
      empresaId: recibo.empresaId,
      acao: "BAIXAR_DOCUMENTO",
      entidade: "ReciboContracheque",
      entidadeId: recibo.id,
      resumo: `Abriu o contracheque de ${rotuloDoContracheque(recibo.competencia, recibo.tipoFolha)} pelo portal.`,
      ator: ator(colaboradorId, recibo.colaborador.nome),
    });
  }
  return { nome: arquivo.nome, mimeType: arquivo.mimeType, bytes };
}

export type Confirmacao = { ok: true } | { ok: false; error: string };

export async function confirmarRecebimento(params: {
  reciboId: string;
  colaboradorId: string;
  fotoDataUrl: string | null | undefined;
  ip: string;
  dispositivo: string | null;
}): Promise<Confirmacao> {
  const recibo = await prisma.reciboContracheque.findFirst({
    where: { id: params.reciboId, colaboradorId: params.colaboradorId, enviadoEm: { not: null } },
    select: {
      id: true,
      empresaId: true,
      colaboradorId: true,
      vistoEm: true,
      confirmadoEm: true,
      competencia: true,
      tipoFolha: true,
      colaborador: { select: { nome: true } },
      documento: { select: { arquivo: { select: { blobUrl: true, conteudo: true } } } },
    },
  });
  if (!recibo) return { ok: false, error: "Contracheque não encontrado." };
  if (recibo.confirmadoEm) return { ok: true };
  if (!recibo.vistoEm) return { ok: false, error: "Abra o contracheque antes de confirmar o recebimento." };
  // A mesma régua da batida de ponto: formato, teto e assinatura do arquivo.
  if (!fotoDeBatidaValida(params.fotoDataUrl)) {
    return { ok: false, error: "A foto é obrigatória para confirmar. Toque em “Tirar a foto” e tente de novo." };
  }
  const casado = REGEX_FOTO_DATA_URL.exec(params.fotoDataUrl)!;
  const ehPng = casado[1] === "png";
  const foto = new Uint8Array(Buffer.from(casado[2], "base64"));

  const arquivoDoc = recibo.documento.arquivo;
  const doc = arquivoDoc ? await bytesDo(arquivoDoc) : null;
  if (!doc) return { ok: false, error: "Não consegui abrir o contracheque agora. Tente de novo em instantes." };
  const hashDocumento = createHash("sha256").update(doc).digest("hex");

  const nomeFoto = `recibo-contracheque-${recibo.id}.${ehPng ? "png" : "jpg"}`;
  const mimeType = ehPng ? "image/png" : "image/jpeg";
  // Com o Blob configurado, a foto vai para lá (como a do ponto); sem ele, para
  // o banco — a confirmação não pode depender de o armazenamento existir.
  let blobUrl: string | null = null;
  if (blobConfigurado()) {
    const envio = await enviarParaBlob({ empresaId: recibo.empresaId, colaboradorId: recibo.colaboradorId, nome: nomeFoto, mimeType, bytes: foto });
    if (!envio.ok) return { ok: false, error: "Não consegui guardar a foto agora. Tente de novo em instantes." };
    blobUrl = envio.url;
  }

  const agora = new Date();
  const confirmou = await prisma.$transaction(async (tx) => {
    const arquivo = await tx.arquivo.create({
      data: {
        empresaId: recibo.empresaId,
        nome: nomeFoto,
        mimeType,
        tamanhoBytes: foto.byteLength,
        ...(blobUrl ? { blobUrl } : { conteudo: foto }),
        criadoPorNome: recibo.colaborador.nome,
      },
      select: { id: true },
    });
    const r = await tx.reciboContracheque.updateMany({
      where: { id: recibo.id, confirmadoEm: null },
      data: {
        confirmadoEm: agora,
        confirmadoIp: params.ip,
        confirmadoDispositivo: params.dispositivo?.slice(0, 300) ?? null,
        hashDocumento,
        fotoArquivoId: arquivo.id,
      },
    });
    if (r.count !== 1) throw new Error("ja-confirmado");
    return true;
  }).catch((e) => {
    console.error("[contracheques] confirmar", e);
    return false;
  });

  if (!confirmou) {
    if (blobUrl) await removerDoBlob(blobUrl);
    // Só é sucesso se a confirmação ESTÁ gravada (duas abas confirmando
    // juntas). Qualquer outra falha — banco fora, recibo apagado no meio —
    // não pode dizer "obrigado" para a pessoa sem nada registrado.
    const agoraGravado = await prisma.reciboContracheque.findFirst({
      where: { id: recibo.id, confirmadoEm: { not: null } },
      select: { id: true },
    });
    return agoraGravado ? { ok: true } : { ok: false, error: "Não consegui registrar a confirmação. Tente de novo em instantes." };
  }

  await registrarAuditoria({
    empresaId: recibo.empresaId,
    acao: "APROVAR",
    entidade: "ReciboContracheque",
    entidadeId: recibo.id,
    resumo: `Confirmou com foto o recebimento do contracheque de ${rotuloDoContracheque(recibo.competencia, recibo.tipoFolha)}.`,
    detalhes: { ip: params.ip, hashDocumento },
    ator: ator(recibo.colaboradorId, recibo.colaborador.nome),
  });
  return { ok: true };
}
