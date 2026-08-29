// Leitura e validação dos anexos (dossiê digital e atestados).
//
// Fica fora dos arquivos "use server" de propósito: tudo que é exportado de um
// módulo de server action vira um endpoint público, e isto aqui é só um helper
// interno chamado pelas actions.
import { MIMES_ANEXO_ACEITOS, TAMANHO_MAXIMO_ANEXO } from "@/lib/constants-dp";

const MIMES_VALIDOS = new Set<string>(MIMES_ANEXO_ACEITOS);

// `bytes` é Uint8Array e não Buffer porque é o que o Prisma 7 espera numa
// coluna Bytes — e com o parâmetro <ArrayBuffer> explícito, senão o default
// ArrayBufferLike não casa com o tipo gerado pelo Prisma.
export type AnexoValidado = { nome: string; mimeType: string; bytes: Uint8Array<ArrayBuffer> };

export type LeituraAnexo =
  | { ok: true; anexo: AnexoValidado | null }
  | { ok: false; error: string };

function comecaCom(bytes: Uint8Array, assinatura: number[], offset = 0): boolean {
  if (bytes.length < offset + assinatura.length) return false;
  for (let i = 0; i < assinatura.length; i++) {
    if (bytes[offset + i] !== assinatura[i]) return false;
  }
  return true;
}

// Procura a assinatura em qualquer posição até `ateByte`. Usado no PDF, que
// pode trazer BOM/espaços antes do "%PDF" (PDFs escaneados fazem isso) — exigir
// no byte 0 rejeitaria arquivo válido.
function contemAteByte(bytes: Uint8Array, assinatura: number[], ateByte: number): boolean {
  const limite = Math.min(bytes.length - assinatura.length, ateByte);
  for (let off = 0; off <= limite; off++) {
    if (comecaCom(bytes, assinatura, off)) return true;
  }
  return false;
}

// Confere a assinatura (magic bytes) contra o mimeType declarado. O `type` do
// File vem do cliente e é falsificável; sem esta checagem, bytes arbitrários
// (HTML/script) poderiam ser guardados sob um "image/png". É defesa em
// profundidade sobre a allowlist de MIME e o `nosniff` global — fecha a
// integridade do conteúdo (um "PDF" que não é PDF).
function assinaturaConfere(bytes: Uint8Array, mimeType: string): boolean {
  switch (mimeType) {
    case "application/pdf":
      return contemAteByte(bytes, [0x25, 0x50, 0x44, 0x46], 1024); // %PDF (tolera BOM/espaços iniciais)
    case "image/jpeg":
      return comecaCom(bytes, [0xff, 0xd8, 0xff]);
    case "image/png":
      return comecaCom(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      // "RIFF"...."WEBP"
      return comecaCom(bytes, [0x52, 0x49, 0x46, 0x46]) && comecaCom(bytes, [0x57, 0x45, 0x42, 0x50], 8);
    case "image/heic":
      // caixa "ftyp" do contêiner ISO-BMFF (offset 4)
      return comecaCom(bytes, [0x66, 0x74, 0x79, 0x70], 4);
    default:
      return false;
  }
}

/**
 * Lê e valida um anexo do FormData. Devolve `anexo: null` quando o campo veio
 * vazio — o RH pode cadastrar o documento só com os metadados e anexar o PDF
 * depois.
 */
export async function lerAnexo(formData: FormData, campo = "arquivo"): Promise<LeituraAnexo> {
  const valor = formData.get(campo);
  if (!(valor instanceof File) || valor.size === 0) return { ok: true, anexo: null };

  if (valor.size > TAMANHO_MAXIMO_ANEXO) {
    const mb = (TAMANHO_MAXIMO_ANEXO / 1024 / 1024).toFixed(0);
    return { ok: false, error: `O arquivo passa de ${mb} MB. Comprima o PDF ou reduza a foto.` };
  }
  if (!MIMES_VALIDOS.has(valor.type)) {
    return { ok: false, error: "Formato não aceito. Envie PDF, JPG, PNG ou WEBP." };
  }

  const bytes = new Uint8Array(await valor.arrayBuffer());
  if (!assinaturaConfere(bytes, valor.type)) {
    return {
      ok: false,
      error: "O conteúdo do arquivo não confere com o formato informado. Envie um PDF, JPG, PNG ou WEBP de verdade.",
    };
  }

  return {
    ok: true,
    anexo: {
      nome: valor.name.slice(0, 200),
      mimeType: valor.type,
      bytes,
    },
  };
}

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
