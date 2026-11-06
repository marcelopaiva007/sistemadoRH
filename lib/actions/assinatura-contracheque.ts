"use server";

// Server Actions públicas para a página de assinatura de contracheques (/assinar/[token]).
//
// 1. obterDadosReciboPublicoAction: carrega metadados sem vazar CPF.
// 2. solicitarCodigo2faAction: valida CPF, gera código 2FA e envia por Telegram ou E-mail.
// 3. validarCodigo2faAction: confere código, seta cookie assinado de sessão temporária.
// 4. assinarContrachequeAction: valida selfie, gera PDF selado via pdf-lib, salva evidências e envia e-mail com anexo.

import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { rotuloDoContracheque } from "@/lib/contracheques/situacao";
import {
  compararCpf,
  gerarAssinaturaSessao,
  gerarCodigo2fa,
  MAXIMO_TENTATIVAS_ERRO,
  validarHashCodigo,
  verificarAssinaturaSessao,
} from "@/lib/contracheques/token-auth";
import { enviarCodigo2faTelegram } from "@/lib/contracheques/telegram-ciencia";
import { sendEmail } from "@/lib/email";
import { fotoDeBatidaValida, REGEX_FOTO_DATA_URL } from "@/lib/ponto-foto";
import { baixarDoBlob, blobConfigurado, enviarParaBlob } from "@/lib/blob";
import { gerarPdfComprovanteAssinado } from "@/lib/contracheques/comprovante-pdf";
import { mascararEmail } from "@/lib/contracheques/envio";

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

async function obterCookieSeguro(nome: string): Promise<string | undefined> {
  try {
    const c = await cookies();
    return c.get(nome)?.value;
  } catch {
    return undefined;
  }
}

