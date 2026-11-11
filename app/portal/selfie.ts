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

/**
 * Análise determinística de variação de pixels e luminância.
 * Função pura O(1) com amostragem uniforme de até 1600 pixels.
 * Rejeita imagens sólidas, monocromáticas ou sem contraste mínimo.
 */
export function analisarVariacaoPixels(rgba: Uint8ClampedArray): {
  valida: boolean;
  desvioLuminancia: number;
  percentualDominante: number;
} {
  const totalPixels = Math.floor(rgba.length / 4);
  if (totalPixels === 0) {
    return { valida: false, desvioLuminancia: 0, percentualDominante: 1 };
  }

  // Amostra de até 1600 pixels para O(1)
  const limiteAmostras = 1600;
  const passo = Math.max(1, Math.floor(totalPixels / limiteAmostras));

  let somaLum = 0;
  let somaR = 0;
  let somaG = 0;
  let somaB = 0;
  let contagem = 0;

  for (let i = 0; i < totalPixels; i += passo) {
    const idx = i * 4;
    const r = rgba[idx];
    const g = rgba[idx + 1];
    const b = rgba[idx + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    somaLum += lum;
    somaR += r;
    somaG += g;
    somaB += b;
    contagem++;
  }

  if (contagem === 0) {
    return { valida: false, desvioLuminancia: 0, percentualDominante: 1 };
  }

  const mediaLum = somaLum / contagem;
  const mediaR = somaR / contagem;
  const mediaG = somaG / contagem;
  const mediaB = somaB / contagem;

  let somaVarLum = 0;
  let pixelsDominantes = 0;

  for (let i = 0; i < totalPixels; i += passo) {
    const idx = i * 4;
    const r = rgba[idx];
    const g = rgba[idx + 1];
    const b = rgba[idx + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    const diffLum = lum - mediaLum;
    somaVarLum += diffLum * diffLum;

    // Distância euclidiana no espaço RGB até a cor média
    const distR = r - mediaR;
    const distG = g - mediaG;
    const distB = b - mediaB;
    const distQuadrada = distR * distR + distG * distG + distB * distB;
    if (distQuadrada <= 144) {
      // 12 * 12 = 144
      pixelsDominantes++;
    }
  }

  const desvioLuminancia = Math.sqrt(somaVarLum / contagem);
  const percentualDominante = pixelsDominantes / contagem;

  const valida = desvioLuminancia >= 10 && percentualDominante <= 0.92;

  return {
    valida,
    desvioLuminancia,
    percentualDominante,
  };
}

export type ResultadoSelfieAssinatura =
  | { ok: true; dataUrl: string }
  | { ok: false; error: string };

/**
 * Prepara e valida a selfie antes de enviar para assinatura ou confirmação de contracheque.
 * Reduz a imagem para max 640px e aplica validações de variação e detector facial (se disponível).
 */
export async function prepararSelfieParaAssinatura(arquivo: File): Promise<ResultadoSelfieAssinatura> {
  const imagem = await decodificarFoto(arquivo);
  if (!imagem) {
    return {
      ok: false,
      error: "Não foi possível ler a imagem selecionada. Tente tirar a foto novamente.",
    };
  }

  try {
    const larguraOriginal = imagem instanceof HTMLImageElement ? imagem.naturalWidth : imagem.width;
    const alturaOriginal = imagem instanceof HTMLImageElement ? imagem.naturalHeight : imagem.height;
    if (!larguraOriginal || !alturaOriginal) {
      return {
        ok: false,
        error: "Não foi possível ler a imagem selecionada. Tente tirar a foto novamente.",
      };
    }

    const escala = Math.min(1, LADO_MAXIMO_FOTO / Math.max(larguraOriginal, alturaOriginal));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(larguraOriginal * escala);
    canvas.height = Math.round(alturaOriginal * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return {
        ok: false,
        error: "Não foi possível ler a imagem selecionada. Tente tirar a foto novamente.",
      };
    }

    ctx.drawImage(imagem, 0, 0, canvas.width, canvas.height);
    if ("close" in imagem) imagem.close();

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const analise = analisarVariacaoPixels(imgData.data);
    if (!analise.valida) {
      return {
        ok: false,
        error:
          "A imagem capturada está em branco, escura ou sem nitidez (câmera coberta). Posicione seu rosto em um local iluminado e tente novamente.",
      };
    }

    // Detecção facial opcional no cliente via FaceDetector experimental
    if (typeof window !== "undefined") {
      try {
        const FaceDetectorClass = (
          window as unknown as {
            FaceDetector?: new (opt?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
              detect: (src: ImageBitmapSource) => Promise<unknown[]>;
            };
          }
        ).FaceDetector;
        if (FaceDetectorClass) {
          const detector = new FaceDetectorClass({ fastMode: true });
          const rostos = await detector.detect(canvas);
          if (Array.isArray(rostos) && rostos.length === 0) {
            return {
              ok: false,
              error:
                "Nenhum rosto identificado na imagem. Posicione seu rosto centralizado na câmera e tente novamente.",
            };
          }
        }
      } catch {
        // FaceDetector não suportado ou falhou: não bloqueia no cliente, deixa ir para o servidor.
      }
    }

    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    return { ok: true, dataUrl };
  } catch {
    return {
      ok: false,
      error: "Não foi possível ler a imagem selecionada. Tente tirar a foto novamente.",
    };
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
