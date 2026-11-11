"use server";

// Server Actions públicas para a página de assinatura de contracheques (/assinar/[token]).
//
// 1. obterDadosReciboPublicoAction: carrega metadados sem vazar CPF.
// 2. validarCpfAssinaturaAction: confere CPF do colaborador, emite cookie de sessão e libera visualização/assinatura.
// 3. assinarContrachequeAction: valida selfie, gera PDF selado via pdf-lib, salva evidências e envia e-mail com anexo.

import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { rotuloDoContracheque } from "@/lib/contracheques/situacao";
import {
  compararCpf,
  gerarAssinaturaSessao,
  MAXIMO_TENTATIVAS_ERRO,
  verificarAssinaturaSessao,
} from "@/lib/contracheques/token-auth";
import { sendEmail } from "@/lib/email";
import { validarSelfieContracheque } from "@/lib/contracheques/validar-selfie";
import { baixarDoBlob, blobConfigurado, enviarParaBlob } from "@/lib/blob";
import { gerarPdfComprovanteAssinado } from "@/lib/contracheques/comprovante-pdf";
import { mascararEmail, obterUrlBase } from "@/lib/contracheques/envio";

export type DadosReciboPublico =
  | {
      encontrado: true;
      id: string;
      competenciaRotulo: string;
      empresaNome: string;
      colaboradorPrimeiroNome: string;
      bloqueado: boolean;
      jaAssinado: boolean;
      confirmadoEm: string | null;
      comprovanteArquivoId: string | null;
      temTelegram: boolean;
      emailMascarado: string;
      autenticadoSessao: boolean;
    }
  | { encontrado: false };

function nomeCurto(nome: string): string {
  return (nome.split(" ")[0] ?? "").toLowerCase().replace(/^\p{L}/u, (c) => c.toUpperCase());
}

const fallbackCookiesTeste = new Map<string, string>();

async function obterCookieSeguro(nome: string): Promise<string | undefined> {
  try {
    const c = await cookies();
    return c.get(nome)?.value;
  } catch {
    // Fora de requisição HTTP (ex: testes locais/CI)
    if (process.env.NODE_ENV !== "production") {
      return fallbackCookiesTeste.get(nome);
    }
    return undefined;
  }
}

const COOKIE_PADRAO_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 3600,
  path: "/",
};

async function setarCookieSeguro(
  nome: string,
  valor: string,
  options: { maxAge?: number; httpOnly?: boolean; secure?: boolean; sameSite?: "lax" | "strict" | "none"; path?: string } = COOKIE_PADRAO_OPTS
): Promise<void> {
  try {
    const c = await cookies();
    c.set(nome, valor, options);
  } catch {
    // Fora de requisição HTTP (ex: testes locais/CI)
    if (process.env.NODE_ENV !== "production") {
      fallbackCookiesTeste.set(nome, valor);
    }
  }
}

async function obterHeadersSeguro(): Promise<{ ip: string; userAgent: string }> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    const ip = (forwarded ? forwarded.split(",")[0].trim() : h.get("x-real-ip")) || "127.0.0.1";
    const userAgent = h.get("user-agent") || "Navegador Web";
    return { ip, userAgent };
  } catch {
    return { ip: "127.0.0.1", userAgent: "Navegador Web" };
  }
}

/** Carrega os dados públicos do recibo pelo token. */
export async function obterDadosReciboPublicoAction(token: string): Promise<DadosReciboPublico> {
  const recibo = await prisma.reciboContracheque.findUnique({
    where: { tokenAssinatura: token },
    select: {
      id: true,
      competencia: true,
      tipoFolha: true,
      bloqueadoEm: true,
      confirmadoEm: true,
      comprovanteArquivoId: true,
      colaborador: {
        select: {
          nome: true,
          email: true,
          telegramChatId: true,
          empresa: { select: { nome: true, marca: { select: { nome: true } } } },
        },
      },
    },
  });

  if (!recibo) return { encontrado: false };

  const cookieVal = await obterCookieSeguro(`cc_auth_${token}`);
  const autenticadoSessao = verificarAssinaturaSessao(token, cookieVal);

  return {
    encontrado: true,
    id: recibo.id,
    competenciaRotulo: rotuloDoContracheque(recibo.competencia, recibo.tipoFolha),
    empresaNome: recibo.colaborador.empresa.marca?.nome || recibo.colaborador.empresa.nome,
    colaboradorPrimeiroNome: nomeCurto(recibo.colaborador.nome),
    bloqueado: recibo.bloqueadoEm !== null,
    jaAssinado: recibo.confirmadoEm !== null,
    confirmadoEm: recibo.confirmadoEm ? recibo.confirmadoEm.toISOString() : null,
    comprovanteArquivoId: recibo.comprovanteArquivoId,
    temTelegram: !!recibo.colaborador.telegramChatId,
    emailMascarado: mascararEmail(recibo.colaborador.email),
    autenticadoSessao,
  };
}

