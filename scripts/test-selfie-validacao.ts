import sharp from "sharp";
import {
  analisarVariacaoPixels,
} from "../app/portal/selfie";
import {
  validarSelfieContracheque,
  MSG_SELFIE_INVALIDA,
  MSG_SELFIE_SEM_VARIACAO,
  MSG_SELFIE_SEM_ROSTO,
} from "../lib/contracheques/validar-selfie";

let falhas = 0;

function caso(nome: string, obtido: boolean, detalhe?: string) {
  if (obtido) {
    console.log(`  ✓ ${nome}`);
  } else {
    falhas++;
    console.error(`  ✗ ${nome}${detalhe ? ` (${detalhe})` : ""}`);
  }
}

// Helper para criar array RGBA para testar analisarVariacaoPixels no cliente
function criarBufferRgba(largura: number, altura: number, gerador: (x: number, y: number) => [number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(largura * altura * 4);
  let idx = 0;
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const [r, g, b] = gerador(x, y);
      data[idx++] = r;
      data[idx++] = g;
      data[idx++] = b;
      data[idx++] = 255;
    }
  }
  return data;
}

// Helper para criar JPEG texturizado de alto contraste >= 128x128
async function gerarJpegTexturizado(largura = 160, altura = 160): Promise<string> {
  const svg = `<svg width="${largura}" height="${altura}">
    <rect width="${largura}" height="${altura}" fill="#222" />
    <circle cx="${largura / 2}" cy="${altura / 2}" r="${largura / 3}" fill="#ffe0bd" />
    <circle cx="${largura / 2 - 20}" cy="${altura / 2 - 15}" r="8" fill="#111" />
    <circle cx="${largura / 2 + 20}" cy="${altura / 2 - 15}" r="8" fill="#111" />
    <rect x="${largura / 2 - 25}" y="${altura / 2 + 20}" width="50" height="10" fill="#a00" />
    <line x1="0" y1="0" x2="${largura}" y2="${altura}" stroke="#fff" stroke-width="4" />
  </svg>`;
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

// Helper para JPEG de cor sólida
async function gerarJpegSolido(largura: number, altura: number, r: number, g: number, b: number): Promise<string> {
  const buf = await sharp({
    create: {
      width: largura,
      height: altura,
      channels: 3,
      background: { r, g, b },
    },
  })
    .jpeg()
    .toBuffer();
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

async function rodarTestes() {
  console.log("1. Análise pura de variação de pixels no cliente (analisarVariacaoPixels):");
  
  // Imagem sólida azul (60, 120, 200)
  const azulRgba = criarBufferRgba(100, 100, () => [60, 120, 200]);
  const resAzul = analisarVariacaoPixels(azulRgba);
  caso("rejeita imagem sólida azul (Genilson)", resAzul.valida === false);

  // Imagem sólida branca (255, 255, 255)
  const brancoRgba = criarBufferRgba(100, 100, () => [255, 255, 255]);
  const resBranco = analisarVariacaoPixels(brancoRgba);
  caso("rejeita imagem sólida branca", resBranco.valida === false);

  // Imagem sólida preta (0, 0, 0)
  const pretoRgba = criarBufferRgba(100, 100, () => [0, 0, 0]);
  const resPreto = analisarVariacaoPixels(pretoRgba);
  caso("rejeita imagem sólida preta", resPreto.valida === false);

  // Imagem com alto contraste / variação realista
  const xadrezRgba = criarBufferRgba(100, 100, (x, y) => {
    return (Math.floor(x / 10) + Math.floor(y / 10)) % 2 === 0 ? [240, 220, 190] : [30, 40, 50];
  });
  const resXadrez = analisarVariacaoPixels(xadrezRgba);
  caso("aceita imagem com contraste e variação suficiente", resXadrez.valida === true);

  console.log("\n2. Validador híbrido no servidor (validarSelfieContracheque):");

  // Rejeição de payload nulo / malformado
  const rNull = await validarSelfieContracheque(null);
  caso("rejeita null", !rNull.ok && rNull.error === MSG_SELFIE_INVALIDA);

  const rUndef = await validarSelfieContracheque(undefined);
  caso("rejeita undefined", !rUndef.ok && rUndef.error === MSG_SELFIE_INVALIDA);

  const rVazio = await validarSelfieContracheque("");
  caso("rejeita string vazia", !rVazio.ok && rVazio.error === MSG_SELFIE_INVALIDA);

  const rFormatoInvalido = await validarSelfieContracheque(`data:image/gif;base64,${Buffer.alloc(2048).toString("base64")}`);
  caso("rejeita formato image/gif", !rFormatoInvalido.ok && rFormatoInvalido.error === MSG_SELFIE_INVALIDA);

  // Rejeição de JPEG sólido azul 120x120
  const azulJpeg = await gerarJpegSolido(120, 120, 60, 120, 200);
  const rAzul = await validarSelfieContracheque(azulJpeg);
  caso("rejeita JPEG sólido azul 120x120", !rAzul.ok && rAzul.error === MSG_SELFIE_SEM_VARIACAO);

  // Rejeição de imagem muito pequena (< 64x64)
  const pequenoJpeg = await gerarJpegSolido(16, 16, 128, 128, 128);
  const rPequeno = await validarSelfieContracheque(pequenoJpeg);
  caso("rejeita imagem < 64x64 (ex: 16x16)", !rPequeno.ok && rPequeno.error === MSG_SELFIE_SEM_VARIACAO);

  // Imagem texturizada >= 128x128
  const texturizadoJpeg = await gerarJpegTexturizado(160, 160);

  // Caso A: IA desabilitada via TESTE_SELFIE_SEM_IA=1
  process.env.TESTE_SELFIE_SEM_IA = "1";
  const rSemIa = await validarSelfieContracheque(texturizadoJpeg);
  caso("aprova JPEG texturizado com TESTE_SELFIE_SEM_IA=1", rSemIa.ok === true && rSemIa.validadoComIa === false);
  delete process.env.TESTE_SELFIE_SEM_IA;

  // Caso B: Detector IA injetado aprova rosto
  const rIaAprovou = await validarSelfieContracheque(texturizadoJpeg, {
    detectarRostoFn: async () => ({ ok: true, rostoDetectado: true }),
  });
  caso("aprova quando IA detecta rosto humano", rIaAprovou.ok === true && rIaAprovou.validadoComIa === true);

  // Caso C: Detector IA injetado reprova (sem rosto)
  const rIaReprovou = await validarSelfieContracheque(texturizadoJpeg, {
    detectarRostoFn: async () => ({ ok: true, rostoDetectado: false, motivo: "Parede vazia" }),
  });
  caso(
    "reprova com MSG_SELFIE_SEM_ROSTO quando IA não detecta rosto",
    !rIaReprovou.ok && rIaReprovou.error === MSG_SELFIE_SEM_ROSTO
  );

  // Caso D: Degradação graciosa quando IA falha (timeout / erro de rede)
  const avisos: string[] = [];
  const warnOriginal = console.warn;
  console.warn = (...args: unknown[]) => {
    avisos.push(args.map(String).join(" "));
  };
  try {
    const rIaFalhou = await validarSelfieContracheque(texturizadoJpeg, {
      detectarRostoFn: async () => {
        throw new Error("Timeout simulado de 8s");
      },
    });
    caso(
      "aprova com degradação graciosa quando IA falha e sharp aprovou",
      rIaFalhou.ok === true && rIaFalhou.validadoComIa === false
    );
    caso(
      "registrou aviso em console.warn sobre falha da IA",
      avisos.some((m) => m.includes("falha na detecção facial via Anthropic"))
    );
  } finally {
    console.warn = warnOriginal;
  }

  if (falhas > 0) {
    console.error(`\n${falhas} teste(s) falharam.`);
    process.exit(1);
  } else {
    console.log("\nTodos os testes de validação de selfie passaram!");
  }
}

rodarTestes().catch((err) => {
  console.error("Erro fatal nos testes:", err);
  process.exit(1);
});
