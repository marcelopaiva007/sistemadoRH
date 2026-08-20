// A regra "esta foto serve para registrar a batida?" — fora da action de
// propósito: app/actions/portal-ponto.ts é módulo "use server", que só pode
// exportar função ASYNC, e a regra precisa ser exportada para o teste de
// guarda (scripts/test-ponto-foto.ts) — sem ele, um refactor que enfraquecesse
// a validação passaria verde em type-check, lint e CI inteira, e batida sem
// foto voltaria a registrar sem ninguém perceber.

// Teto do payload da foto (data URL). O cartão reduz a selfie para ~640px
// antes de enviar (~60 KB); 1,5 MB de base64 já é chamada direta à action com
// payload anormal, não foto de batida.
export const LIMITE_FOTO_DATA_URL = 1_500_000;

// JPEG **ou PNG**, e a lista fechada continua sendo o que protege: nada de
// aceitar `data:` genérico. O PNG entrou na auditoria de 13/08/2026 por um
// motivo concreto — quando o navegador não suporta o tipo pedido em
// `toDataURL`, a especificação manda cair para PNG em silêncio. Aceitando só
// JPEG, essa batida seria recusada e ninguém saberia por quê.
export const REGEX_FOTO_DATA_URL = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/;

// Assinaturas dos dois formatos aceitos. A regex sozinha não bastava: a
// revisão de 20/08/2026 mostrou que "data:image/jpeg;base64,=" (0 bytes) e
// "…;base64,AA==" (1 byte de lixo) passavam nela — o primeiro registrava
// "sem foto" indistinguível de falha de infra, o segundo registrava com
// comFoto: true e um "arquivo" que não abre quando o RH clica. Conferir os
// primeiros bytes fecha o caso trivial; replay de um JPEG real continua
// possível (nenhum servidor valida conteúdo de imagem), mas aí HÁ uma foto,
// e o painel mostra o que ela é.
const MAGIC_JPEG = [0xff, 0xd8, 0xff] as const;
const MAGIC_PNG = [0x89, 0x50, 0x4e, 0x47] as const;

// Piso de tamanho: até um JPEG de 1×1 pixel tem centenas de bytes; abaixo de
// 64 não existe imagem real, só payload fabricado que por acaso começa com a
// assinatura certa.
const MINIMO_BYTES_FOTO = 64;

/**
 * A foto que o colaborador enviou serve para registrar? Presente, dentro do
 * teto, num dos dois formatos aceitos E com o binário começando pela
 * assinatura do formato declarado.
 *
 * Desde 20/08/2026 a foto é OBRIGATÓRIA (pedido do RH: confirmar identidade e
 * local da batida) — e a obrigação vive no SERVIDOR, porque a action de
 * registrar é endpoint POST público: tirar o botão "Registrar sem foto" da
 * tela não impediria uma chamada direta sem foto. O contrato desta função:
 * o que passa aqui só falha no upload por INFRAESTRUTURA — por isso ela
 * precisa recusar tudo que o upload descartaria por outra razão (vazio,
 * formato errado), senão a recusa silenciosa viraria "sem foto" no painel,
 * indistinguível de Blob fora do ar.
 */
export function fotoDeBatidaValida(dataUrl: string | null | undefined): dataUrl is string {
  if (!dataUrl || dataUrl.length > LIMITE_FOTO_DATA_URL) return false;
  const casado = REGEX_FOTO_DATA_URL.exec(dataUrl);
  if (!casado) return false;

  let bytes: Buffer;
  try {
    bytes = Buffer.from(casado[2], "base64");
  } catch {
    return false;
  }
  if (bytes.byteLength < MINIMO_BYTES_FOTO) return false;

  const magic = casado[1] === "png" ? MAGIC_PNG : MAGIC_JPEG;
  return magic.every((b, i) => bytes[i] === b);
}