/**
 * Validação simplificada por CPF (OS 07/11/2026):
 * O colaborador insere apenas seu CPF. Se conferir, emite cookie de sessão imediatamente
 * e libera a visualização do contracheque e a assinatura (sem necessidade de código 2FA).
 */
export async function validarCpfAssinaturaAction(
  token: string,
  cpfDigitado: string
): Promise<
  | { ok: true }
  | { ok: false; bloqueado: boolean; error: string; tentativasRestantes?: number }
> {
  const recibo = await prisma.reciboContracheque.findUnique({
    where: { tokenAssinatura: token },
    select: {
      id: true,
      bloqueadoEm: true,
      tentativasCodigo: true,
      confirmadoEm: true,
      colaborador: {
        select: {
          cpf: true,
        },
      },
    },
  });

  if (!recibo) return { ok: false, bloqueado: false, error: "Contracheque não localizado." };
  if (recibo.confirmadoEm) return { ok: false, bloqueado: false, error: "Este contracheque já foi assinado." };
  if (recibo.bloqueadoEm !== null) {
    return {
      ok: false,
      bloqueado: true,
      error: "Este link foi bloqueado por excesso de tentativas. Entre em contato com o RH da sua empresa.",
    };
  }

  // Compara o CPF com a ficha cadastrada
  if (!compararCpf(cpfDigitado, recibo.colaborador.cpf)) {
    const novasTentativas = recibo.tentativasCodigo + 1;
    const estourou = novasTentativas >= MAXIMO_TENTATIVAS_ERRO;
    await prisma.reciboContracheque.update({
      where: { id: recibo.id },
      data: {
        tentativasCodigo: novasTentativas,
        bloqueadoEm: estourou ? new Date() : null,
      },
    });

    if (estourou) {
      return {
        ok: false,
        bloqueado: true,
        error: "Link bloqueado por exceder o limite de 5 tentativas incorretas. Procure o RH para reenviar.",
      };
    }

    return {
      ok: false,
      bloqueado: false,
      tentativasRestantes: MAXIMO_TENTATIVAS_ERRO - novasTentativas,
      error: `CPF não confere com o cadastro. Tentativa ${novasTentativas} de ${MAXIMO_TENTATIVAS_ERRO}.`,
    };
  }

  // CPF confere: registra validação e emite cookie assinado de sessão
  const agora = new Date();
  await prisma.reciboContracheque.update({
    where: { id: recibo.id },
    data: {
      codigoValidadoEm: agora,
    },
  });

  const cookieValor = gerarAssinaturaSessao(token);
  await setarCookieSeguro(`cc_auth_${token}`, cookieValor);

  return { ok: true };
}

/** @deprecated Mantido para compatibilidade com chamadas/testes legados. */
export async function solicitarCodigo2faAction(
  token: string,
  cpfDigitado: string
): Promise<
  | { ok: true; canal: "TELEGRAM" | "EMAIL"; destinoMascarado: string }
  | { ok: false; bloqueado: boolean; error: string; tentativasRestantes?: number }
> {
  const r = await validarCpfAssinaturaAction(token, cpfDigitado);
  if (!r.ok) return r;
  return { ok: true, canal: "EMAIL", destinoMascarado: "seu e-mail" };
}

/** @deprecated Mantido para compatibilidade com chamadas/testes legados. */
export async function validarCodigo2faAction(
  token: string,
  _codigoDigitado: string
): Promise<
  | { ok: true }
  | { ok: false; bloqueado: boolean; error: string; tentativasRestantes?: number }
> {
  void _codigoDigitado;
  const cookieValor = gerarAssinaturaSessao(token);
  await setarCookieSeguro(`cc_auth_${token}`, cookieValor);
  return { ok: true };
}

async function bytesDoArquivo(arquivo: { blobUrl: string | null; conteudo: Uint8Array | null }): Promise<Uint8Array | null> {
  if (arquivo.blobUrl) {
    const lido = await baixarDoBlob(arquivo.blobUrl);
    return lido.ok ? new Uint8Array(lido.bytes) : null;
  }
  return arquivo.conteudo ? new Uint8Array(arquivo.conteudo) : null;
}

