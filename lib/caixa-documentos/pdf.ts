// Caixa de documentos — contar, recortar e fatiar PDFs (pdf-lib, JS puro).
//
// Só servidor. Nada aqui lê o CONTEÚDO do PDF (pdf-lib não extrai texto):
// quem lê é a IA. Aqui só se mexe em páginas — e é isso que garante que cada
// pessoa receba um arquivo só com as páginas dela, nunca a folha inteira.
import { EncryptedPDFError, ParseSpeeds, PDFDocument } from "pdf-lib";
import sharp from "sharp";

export type LeituraPdf = { ok: true; paginas: number } | { ok: false; error: string };

async function abrir(bytes: Uint8Array): Promise<PDFDocument> {
  // Sem ignoreEncryption: um PDF protegido abriria "vazio" e as fatias sairiam
  // em branco. Melhor recusar com uma mensagem que diga o que fazer.
  return PDFDocument.load(bytes, { parseSpeed: ParseSpeeds.Fastest, updateMetadata: false });
}

export async function contarPaginas(bytes: Uint8Array): Promise<LeituraPdf> {
  try {
    const doc = await abrir(bytes);
    const paginas = doc.getPageCount();
    if (paginas < 1) return { ok: false, error: "O PDF não tem páginas." };
    return { ok: true, paginas };
  } catch (e) {
    if (e instanceof EncryptedPDFError) {
      return {
        ok: false,
        error: "PDF protegido por senha. Peça ao contador (ou exporte do sistema da folha) uma versão sem proteção.",
      };
    }
    return { ok: false, error: "Não foi possível abrir o PDF — o arquivo pode estar corrompido." };
  }
}

/** Um PDF novo só com as páginas [inicio, fim] (1 = primeira), na ordem. */
export async function recortarPdf(bytes: Uint8Array, inicio: number, fim: number): Promise<Uint8Array<ArrayBuffer>> {
  const origem = await abrir(bytes);
  const total = origem.getPageCount();
  const de = Math.max(1, inicio);
  const ate = Math.min(total, fim);
  const novo = await PDFDocument.create();
  const indices = Array.from({ length: ate - de + 1 }, (_, i) => de - 1 + i);
  const copias = await novo.copyPages(origem, indices);
  for (const p of copias) novo.addPage(p);
  const saida = await novo.save();
  return new Uint8Array(saida);
}

/**
 * Foto (JPG/PNG/WEBP) no tamanho que a IA aceita: a API recusa imagem acima de
 * 5 MB ou 8000 px. O original enviado fica intocado — isto é só a cópia lida.
 */
export async function imagemParaLeitura(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const saida = await sharp(bytes)
    .rotate()
    .resize({ width: 2576, height: 2576, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return new Uint8Array(saida);
}
