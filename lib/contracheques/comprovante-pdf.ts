// Geração da Folha de Evidências de Assinatura Eletrônica acoplada via pdf-lib.
//
// Adiciona uma página A4 ao final do contracheque original contendo todos os dados
// probatórios (trilha temporal em Brasília, hash SHA-256 do original, IP, dispositivo,
// canal de 2FA, selfie do colaborador e fundamentação jurídica na MP 2.200-2/2001).

import { createHash } from "node:crypto";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { REGEX_FOTO_DATA_URL } from "@/lib/ponto-foto";

export type DadosComprovante = {
  pdfOriginalBytes: Uint8Array;
  reciboId: string;
  colaboradorNome: string;
  colaboradorCpf: string;
  empresaRazaoSocial: string;
  empresaCnpj: string;
  competenciaRotulo: string;
  tipoFolhaRotulo: string;
  enviadoEm: Date | null;
  cienciaTelegramEm: Date | null;
  vistoEm: Date | null;
  codigoValidadoEm: Date | null;
  canalCodigo: string | null;
  confirmadoEm: Date;
  confirmadoIp: string | null;
  confirmadoDispositivo: string | null;
  confirmadoLocalizacao: string | null;
  textoAceite: string | null;
  fotoDataUrl: string;
};

function formatarDataBrasilia(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d) + " (BRT)";
}

function mascararCpf(cpf: string): string {
  const limpo = cpf.replace(/\D/g, "");
  if (limpo.length !== 11) return cpf;
  return `***.${limpo.slice(3, 6)}.${limpo.slice(6, 9)}-**`;
}

/**
 * Sanitiza strings para o charset padrão WinAnsi/Helvetica do PDF.
 * Evita exceções do pdf-lib com caracteres fora do mapa (emojis, símbolos exóticos,
 * quebras de linha indesejadas) que poderiam impedir a selagem do documento.
 */
function sanitizarTextoWinAnsi(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .normalize("NFC")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\x20-\x7E\xA0-\xFF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u20AC]/g, " ")
    .trim();
}

/**
 * Carrega o PDF original, calcula seu hash SHA-256 e anexa uma página
 * de evidências A4 com selfie e trilha de auditoria.
 *
 * Utiliza o padrão de cópia de páginas para um PDFDocument limpo e gravação
 * com useObjectStreams: false para garantir 100% de compatibilidade com
 * leitores rigorosos de PDF (Adobe Acrobat, Preview, clientes de e-mail mobile).
 */
