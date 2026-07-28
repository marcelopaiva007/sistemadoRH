// Armazenamento dos anexos no Vercel Blob.
//
// Antes tudo ia para a coluna `Arquivo.conteudo` (Bytes). Funciona, mas com as
// 253 pessoas enviando documentos pelo portal o banco sairia de 18 MB para
// poucos GB — e todo backup e restore do Neon passaria a carregar os PDFs
// junto. O Postgres guarda agora só a URL.
//
// Sem BLOB_READ_WRITE_TOKEN a função devolve erro claro em vez de explodir,
// mesmo contrato de lib/telegram.ts e lib/email.ts: o recurso fica inerte até
// alguém configurar, e o resto do sistema não quebra por falta dele.
import { put, del } from "@vercel/blob";

export function blobConfigurado(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

export type EnvioBlob =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * Sobe um anexo e devolve a URL pública.
 *
 * `addRandomSuffix` é obrigatório aqui: dois colaboradores mandando "rg.pdf"
 * no mesmo caminho sobrescreveriam um ao outro — e o segundo veria o documento
 * do primeiro. O sufixo aleatório também serve de proteção: a URL é pública
 * para quem a tem, e não dá para adivinhar o caminho do documento alheio.
 */
export async function enviarParaBlob(params: {
  empresaId: string;
  colaboradorId: string;
  nome: string;
  mimeType: string;
  bytes: Uint8Array<ArrayBuffer>;
}): Promise<EnvioBlob> {
  if (!blobConfigurado()) {
    return {
      ok: false,
      error:
        "Armazenamento de arquivos não configurado (BLOB_READ_WRITE_TOKEN). Avise o RH.",
    };
  }

  const limpo = params.nome.replace(/[^\w.\-]/g, "_").slice(-120);
  const caminho = `rh/${params.empresaId}/${params.colaboradorId}/${limpo}`;

  try {
    const { url } = await put(caminho, Buffer.from(params.bytes), {
      access: "public",
      addRandomSuffix: true,
      contentType: params.mimeType,
    });
    return { ok: true, url };
  } catch (e) {
    return { ok: false, error: `Falha ao enviar o arquivo: ${String(e).slice(0, 120)}` };
  }
}

/** Best-effort: apagar o registro é o que importa, o blob órfão só ocupa espaço. */
export async function removerDoBlob(url: string): Promise<void> {
  if (!blobConfigurado()) return;
  try {
    await del(url);
  } catch {
    // silêncio proposital — ver comentário acima
  }
}
