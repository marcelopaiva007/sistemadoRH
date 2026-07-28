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
import { put, del, get } from "@vercel/blob";

export function blobConfigurado(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

export type EnvioBlob =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * Sobe um anexo e devolve a URL para recuperá-lo depois.
 *
 * `access: "private"` é o que o store exige, e é o que documento pessoal pede:
 * a URL sozinha não abre nada. Quem serve o arquivo é a nossa rota, que já
 * valida a sessão e registra na auditoria quem baixou o quê.
 *
 * `addRandomSuffix` porque dois colaboradores mandando "rg.pdf" no mesmo
 * caminho sobrescreveriam um ao outro — e o segundo veria o documento do
 * primeiro.
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
      access: "private",
      addRandomSuffix: true,
      contentType: params.mimeType,
    });
    return { ok: true, url };
  } catch (e) {
    return { ok: false, error: `Falha ao enviar o arquivo: ${String(e).slice(0, 120)}` };
  }
}

/**
 * Lê um anexo do Blob para servir pela nossa rota.
 *
 * Store privado não abre por URL — o arquivo tem que passar por aqui, o que é
 * exatamente o que se quer para RG e comprovante de residência: quem baixa
 * passa pelo guarda de sessão e fica registrado na auditoria.
 */
export async function baixarDoBlob(
  url: string,
): Promise<{ ok: true; bytes: ArrayBuffer } | { ok: false; error: string }> {
  if (!blobConfigurado()) {
    return { ok: false, error: "Armazenamento de arquivos não configurado." };
  }
  try {
    const resultado = await get(url, { access: "private" });
    if (!resultado) return { ok: false, error: "Arquivo não encontrado no armazenamento." };
    return { ok: true, bytes: await new Response(resultado.stream).arrayBuffer() };
  } catch (e) {
    return { ok: false, error: `Falha ao ler o arquivo: ${String(e).slice(0, 120)}` };
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
