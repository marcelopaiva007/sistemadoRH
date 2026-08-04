// DIAGNÓSTICO TEMPORÁRIO — remover depois de usar uma vez.
//
// Só lista nome/tamanho/data dos backups já existentes no B2 e no Vercel
// Blob, pra confirmar se sobrou alguma cópia de antes da migração de banco de
// 01/08/2026 (ver docs/migracao-banco-dedicado.md). Não lê conteúdo de
// arquivo nenhum, só metadado — e não existe outro jeito de checar isso sem
// as credenciais reais, que só existem no runtime da Vercel.
//
// Auth: token fixo gerado só para esta consulta (não é CRON_SECRET — esse
// valor é redigido para quem está rodando este diagnóstico, então não daria
// pra autenticar a própria chamada). Rota inteira sai no commit seguinte.
import { NextRequest, NextResponse } from "next/server";
import { list as listBlob } from "@vercel/blob";

export const runtime = "nodejs";

const TOKEN_TEMPORARIO = "03d59818567541a10e71bbc0851344b10cb488290bdc4363";

function autorizado(req: NextRequest): boolean {
  return req.nextUrl.searchParams.get("t") === TOKEN_TEMPORARIO;
}

async function listarB2(prefix: string) {
  const keyId = process.env.B2_KEY_ID;
  const appKey = process.env.B2_APPLICATION_KEY;
  const bucketId = process.env.B2_BUCKET_ID;
  if (!keyId || !appKey || !bucketId) {
    return { ok: false as const, error: "B2 não configurado neste ambiente" };
  }

  const authRes = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${keyId}:${appKey}`).toString("base64") },
  });
  if (!authRes.ok) return { ok: false as const, error: `b2_authorize_account falhou: ${authRes.status}` };
  const auth = (await authRes.json()) as { apiUrl: string; authorizationToken: string };

  const listRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_list_file_names`, {
    method: "POST",
    headers: { Authorization: auth.authorizationToken },
    body: JSON.stringify({ bucketId, prefix, maxFileCount: 1000 }),
  });
  if (!listRes.ok) return { ok: false as const, error: `b2_list_file_names falhou: ${listRes.status}` };
  const data = (await listRes.json()) as {
    files: { fileName: string; contentLength: number; uploadTimestamp: number }[];
  };

  return {
    ok: true as const,
    arquivos: data.files.map((f) => ({
      nome: f.fileName,
      mb: (f.contentLength / 1024 / 1024).toFixed(2),
      dataUpload: new Date(f.uploadTimestamp).toISOString(),
    })),
  };
}

async function listarBlob(prefix: string) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return { ok: false as const, error: "BLOB_READ_WRITE_TOKEN não configurado neste ambiente" };
  }
  try {
    const { blobs } = await listBlob({ prefix, limit: 1000 });
    return {
      ok: true as const,
      arquivos: blobs.map((b) => ({
        nome: b.pathname,
        mb: (b.size / 1024 / 1024).toFixed(2),
        dataUpload: b.uploadedAt,
      })),
    };
  } catch (e) {
    return { ok: false as const, error: `list() falhou: ${String(e).slice(0, 200)}` };
  }
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [b2, blob] = await Promise.all([listarB2("db/"), listarBlob("backups/")]);

  return NextResponse.json({ b2_db: b2, vercel_blob_backups: blob });
}
