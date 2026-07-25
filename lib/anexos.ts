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

  return {
    ok: true,
    anexo: {
      nome: valor.name.slice(0, 200),
      mimeType: valor.type,
      bytes: new Uint8Array(await valor.arrayBuffer()),
    },
  };
}

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
