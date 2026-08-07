// DIAGNÓSTICO TEMPORÁRIO — remover depois de usar uma vez.
//
// Só chama b2_authorize_account (o mesmo primeiro passo que
// app/api/cron/backup-db/route.ts usa) e devolve o corpo do erro, se houver.
// Não faz dump, não sobe nada, não lê tabela nenhuma.
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const TOKEN_TEMPORARIO = "797d04ca367def9d46b41b7ab1849ba4e3bfeed48b6e05b9";

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("t") !== TOKEN_TEMPORARIO) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keyId = process.env.B2_KEY_ID;
  const appKey = process.env.B2_APPLICATION_KEY;
  const bucket = process.env.B2_BUCKET;
  const bucketId = process.env.B2_BUCKET_ID;

  const presentes = {
    B2_KEY_ID: !!keyId,
    B2_APPLICATION_KEY: !!appKey,
    B2_BUCKET: !!bucket,
    B2_BUCKET_ID: !!bucketId,
  };

  if (!keyId || !appKey) {
    return NextResponse.json({ presentes, erro: "faltando credencial" });
  }

  const authRes = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${keyId}:${appKey}`).toString("base64") },
  });
  const corpo = await authRes.text();

  return NextResponse.json({
    presentes,
    keyIdLen: keyId.length,
    keyIdPrefix: keyId.slice(0, 4),
    appKeyLen: appKey.length,
    status: authRes.status,
    corpo: corpo.slice(0, 500),
  });
}
