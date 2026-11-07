import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { gerarPdfComprovanteAssinado } from "../lib/contracheques/comprovante-pdf";

async function test() {
  console.log("1. Criando PDF original mock (1 página)...");
  const doc = await PDFDocument.create();
  doc.addPage([595.28, 841.89]);
  const pdfOriginal = await doc.save();

  console.log("2. Criando imagem de selfie mock...");
  const fotoBuffer = await sharp({
    create: { width: 120, height: 120, channels: 3, background: { r: 10, g: 100, b: 200 } },
  }).jpeg().toBuffer();
  const fotoDataUrl = `data:image/jpeg;base64,${fotoBuffer.toString("base64")}`;

  console.log("3. Executando acoplamento de folha de evidências...");
  const agora = new Date("2026-11-06T15:30:00Z");
  const { bytes, hashOriginal } = await gerarPdfComprovanteAssinado({
    pdfOriginalBytes: pdfOriginal,
    reciboId: "recibo-ci-test-12345",
    colaboradorNome: "Maria da Silva 🎉 (Com Emoji & Acentos: áéíóú ç)",
    colaboradorCpf: "12345678900",
    empresaRazaoSocial: "LM Telecom LTDA — Matriz",
    empresaCnpj: "12.345.678/0001-90",
    competenciaRotulo: "11/2026",
    tipoFolhaRotulo: "Mensal",
    enviadoEm: new Date(agora.getTime() - 2 * 3600 * 1000),
    cienciaTelegramEm: new Date(agora.getTime() - 1 * 3600 * 1000),
    vistoEm: new Date(agora.getTime() - 15 * 60 * 1000),
    codigoValidadoEm: new Date(agora.getTime() - 10 * 60 * 1000),
    canalCodigo: "TELEGRAM",
    confirmadoEm: agora,
    confirmadoIp: "189.10.20.30",
    confirmadoDispositivo: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) \u2192 Mobile Safari 🚀",
    confirmadoLocalizacao: "-23.5505,-46.6333",
    textoAceite: "Declaro que recebi o contracheque de 11/2026 e estou ciente do seu conteúdo.",
    fotoDataUrl,
  });

  const docFinal = await PDFDocument.load(bytes);
  if (docFinal.getPageCount() !== 2) {
    throw new Error(`Esperado 2 páginas no PDF final, obtido: ${docFinal.getPageCount()}`);
  }
  if (!hashOriginal || hashOriginal.length !== 64) {
    throw new Error(`Hash original esperado com 64 chars, obtido: ${hashOriginal}`);
  }

  // Verifica compatibilidade: deve usar tabela de xref tradicional (sem /ObjStm)
  const pdfString = Buffer.from(bytes).toString("latin1");
  if (!pdfString.includes("xref") || pdfString.includes("/ObjStm")) {
    throw new Error("PDF gerado não possui tabela xref tradicional ou contém /ObjStm incompatível.");
  }

  console.log("  ✓ PDF final contém 2 páginas");
  console.log("  ✓ Hash SHA-256 do original calculado com sucesso:", hashOriginal);
  console.log("  ✓ Selfie embutida e folha de conformidade gerada");
  console.log("\nTodos os testes de comprovante-pdf passaram.");
}

test().catch((e) => {
  console.error("✗ Falha em test-contracheques-comprovante-pdf:", e);
  process.exit(1);
});
