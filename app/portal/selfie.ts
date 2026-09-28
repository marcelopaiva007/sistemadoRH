// A selfie do portal: decodifica a foto da câmera e reduz para um JPEG pequeno.
// Saiu de bater-ponto-card.tsx (28/09/2026) para a confirmação de recebimento
// do contracheque usar exatamente o mesmo caminho — os três degraus de
// decodificação abaixo existem por aparelhos reais onde o primeiro falha.

/** Lado maior da selfie enviada. 640px identifica um rosto e pesa ~60 KB. */
const LADO_MAXIMO_FOTO = 640;

// Decodifica o arquivo da câmera, do caminho mais completo ao mais
// compatível. Três degraus, e a ORDEM é o ponto: com a foto obrigatória
// (20/08/2026), decodificação que falha = pessoa sem conseguir bater o ponto
// — e a revisão do mesmo dia mostrou dois aparelhos onde o degrau 1 falha
// SEMPRE, não às vezes:
//
// 1. createImageBitmap com imageOrientation respeita o EXIF (selfie de iPhone
//    chega em pé). Mas o valor "from-image" só existe no Chrome 108+ — de 81
//    a 107 (Android antigo, público típico de bater ponto no celular) a opção
//    é conhecida e o VALOR é rejeitado com TypeError antes de decodificar.
// 2. createImageBitmap sem opções cobre esses Chromes. A foto pode chegar
//    deitada neles; deitada registra e identifica — sem foto, não registra.
// 3. <img> + object URL cobre navegador sem createImageBitmap nenhum
//    (Safari de iOS <= 14). O <img> aplica o EXIF sozinho nos iOS modernos.
async function decodificarFoto(arquivo: File): Promise<ImageBitmap | HTMLImageElement | null> {
  try {
    return await createImageBitmap(arquivo, { imageOrientation: "from-image" });
  } catch {
    /* degrau 2 */
  }
  try {
    return await createImageBitmap(arquivo);
  } catch {
    /* degrau 3 */
  }
  try {
    const url = URL.createObjectURL(arquivo);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("imagem não decodificou"));
        img.src = url;
      });
      return img;
    } finally {
      // Depois do onload o navegador já decodificou; revogar aqui não
      // atrapalha o drawImage e não vaza a URL se o load falhar.
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

// Reduz a foto da câmera para um JPEG pequeno, como data URL.
//
// A câmera do celular entrega 3–12 MB; subir isso a cada batida estouraria o
// payload da action e o plano do Blob à toa — para conferir QUEM bateu, 640px
// basta.
export async function reduzirFoto(arquivo: File): Promise<string | null> {
  const imagem = await decodificarFoto(arquivo);
  if (!imagem) return null;
  try {
    const larguraOriginal = imagem instanceof HTMLImageElement ? imagem.naturalWidth : imagem.width;
    const alturaOriginal = imagem instanceof HTMLImageElement ? imagem.naturalHeight : imagem.height;
    if (!larguraOriginal || !alturaOriginal) return null;
    const escala = Math.min(1, LADO_MAXIMO_FOTO / Math.max(larguraOriginal, alturaOriginal));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(larguraOriginal * escala);
    canvas.height = Math.round(alturaOriginal * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(imagem, 0, 0, canvas.width, canvas.height);
    if ("close" in imagem) imagem.close();
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    // Decodificou mas não reduziu: devolve null e quem chamou orienta a
    // pessoa — desde 20/08/2026 a batida não segue sem foto.
    return null;
  }
}