/** Assinatura Final: valida selfie, aceite, gera PDF assinado acoplado e dispara e-mail com o anexo. */
export async function assinarContrachequeAction(
  token: string,
  payload: {
    fotoDataUrl: string;
    aceite: boolean;
    localizacao?: string | null;
  }
): Promise<{ ok: true; comprovanteUrl: string } | { ok: false; error: string }> {
  const cookieVal = await obterCookieSeguro(`cc_auth_${token}`);
  if (!verificarAssinaturaSessao(token, cookieVal)) {
    return { ok: false, error: "Sessão expirada ou não autenticada. Informe o CPF e o código novamente." };
  }

  if (!payload.aceite) {
    return { ok: false, error: "É obrigatório marcar a declaração de ciência para assinar." };
  }

  const checkFoto = await validarSelfieContracheque(payload.fotoDataUrl);
  if (!checkFoto.ok) {
    return { ok: false, error: checkFoto.error };
  }

  const recibo = await prisma.reciboContracheque.findUnique({
    where: { tokenAssinatura: token },
    select: {
      id: true,
      empresaId: true,
      colaboradorId: true,
      competencia: true,
      tipoFolha: true,
      enviadoEm: true,
      cienciaTelegramEm: true,
      vistoEm: true,
      codigoValidadoEm: true,
      canalCodigo: true,
      confirmadoEm: true,
      colaborador: {
        select: {
          nome: true,
          cpf: true,
          email: true,
          empresa: {
            select: {
              nome: true,
              cnpj: true,
              marca: { select: { nome: true } },
            },
          },
        },
      },
      documento: {
        select: {
          arquivo: { select: { blobUrl: true, conteudo: true, nome: true } },
        },
      },
    },
  });

  if (!recibo) return { ok: false, error: "Contracheque não encontrado." };
  if (recibo.confirmadoEm) return { ok: false, error: "Este contracheque já foi assinado anteriormente." };

  const arquivoDoc = recibo.documento.arquivo;
  const docBytes = arquivoDoc ? await bytesDoArquivo(arquivoDoc) : null;
  if (!docBytes) {
    return { ok: false, error: "Não foi possível carregar o arquivo original do contracheque." };
  }

  const { ip, userAgent } = await obterHeadersSeguro();
  const agora = new Date();

  const refRotulo = rotuloDoContracheque(recibo.competencia, recibo.tipoFolha);
  const textoAceite = `Declaro que recebi o contracheque de ${refRotulo} e estou ciente do seu conteúdo.`;

  // 1. Gera PDF combinado com folha de evidências via pdf-lib
  const { bytes: pdfAssinadoBytes, hashOriginal } = await gerarPdfComprovanteAssinado({
    pdfOriginalBytes: docBytes,
    reciboId: recibo.id,
    colaboradorNome: recibo.colaborador.nome,
    colaboradorCpf: recibo.colaborador.cpf ?? "",
    empresaRazaoSocial: recibo.colaborador.empresa.nome,
    empresaCnpj: recibo.colaborador.empresa.cnpj ?? "Não informado",
    competenciaRotulo: refRotulo,
    tipoFolhaRotulo: recibo.tipoFolha,
    enviadoEm: recibo.enviadoEm,
    cienciaTelegramEm: recibo.cienciaTelegramEm,
    vistoEm: recibo.vistoEm ?? agora,
    codigoValidadoEm: recibo.codigoValidadoEm ?? agora,
    canalCodigo: recibo.canalCodigo,
    confirmadoEm: agora,
    confirmadoIp: ip,
    confirmadoDispositivo: userAgent,
    confirmadoLocalizacao: payload.localizacao ?? null,
    textoAceite,
    fotoDataUrl: payload.fotoDataUrl,
  });

  // 2. Extrai bytes da foto para salvar no Arquivo
  const ehPng = checkFoto.ehPng;
  const fotoBytes = checkFoto.bytes;
  const nomeFoto = `selfie-contracheque-${recibo.id}.${ehPng ? "png" : "jpg"}`;
  const mimeFoto = ehPng ? "image/png" : "image/jpeg";

  let blobFotoUrl: string | null = null;
  if (blobConfigurado()) {
    const rFoto = await enviarParaBlob({
      empresaId: recibo.empresaId,
      colaboradorId: recibo.colaboradorId,
      nome: nomeFoto,
      mimeType: mimeFoto,
      bytes: new Uint8Array(fotoBytes),
    });
    if (rFoto.ok) blobFotoUrl = rFoto.url;
  }

  // 3. Salva o PDF assinado completo no Blob / banco
  const nomePdfAssinado = `contracheque-${refRotulo.replace(/[^a-zA-Z0-9]/g, "-")}-assinado.pdf`;
  const pdfBytesBuffer = Buffer.from(pdfAssinadoBytes);
  const pdfBytesArray = new Uint8Array(pdfBytesBuffer.buffer as ArrayBuffer, pdfBytesBuffer.byteOffset, pdfBytesBuffer.byteLength);
  let blobPdfUrl: string | null = null;
  if (blobConfigurado()) {
    const rPdf = await enviarParaBlob({
      empresaId: recibo.empresaId,
      colaboradorId: recibo.colaboradorId,
      nome: nomePdfAssinado,
      mimeType: "application/pdf",
      bytes: pdfBytesArray,
    });
    if (rPdf.ok) blobPdfUrl = rPdf.url;
  }

  // 4. Grava no banco dentro de transação
  await prisma.$transaction(async (tx) => {
    const arqFoto = await tx.arquivo.create({
      data: {
        empresaId: recibo.empresaId,
        nome: nomeFoto,
        mimeType: mimeFoto,
        tamanhoBytes: fotoBytes.byteLength,
        ...(blobFotoUrl ? { blobUrl: blobFotoUrl } : { conteudo: new Uint8Array(fotoBytes.buffer as ArrayBuffer, fotoBytes.byteOffset, fotoBytes.byteLength) }),
      },
    });

    const arqPdf = await tx.arquivo.create({
      data: {
        empresaId: recibo.empresaId,
        nome: nomePdfAssinado,
        mimeType: "application/pdf",
        tamanhoBytes: pdfAssinadoBytes.byteLength,
        ...(blobPdfUrl ? { blobUrl: blobPdfUrl } : { conteudo: pdfBytesArray }),
      },
    });

    await tx.reciboContracheque.update({
      where: { id: recibo.id },
      data: {
        confirmadoEm: agora,
        confirmadoIp: ip,
        confirmadoDispositivo: userAgent,
        confirmadoLocalizacao: payload.localizacao ?? null,
        hashDocumento: hashOriginal,
        textoAceite,
        fotoArquivoId: arqFoto.id,
        comprovanteArquivoId: arqPdf.id,
      },
    });
  });

  // 5. Envia e-mail de confirmação COM O PDF ASSINADO ANEXADO
  if (recibo.colaborador.email) {
    const marca = recibo.colaborador.empresa.marca?.nome || "RH";
    const subject = `Comprovante de contracheque assinado — ${refRotulo}`;
    const baseUrl = obterUrlBase();
    const linkComprovante = `${baseUrl}/api/assinar/${token}/comprovante`;
    const text =
      `Oi, ${nomeCurto(recibo.colaborador.nome)}!\n\n` +
      `Sua assinatura do contracheque de ${refRotulo} foi concluída com sucesso em ${agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.\n\n` +
      `O comprovante com o dossiê probatório completo e sua selfie está anexado a este e-mail para seu arquivo pessoal.\n\n` +
      `Caso seu aplicativo de e-mail não abra anexos, você também pode baixar o documento assinado pelo link seguro:\n${linkComprovante}\n\n` +
      `Hash SHA-256 do documento: ${hashOriginal}\n\n` +
      `RH — ${marca}`;

    const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,sans-serif;">
<table style="max-width:540px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;border:1px solid #e2e5e9;"><tr><td>
<h2 style="margin:0 0 16px;color:#0f172a;">Assinatura confirmada! 🎉</h2>
<p style="margin:0 0 14px;color:#3d454f;font-size:15px;">Oi, <b>${recibo.colaborador.nome}</b>. Seu contracheque de <b>${refRotulo}</b> foi assinado com sucesso.</p>
<p style="margin:0 0 16px;color:#5a636e;font-size:14px;">O documento assinado contendo a folha de comprovação legal, carimbo de data/hora e sua selfie foi anexado a este e-mail para seus arquivos.</p>
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 16px;font-size:12px;color:#64748b;margin-bottom:20px;">
  <b>Data/Hora (Brasília):</b> ${agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}<br>
  <b>Hash SHA-256:</b> <span style="word-break:break-all;">${hashOriginal}</span>
</div>
<div style="margin:24px 0;text-align:center;">
  <a href="${linkComprovante}" style="display:inline-block;padding:12px 24px;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;border-radius:6px;">
    Baixar Contracheque Assinado (PDF)
  </a>
</div>
<p style="margin:0;font-size:12px;color:#8a929c;">RH — ${marca}</p>
</td></tr></table></body></html>`;

    await sendEmail({
      to: recibo.colaborador.email,
      subject,
      html,
      text,
      fromName: `RH ${marca}`,
      origem: "CONTRACHEQUE_COMPROVANTE",
      empresaId: recibo.empresaId,
      marcaNome: marca,
      attachments: [
        {
          filename: nomePdfAssinado,
          content: Buffer.from(pdfAssinadoBytes.buffer, pdfAssinadoBytes.byteOffset, pdfAssinadoBytes.byteLength),
          contentType: "application/pdf",
        },
      ],
    });
  }

  const comprovanteUrl = `/api/assinar/${token}/comprovante`;
  return { ok: true, comprovanteUrl };
}
