// Backup automático do banco Neon (Vercel Cron).
//
// Dispara pg_dump via child_process, compacta e armazena no Backblaze B2.
// Roda uma vez por dia às 06:00 (horário de SP) — janela de menor uso.
//
// Auth: SÓ `Authorization: Bearer $CRON_SECRET` — padrão dos outros crons.
// O disparo por `?secret=` na URL foi removido em 27/08/2026 (vazava o
// segredo em log/Referer). Para rodar à mão, mandar o header.
//
// Variáveis de ambiente necessárias:
//   - DATABASE_URL: connection string do banco
//   - CRON_SECRET: token de auth do Vercel Cron
//   - B2_KEY_ID, B2_APPLICATION_KEY: credenciais Backblaze B2
//   - B2_BUCKET: nome do bucket (ex: sistema-lm-rh)
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import * as path from "node:path";
import { Readable } from "node:stream";

export const runtime = "nodejs";
export const maxDuration = 300;

function autorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Só o header. O disparo por `?secret=` na URL foi removido (pentest
  // 27/08/2026): o segredo vazava em log/Referer/histórico, e esta rota faz
  // pg_dump do banco inteiro. Comparação em tempo constante.
  const recebido = req.headers.get("authorization");
  if (!recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

function extractPassword(url: string): string {
  try {
    const u = new URL(url);
    // `u.password` vem percent-encoded; PGPASSWORD precisa da senha crua.
    // Antes a URL inteira (com a senha codificada) era o argv do pg_dump e o
    // libpq a decodificava; agora a senha vai só por PGPASSWORD, então tem de
    // ser decodificada aqui — senão uma senha com caractere especial quebraria
    // a autenticação do backup em silêncio.
    return decodeURIComponent(u.password);
  } catch {
    return "";
  }
}

// Remove a senha da connection string. A senha vai só pelo env PGPASSWORD; a
// URL passada como argumento do pg_dump fica sem ela, senão a senha do banco
// apareceria na lista de processos do host (`ps aux` / /proc/<pid>/cmdline).
function urlSemSenha(url: string): string {
  try {
    const u = new URL(url);
    u.password = "";
    return u.toString();
  } catch {
    return url;
  }
}

async function gerarDump(): Promise<Buffer> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");

  return new Promise((resolve, reject) => {
    const proc = spawn(
      "pg_dump",
      ["--no-owner", "--no-acl", "--clean", "--if-exists", urlSemSenha(url)],
      { env: { ...process.env, PGPASSWORD: extractPassword(url) } },
    );

    const chunks: Buffer[] = [];
    proc.stdout.on("data", (c: Buffer) => chunks.push(c));
    proc.stderr.on("data", (c: Buffer) => process.stderr.write(c));
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`pg_dump saiu com código ${code}`));
      else resolve(Buffer.concat(chunks));
    });
    proc.on("error", reject);
  });
}

async function uploadB2(buffer: Buffer, key: string): Promise<void> {
  const keyId = process.env.B2_KEY_ID;
  const appKey = process.env.B2_APPLICATION_KEY;
  const bucket = process.env.B2_BUCKET;
  if (!keyId || !appKey || !bucket) {
    throw new Error("Credenciais B2 não configuradas (B2_KEY_ID/B2_APPLICATION_KEY/B2_BUCKET)");
  }

  // 1. Auth
  const authRes = await fetch(
    "https://api.backblazeb2.com/b2api/v2/b2_authorize_account",
    {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${keyId}:${appKey}`).toString("base64"),
      },
    },
  );
  if (!authRes.ok) throw new Error(`B2 auth falhou: ${authRes.status}`);
  const auth = (await authRes.json()) as {
    apiUrl: string;
    authorizationToken: string;
  };

  // 2. Upload URL
  const urlRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
    method: "POST",
    headers: { Authorization: auth.authorizationToken },
    body: JSON.stringify({ bucketId: process.env.B2_BUCKET_ID }),
  });
  if (!urlRes.ok) throw new Error(`B2 get_upload_url falhou: ${urlRes.status}`);
  const urlData = (await urlRes.json()) as { uploadUrl: string; authorizationToken: string };

  // 3. Upload
  const sha1 = await crypto.subtle.digest("SHA-1", new Uint8Array(buffer));
  const sha1Hex = Array.from(new Uint8Array(sha1))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const up = await fetch(urlData.uploadUrl, {
    method: "POST",
    headers: {
      Authorization: urlData.authorizationToken,
      "X-Bz-File-Name": key,
      "Content-Type": "application/sql",
      "X-Bz-Content-Sha1": sha1Hex,
      "X-Bz-Info-src_last_modified_millis": String(Date.now()),
    },
    body: new Uint8Array(buffer),
  });
  if (!up.ok) {
    const txt = await up.text();
    throw new Error(`B2 upload falhou: ${up.status} ${txt}`);
  }
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Gera dump
    const sqlBuffer = await gerarDump();

    // 2. Compacta
    const gzBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      Readable.from(sqlBuffer)
        .pipe(createGzip())
        .on("data", (c: Buffer) => chunks.push(c))
        .on("end", () => resolve(Buffer.concat(chunks)))
        .on("error", reject);
    });

    // 3. Upload pro B2
    const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const key = `db/${timestamp}.sql.gz`;
    await uploadB2(gzBuffer, key);

    return NextResponse.json({
      ok: true,
      arquivo: key,
      bytes: gzBuffer.length,
      mb: (gzBuffer.length / 1024 / 1024).toFixed(2),
      timestamp: new Date().toISOString(),
      retencao: "Backblaze B2 - sistema-lm-rh/db/",
    });
  } catch (err) {
    // O detalhe do erro (mensagens do pg_dump/B2/driver, que podem revelar
    // caminhos do host ou dados de conexão) fica só no log do servidor; ao
    // chamador vai uma mensagem genérica.
    const mensagem = err instanceof Error ? err.message : String(err);
    console.error("cron/backup-db:", mensagem);
    return NextResponse.json({ error: "Backup falhou" }, { status: 500 });
  }
}