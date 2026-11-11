import sharp from "sharp";
import Anthropic from "@anthropic-ai/sdk";
import { CHAVE_ANTHROPIC, segredo } from "@/lib/segredos";
import { fotoDeBatidaValida, REGEX_FOTO_DATA_URL } from "@/lib/ponto-foto";

export const MSG_SELFIE_INVALIDA = "Foto inválida ou não reconhecida. Por favor, tire uma nova selfie nítida.";
export const MSG_SELFIE_SEM_VARIACAO =
  "A foto enviada parece estar em branco, escura ou sem nitidez (câmera coberta). Por favor, tire uma selfie nítida do seu rosto em local iluminado.";
export const MSG_SELFIE_SEM_ROSTO =
  "Nenhum rosto foi identificado na foto. Por favor, posicione seu rosto centralizado na câmera e tente novamente.";

const MODELO_VISAO = "claude-sonnet-5";

export type DetectorRostoFn = (jpegBuffer: Buffer) => Promise<{
  ok: boolean;
  rostoDetectado: boolean;
  motivo?: string;
}>;

export type OpcoesValidacaoSelfie = {
  detectarRostoFn?: DetectorRostoFn;
};

export type ResultadoValidacaoSelfie =
  | { ok: true; bytes: Buffer; ehPng: boolean; validadoComIa: boolean }
  | { ok: false; error: string };

/**
 * Validação híbrida de selfie para assinatura de contracheques:
 * 1. Formato, teto e assinatura do arquivo (regras do ponto).
 * 2. Análise estatística via Sharp (dimensões mínimas 64x64, entropia >= 3.0 e desvio RGB >= 12).
 *    Rejeita imagens sólidas, monocromáticas ou câmeras cobertas sem gastar IA.
 * 3. Validação biométrica facial via Claude Vision (claude-sonnet-5) quando chave configurada,
 *    com degradação graciosa em caso de indisponibilidade da IA.
 */
export async function validarSelfieContracheque(
  fotoDataUrl: string | null | undefined,
  opcoes?: OpcoesValidacaoSelfie
): Promise<ResultadoValidacaoSelfie> {
  // 1. Integridade básica de formato e assinatura
  if (!fotoDeBatidaValida(fotoDataUrl)) {
    return { ok: false, error: MSG_SELFIE_INVALIDA };
  }

  const casado = REGEX_FOTO_DATA_URL.exec(fotoDataUrl);
  if (!casado) {
    return { ok: false, error: MSG_SELFIE_INVALIDA };
  }

  const ehPng = casado[1] === "png";
  const bytes = Buffer.from(casado[2], "base64");

  // 2. Análise estatística determinística no servidor via Sharp
  try {
    const img = sharp(bytes);
    const [meta, stats] = await Promise.all([img.metadata(), img.stats()]);

    const largura = meta.width ?? 0;
    const altura = meta.height ?? 0;

    if (largura < 64 || altura < 64) {
      return { ok: false, error: MSG_SELFIE_SEM_VARIACAO };
    }

    if (stats.entropy < 3.0) {
      return { ok: false, error: MSG_SELFIE_SEM_VARIACAO };
    }

    const canaisRgb = stats.channels.slice(0, 3);
    const desvioMaximo = Math.max(...canaisRgb.map((c) => c.stdev));
    if (desvioMaximo < 12) {
      return { ok: false, error: MSG_SELFIE_SEM_VARIACAO };
    }
  } catch {
    return { ok: false, error: MSG_SELFIE_SEM_VARIACAO };
  }

  // 3. Validação facial via IA (injetada em testes ou Anthropic Vision em produção)
  if (opcoes?.detectarRostoFn) {
    try {
      const res = await opcoes.detectarRostoFn(bytes);
      if (res.rostoDetectado === false) {
        return { ok: false, error: MSG_SELFIE_SEM_ROSTO };
      }
      if (res.ok && res.rostoDetectado) {
        return { ok: true, bytes, ehPng, validadoComIa: true };
      }
      console.warn("[contracheques] falha na detecção facial via Anthropic, mantendo validação sharp:", res);
      return { ok: true, bytes, ehPng, validadoComIa: false };
    } catch (err) {
      console.warn("[contracheques] falha na detecção facial via Anthropic, mantendo validação sharp:", err);
      return { ok: true, bytes, ehPng, validadoComIa: false };
    }
  }

  if (process.env.TESTE_SELFIE_SEM_IA !== "1") {
    try {
      const chave = await segredo(CHAVE_ANTHROPIC);
      if (chave) {
        const jpegParaIa = await sharp(bytes)
          .resize(512, 512, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();

        const anthropic = new Anthropic({ apiKey: chave });
        const resposta = await anthropic.messages.create(
          {
            model: MODELO_VISAO,
            max_tokens: 120,
            output_config: { effort: "low" },
            tools: [
              {
                name: "validar_selfie_rosto",
                description:
                  "Valida se a imagem é uma selfie contendo um rosto humano identificável para assinatura de documento.",
                input_schema: {
                  type: "object",
                  properties: {
                    rostoDetectado: {
                      type: "boolean",
                      description: "Verdadeiro se há pelo menos um rosto humano visível e identificável na foto.",
                    },
                    motivo: {
                      type: "string",
                      description: "Explicação sucinta se não houver rosto ou se a imagem for imprópria.",
                    },
                  },
                  required: ["rostoDetectado", "motivo"],
                },
              },
            ],
            tool_choice: { type: "tool", name: "validar_selfie_rosto" },
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: "image/jpeg",
                      data: jpegParaIa.toString("base64"),
                    },
                  },
                  {
                    type: "text",
                    text: "Analise esta selfie de assinatura de contracheque. Há um rosto humano identificável nesta foto?",
                  },
                ],
              },
            ],
          },
          { signal: AbortSignal.timeout(8000) }
        );

        if (resposta.stop_reason === "refusal") {
          return { ok: false, error: MSG_SELFIE_SEM_ROSTO };
        }

        const chamada = resposta.content.find((c) => c.type === "tool_use");
        if (chamada && chamada.type === "tool_use") {
          const input = chamada.input as { rostoDetectado?: boolean; motivo?: string };
          if (input.rostoDetectado === false) {
            return { ok: false, error: MSG_SELFIE_SEM_ROSTO };
          }
          return { ok: true, bytes, ehPng, validadoComIa: true };
        }
      }
    } catch (err) {
      console.warn("[contracheques] falha na detecção facial via Anthropic, mantendo validação sharp:", err);
      return { ok: true, bytes, ehPng, validadoComIa: false };
    }
  }

  return { ok: true, bytes, ehPng, validadoComIa: false };
}
