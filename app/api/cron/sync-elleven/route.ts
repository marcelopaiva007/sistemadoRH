// Sincronização diária com o elleven (Voalle/EVO) — FASE DIAGNÓSTICO.
//
// Este endpoint ainda não grava nada no banco. Ele faz login no elleven,
// navega até o relatório "Ativação Contratos" e devolve um dump (texto,
// HTML e screenshot) do que encontrar, para permitirmos mapear o formato
// real dos dados antes de escrever a lógica de importação definitiva.
//
// Variáveis de ambiente necessárias:
//   ELLEVEN_LOGIN, ELLEVEN_PASSWORD — credenciais do elleven (CPF + senha)
//   SYNC_ELLEVEN_SECRET — protege o endpoint (?secret=... ou header x-sync-secret)
import { NextRequest, NextResponse } from "next/server";
import chromium from "@sparticuz/chromium";
import { chromium as playwrightChromium, type Browser } from "playwright-core";

export const runtime = "nodejs";
export const maxDuration = 300;

const ELLEVEN_BASE = "https://elleven.assinelm.com.br";
// Relatórios > Faturamento > Ativação Contratos
const REPORT_PATH = "/ui/legacy/reports/316e54f3-bdaa-b95a-5597-e9164279071e";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function isAuthorized(req: NextRequest): boolean {
  // Vercel Cron envia "Authorization: Bearer $CRON_SECRET" automaticamente
  // quando CRON_SECRET está definido nas env vars.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") === `Bearer ${cronSecret}`) return true;

  // Para disparo manual/diagnóstico: ?secret=... ou header x-sync-secret.
  const manualSecret = process.env.SYNC_ELLEVEN_SECRET;
  const provided = req.nextUrl.searchParams.get("secret") || req.headers.get("x-sync-secret");
  if (manualSecret && provided === manualSecret) return true;

  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();

  const login = process.env.ELLEVEN_LOGIN;
  const password = process.env.ELLEVEN_PASSWORD;
  if (!login || !password) {
    return NextResponse.json(
      { error: "ELLEVEN_LOGIN/ELLEVEN_PASSWORD não configurados nas env vars." },
      { status: 500 }
    );
  }

  const log: string[] = [];
  const step = (s: string) => {
    const line = `[${new Date().toISOString()}] ${s}`;
    log.push(line);
    console.log(line);
  };

  let browser: Browser | undefined;
  try {
    step("Iniciando Chromium serverless...");
    browser = await playwrightChromium.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

    step("Abrindo tela de login do elleven...");
    await page.goto(`${ELLEVEN_BASE}/ui/login`, { waitUntil: "load", timeout: 30000 });
    await page.waitForSelector('input[placeholder="Entre com seu CPF"]', { timeout: 15000 });
    await page.fill('input[placeholder="Entre com seu CPF"]', login);
    await page.fill('input[placeholder="Entre com sua senha"]', password);
    await page.click('button:has-text("Entrar")');
    await page.waitForTimeout(6000);
    step(`Login concluído. URL atual: ${page.url()}`);

    if (page.url().includes("/login")) {
      throw new Error("Login não avançou — continua na tela de login (credenciais incorretas ou CAPTCHA/MFA apareceu).");
    }

    step("Navegando até o relatório Ativação Contratos...");
    await page.goto(`${ELLEVEN_BASE}${REPORT_PATH}`, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(15000);

    const reportFrame = page.frames().find((f) => f.url().includes("reports_exec"));
    step(`Frame do relatório (reports_exec) encontrado: ${!!reportFrame}`);

    let frameText = "";
    let frameHtml = "";
    if (reportFrame) {
      frameText = await reportFrame.evaluate(() => document.body?.innerText ?? "").catch((e) => `ERRO: ${e}`);
      frameHtml = await reportFrame.evaluate(() => document.body?.outerHTML ?? "").catch((e) => `ERRO: ${e}`);
    }

    const allFrameUrls = page.frames().map((f) => f.url());
    const screenshot = await page.screenshot({ fullPage: true });

    step(`Screenshot capturado (${screenshot.length} bytes).`);

    return NextResponse.json({
      ok: true,
      log,
      currentUrl: page.url(),
      allFrameUrls,
      reportFrameFound: !!reportFrame,
      frameTextPreview: frameText.slice(0, 4000),
      frameHtmlLength: frameHtml.length,
      frameHtmlPreview: frameHtml.slice(0, 8000),
      screenshotBase64: screenshot.toString("base64"),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    step(`ERRO: ${message}`);
    return NextResponse.json({ ok: false, error: message, log }, { status: 500 });
  } finally {
    await browser?.close().catch(() => {});
  }
}