async function setarCookieSeguro(nome: string, valor: string, options: any): Promise<void> {
  try {
    const c = await cookies();
    c.set(nome, valor, options);
  } catch {
    // Fora de requisição HTTP (ex: testes)
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

/** Desafio 1: Valida o CPF digitado e dispara o código de 6 dígitos (Telegram ou E-mail). */
export async function solicitarCodigo2faAction(
  token: string,
  cpfDigitado: string
): Promise<
  | { ok: true; canal: "TELEGRAM" | "EMAIL"; destinoMascarado: string }
  | { ok: false; bloqueado: boolean; error: string; tentativasRestantes?: number }
> {
  const recibo = await prisma.reciboContracheque.findUnique({
    where: { tokenAssinatura: token },
    select: {
      id: true,
      bloqueadoEm: true,
      tentativasCodigo: true,
      competencia: true,
      tipoFolha: true,
      confirmadoEm: true,
      colaborador: {
        select: {
          cpf: true,
          nome: true,
          email: true,
          telegramChatId: true,
          empresa: { select: { marca: { select: { nome: true } } } },
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

  // CPF confere: Gera código de 6 dígitos (válido por 10 min)
  const agora = new Date();
  const { codigo, hash, expiraEm } = gerarCodigo2fa(agora);
  const canal = recibo.colaborador.telegramChatId ? "TELEGRAM" : "EMAIL";
  const ref = rotuloDoContracheque(recibo.competencia, recibo.tipoFolha);
  const marca = recibo.colaborador.empresa.marca?.nome || "RH";

  await prisma.reciboContracheque.update({
    where: { id: recibo.id },
    data: {
      codigo2faHash: hash,
      codigoExpiraEm: expiraEm,
      canalCodigo: canal,
    },
  });

  if (canal === "TELEGRAM" && recibo.colaborador.telegramChatId) {
    const resTg = await enviarCodigo2faTelegram(recibo.colaborador.telegramChatId, codigo, ref);
    if (!resTg.ok) {
      // Se telegram falhar e tiver email, tenta email
      if (recibo.colaborador.email) {
        await dispararEmail2fa(recibo.colaborador.email, nomeCurto(recibo.colaborador.nome), ref, marca, codigo);
        return { ok: true, canal: "EMAIL", destinoMascarado: mascararEmail(recibo.colaborador.email) };
      }
    }
    return { ok: true, canal: "TELEGRAM", destinoMascarado: "seu Telegram do RH" };
  }

  if (recibo.colaborador.email) {
    await dispararEmail2fa(recibo.colaborador.email, nomeCurto(recibo.colaborador.nome), ref, marca, codigo);
    return { ok: true, canal: "EMAIL", destinoMascarado: mascararEmail(recibo.colaborador.email) };
  }

  return { ok: false, bloqueado: false, error: "Colaborador sem Telegram e sem e-mail cadastrado." };
}

async function dispararEmail2fa(to: string, nome: string, ref: string, marca: string, codigo: string) {
  const subject = `Código de verificação para o contracheque de ${ref}`;
  const text =
    `Oi, ${nome}!\n\n` +
    `Seu código de confirmação para abrir o contracheque de ${ref} é:\n\n` +
    `${codigo}\n\n` +
    `Este código é válido por 10 minutos. Se você não solicitou, procure o RH.\n\n` +
    `RH — ${marca}`;

  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,sans-serif;">
<table style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;border:1px solid #e2e5e9;"><tr><td>
<p style="margin:0 0 12px;font-size:16px;">Oi, ${nome}!</p>
<p style="margin:0 0 16px;color:#3d454f;font-size:14px;">Seu código de confirmação para abrir o contracheque de <b>${ref}</b> é:</p>
<div style="margin:20px 0;text-align:center;"><span style="display:inline-block;padding:12px 24px;background:#f1f5f9;font-size:24px;font-weight:700;letter-spacing:4px;color:#0f172a;border-radius:6px;">${codigo}</span></div>
<p style="margin:0;font-size:12px;color:#64748b;">Válido por 10 minutos. Não compartilhe com ninguém.<br><br>RH — ${marca}</p>
</td></tr></table></body></html>`;

  await sendEmail({ to, subject, html, text, fromName: `RH ${marca}` });
}

/** Desafio 2: Valida o código de 6 dígitos e emite cookie de sessão para leitura do PDF e assinatura. */
export async function validarCodigo2faAction(
  token: string,
  codigoDigitado: string
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
      codigo2faHash: true,
      codigoExpiraEm: true,
      confirmadoEm: true,
    },
  });

  if (!recibo) return { ok: false, bloqueado: false, error: "Contracheque não localizado." };
  if (recibo.confirmadoEm) return { ok: false, bloqueado: false, error: "Este contracheque já foi assinado." };
  if (recibo.bloqueadoEm !== null) {
    return { ok: false, bloqueado: true, error: "Link bloqueado por excesso de tentativas. Procure o RH." };
  }

  const agora = new Date();
  const valido =
    recibo.codigo2faHash &&
    recibo.codigoExpiraEm &&
    validarHashCodigo(codigoDigitado, recibo.codigo2faHash, recibo.codigoExpiraEm, agora);

  if (!valido) {
    const novasTentativas = recibo.tentativasCodigo + 1;
    const estourou = novasTentativas >= MAXIMO_TENTATIVAS_ERRO;
    await prisma.reciboContracheque.update({
      where: { id: recibo.id },
      data: {
        tentativasCodigo: novasTentativas,
        bloqueadoEm: estourou ? agora : null,
      },
    });

    if (estourou) {
      return { ok: false, bloqueado: true, error: "Link bloqueado por exceder 5 tentativas incorretas." };
    }

    return {
      ok: false,
      bloqueado: false,
      tentativasRestantes: MAXIMO_TENTATIVAS_ERRO - novasTentativas,
      error: `Código incorreto ou expirado. Tentativa ${novasTentativas} de ${MAXIMO_TENTATIVAS_ERRO}.`,
    };
  }

  // Código validado com sucesso: emite sessão no cookie
  await prisma.reciboContracheque.update({
    where: { id: recibo.id },
    data: { codigoValidadoEm: agora },
  });

  const sessaoAssinada = gerarAssinaturaSessao(token);
  await setarCookieSeguro(`cc_auth_${token}`, sessaoAssinada, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 3600,
    path: "/",
  });

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

  if (!fotoDeBatidaValida(payload.fotoDataUrl)) {
    return { ok: false, error: "Foto inválida ou não reconhecida. Por favor, tire uma nova selfie nítida." };
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
  const casado = REGEX_FOTO_DATA_URL.exec(payload.fotoDataUrl)!;
  const ehPng = casado[1] === "png";
  const fotoBytes = Buffer.from(casado[2], "base64");
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
    const text =
      `Oi, ${nomeCurto(recibo.colaborador.nome)}!\n\n` +
      `Sua assinatura do contracheque de ${refRotulo} foi concluída com sucesso em ${agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.\n\n` +
      `O comprovante com o dossiê probatório completo e sua selfie está anexado a este e-mail para seu arquivo pessoal.\n\n` +
      `Hash SHA-256 do documento: ${hashOriginal}\n\n` +
      `RH — ${marca}`;

    const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,sans-serif;">
<table style="max-width:540px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;border:1px solid #e2e5e9;"><tr><td>
<h2 style="margin:0 0 16px;color:#0f172a;">Assinatura confirmada! 🎉</h2>
<p style="margin:0 0 14px;color:#3d454f;font-size:15px;">Oi, <b>${recibo.colaborador.nome}</b>. Seu contracheque de <b>${refRotulo}</b> foi assinado com sucesso.</p>
<p style="margin:0 0 20px;color:#5a636e;font-size:14px;">O documento assinado contendo a folha de comprovação legal, carimbo de data/hora e sua selfie foi anexado a este e-mail para seus arquivos.</p>
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 16px;font-size:12px;color:#64748b;margin-bottom:20px;">
  <b>Data/Hora (Brasília):</b> ${agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}<br>
  <b>Hash SHA-256:</b> <span style="word-break:break-all;">${hashOriginal}</span>
</div>
<p style="margin:0;font-size:12px;color:#8a929c;">RH — ${marca}</p>
</td></tr></table></body></html>`;

    await sendEmail({
      to: recibo.colaborador.email,
      subject,
      html,
      text,
      fromName: `RH ${marca}`,
      attachments: [
        {
          filename: nomePdfAssinado,
          content: Buffer.from(pdfAssinadoBytes),
          contentType: "application/pdf",
        },
      ],
    });
  }

  const comprovanteUrl = `/api/assinar/${token}/comprovante`;
  return { ok: true, comprovanteUrl };
}