export async function gerarPdfComprovanteAssinado(
  dados: DadosComprovante
): Promise<{ bytes: Uint8Array; hashOriginal: string }> {
  const hashOriginal = createHash("sha256").update(dados.pdfOriginalBytes).digest("hex");

  // Carrega o documento original com ignoreEncryption para aceitar arquivos com flags de restrição de impressão
  const docOrigem = await PDFDocument.load(dados.pdfOriginalBytes, { ignoreEncryption: true });

  // Cria um documento novo e copia as páginas originais.
  // Isso atua como sanitizador de árvores corrompidas ou referências cruzadas malformadas do PDF original.
  const doc = await PDFDocument.create();
  const paginasOriginais = await doc.copyPages(docOrigem, docOrigem.getPageIndices());
  for (const p of paginasOriginais) {
    doc.addPage(p);
  }

  // Página A4 padrão de evidências: 595.28 x 841.89 pontos
  const page = doc.addPage([595.28, 841.89]);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const corPreto = rgb(0.1, 0.12, 0.15);
  const corCinza = rgb(0.4, 0.45, 0.5);
  const corBorda = rgb(0.85, 0.88, 0.92);
  const corFundo = rgb(0.97, 0.98, 0.99);
  const corAzul = rgb(0.08, 0.35, 0.75);

  const largura = 595.28;
  const altura = 841.89;
  const margem = 36;
  const larguraUtil = largura - margem * 2;

  // 1. Moldura externa decorativa
  page.drawRectangle({
    x: margem,
    y: margem,
    width: larguraUtil,
    height: altura - margem * 2,
    borderWidth: 1,
    borderColor: corBorda,
  });

  // 2. Cabeçalho
  page.drawRectangle({
    x: margem,
    y: altura - margem - 55,
    width: larguraUtil,
    height: 55,
    color: corFundo,
    borderWidth: 1,
    borderColor: corBorda,
  });

  page.drawText("COMPROVANTE DE ASSINATURA ELETRÔNICA", {
    x: margem + 16,
    y: altura - margem - 28,
    size: 13,
    font: fontBold,
    color: corAzul,
  });

  page.drawText(sanitizarTextoWinAnsi(`FASTMAI RH · Recibo ID: ${dados.reciboId}`), {
    x: margem + 16,
    y: altura - margem - 44,
    size: 9,
    font: fontRegular,
    color: corCinza,
  });

  let curY = altura - margem - 75;

  // 3. Bloco Identificação das Partes
  page.drawText("1. IDENTIFICAÇÃO DAS PARTES E DOCUMENTO", {
    x: margem + 16,
    y: curY,
    size: 10,
    font: fontBold,
    color: corPreto,
  });
  curY -= 16;

  page.drawText(sanitizarTextoWinAnsi(`Empregador: ${dados.empresaRazaoSocial}  (CNPJ: ${dados.empresaCnpj})`), {
    x: margem + 20,
    y: curY,
    size: 9,
    font: fontRegular,
    color: corPreto,
  });
  curY -= 14;

  page.drawText(sanitizarTextoWinAnsi(`Colaborador: ${dados.colaboradorNome}  (CPF: ${mascararCpf(dados.colaboradorCpf)})`), {
    x: margem + 20,
    y: curY,
    size: 9,
    font: fontRegular,
    color: corPreto,
  });
  curY -= 14;

  page.drawText(sanitizarTextoWinAnsi(`Documento: Contracheque de ${dados.competenciaRotulo}  (Folha: ${dados.tipoFolhaRotulo})`), {
    x: margem + 20,
    y: curY,
    size: 9,
    font: fontRegular,
    color: corPreto,
  });
  curY -= 24;

  // 4. Bloco Trilha de Auditoria Temporal
  page.drawText("2. TRILHA DE AUDITORIA TEMPORAL (Fuso Oficial de Brasília - BRT)", {
    x: margem + 16,
    y: curY,
    size: 10,
    font: fontBold,
    color: corPreto,
  });
  curY -= 16;

  const linhasAuditoria = [
    `• Envio do aviso: ${formatarDataBrasilia(dados.enviadoEm)}`,
    `• Confirmação de ciência no Telegram: ${dados.cienciaTelegramEm ? formatarDataBrasilia(dados.cienciaTelegramEm) : "Não confirmada no bot / notificado por e-mail"}`,
    `• Abertura e visualização na tela: ${formatarDataBrasilia(dados.vistoEm)}`,
    `• Validação de identidade (CPF): ${formatarDataBrasilia(dados.codigoValidadoEm)}`,
    `• Assinatura eletrônica e aceite: ${formatarDataBrasilia(dados.confirmadoEm)}`,
  ];

  for (const linha of linhasAuditoria) {
    page.drawText(sanitizarTextoWinAnsi(linha), {
      x: margem + 20,
      y: curY,
      size: 8.5,
      font: fontRegular,
      color: corPreto,
    });
    curY -= 13;
  }
  curY -= 12;

  // 5. Bloco Evidências de Rede e Integridade
  page.drawText("3. EVIDÊNCIAS TÉCNICAS E INTEGRIDADE CRIPTOGRÁFICA", {
    x: margem + 16,
    y: curY,
    size: 10,
    font: fontBold,
    color: corPreto,
  });
  curY -= 16;

  page.drawText(sanitizarTextoWinAnsi(`• Endereço IP: ${dados.confirmadoIp ?? "Não registrado"}`), {
    x: margem + 20,
    y: curY,
    size: 8.5,
    font: fontRegular,
    color: corPreto,
  });
  curY -= 13;

  const dispCortado = (dados.confirmadoDispositivo ?? "Navegador Web").slice(0, 95);
  page.drawText(sanitizarTextoWinAnsi(`• Dispositivo/Navegador: ${dispCortado}`), {
    x: margem + 20,
    y: curY,
    size: 8,
    font: fontRegular,
    color: corPreto,
  });
  curY -= 13;

  if (dados.confirmadoLocalizacao) {
    page.drawText(sanitizarTextoWinAnsi(`• Localização geográfica: ${dados.confirmadoLocalizacao}`), {
      x: margem + 20,
      y: curY,
      size: 8.5,
      font: fontRegular,
      color: corPreto,
    });
    curY -= 13;
  }

  page.drawText("• Hash SHA-256 do Contracheque Original:", {
    x: margem + 20,
    y: curY,
    size: 8.5,
    font: fontBold,
    color: corPreto,
  });
  curY -= 12;

  page.drawText(sanitizarTextoWinAnsi(hashOriginal), {
    x: margem + 24,
    y: curY,
    size: 7.5,
    font: fontRegular,
    color: corCinza,
  });
  curY -= 24;

  // 6. Bloco Selfie Biométrica de Confirmação
  page.drawText("4. REGISTRO FOTOGRÁFICO DE IDENTIFICAÇÃO (SELFIE)", {
    x: margem + 16,
    y: curY,
    size: 10,
    font: fontBold,
    color: corPreto,
  });
  curY -= 16;

  // Embutir a imagem da selfie
  const tamanhoFoto = 110;
  const posXFoto = margem + 20;
  const posYFoto = curY - tamanhoFoto;

  try {
    const casado = REGEX_FOTO_DATA_URL.exec(dados.fotoDataUrl);
    if (casado) {
      const ehPng = casado[1] === "png";
      const buf = Buffer.from(casado[2], "base64");
      // pdf-lib usa new DataView(imageData.buffer) ignorando byteOffset;
      // copiamos para um Uint8Array com ArrayBuffer dedicado a partir de 0.
      const fotoBytes = new Uint8Array(buf.byteLength);
      fotoBytes.set(buf);
      const imgEmbed = ehPng ? await doc.embedPng(fotoBytes) : await doc.embedJpg(fotoBytes);

      page.drawImage(imgEmbed, {
        x: posXFoto,
        y: posYFoto,
        width: tamanhoFoto,
        height: tamanhoFoto,
      });

      page.drawRectangle({
        x: posXFoto,
        y: posYFoto,
        width: tamanhoFoto,
        height: tamanhoFoto,
        borderWidth: 1,
        borderColor: corBorda,
      });
    }
  } catch (e) {
    console.error("Erro ao embutir selfie no PDF:", e);
    page.drawText("[Erro na renderização da foto]", {
      x: posXFoto,
      y: posYFoto + 50,
      size: 9,
      font: fontRegular,
      color: corCinza,
    });
  }

  // Descrição ao lado da foto
  const posXTextoFoto = posXFoto + tamanhoFoto + 16;
  let posYTexto = curY - 20;

  page.drawText("Fotografia capturada pela câmera do dispositivo", {
    x: posXTextoFoto,
    y: posYTexto,
    size: 9,
    font: fontBold,
    color: corPreto,
  });
  posYTexto -= 14;

  page.drawText("no exato instante da confirmação do recebimento,", {
    x: posXTextoFoto,
    y: posYTexto,
    size: 8.5,
    font: fontRegular,
    color: corPreto,
  });
  posYTexto -= 12;

  page.drawText("para comprovação inequívoca de identidade.", {
    x: posXTextoFoto,
    y: posYTexto,
    size: 8.5,
    font: fontRegular,
    color: corPreto,
  });

  curY = posYFoto - 26;

  // 7. Bloco Declaração e Validade Jurídica
  page.drawRectangle({
    x: margem + 16,
    y: curY - 75,
    width: larguraUtil - 32,
    height: 75,
    color: corFundo,
    borderWidth: 1,
    borderColor: corBorda,
  });

  const textoAceite = dados.textoAceite ?? `Declaro que recebi o contracheque de ${dados.competenciaRotulo} e estou ciente do seu conteúdo.`;
  page.drawText(sanitizarTextoWinAnsi(`Aceite do Colaborador: "${textoAceite}"`), {
    x: margem + 24,
    y: curY - 20,
    size: 8.5,
    font: fontBold,
    color: corAzul,
  });

  page.drawText(
    "Assinatura eletrônica simples realizada nos termos do art. 10, § 2º da Medida Provisória nº 2.200-2/2001",
    {
      x: margem + 24,
      y: curY - 38,
      size: 7.5,
      font: fontRegular,
      color: corPreto,
    }
  );

  page.drawText(
    "e Lei Federal nº 14.063/2020. A autoria e a integridade deste documento são asseguradas pelos registros",
    {
      x: margem + 24,
      y: curY - 50,
      size: 7.5,
      font: fontRegular,
      color: corPreto,
    }
  );

  page.drawText(
    "de autenticação em dois fatores, carimbo temporal, identificação fotográfica e hash criptográfico.",
    {
      x: margem + 24,
      y: curY - 62,
      size: 7.5,
      font: fontRegular,
      color: corPreto,
    }
  );

  // useObjectStreams: false garante tabelas tradicionais xref compatíveis universalmente (sem /ObjStm)
  const bytes = await doc.save({ useObjectStreams: false });
  return { bytes: new Uint8Array(bytes), hashOriginal };
}
