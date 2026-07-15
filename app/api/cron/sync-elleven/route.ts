// Sincronização diária com o elleven (Voalle/EVO) — FASE DIAGNÓSTICO.
//
// Este endpoint ainda não grava nada no banco. Ele faz login no elleven,
// navega até o relatório "Ativação Contratos", percorre o assistente
// (Filtros -> Parâmetros -> Geração), executa o relatório e devolve os
// dados extraídos da tabela de resultado — junto com um dump estruturado
// dos elementos interativos de cada etapa, para permitirmos ajustar os
// seletores antes de escrever a lógica de importação definitiva.
//
// Variáveis de ambiente necessárias:
//   ELLEVEN_LOGIN, ELLEVEN_PASSWORD — credenciais do elleven (CPF + senha)
//   SYNC_ELLEVEN_SECRET — protege o endpoint (?secret=... ou header x-sync-secret)
import { NextRequest, NextResponse } from "next/server";
import chromium from "@sparticuz/chromium";
import { chromium as playwrightChromium, type Browser, type Frame } from "playwright-core";

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

// Descreve, de forma compacta, todos os elementos interativos visíveis do
// frame — usado para descobrir seletores reais sem precisar de um dump
// gigante de HTML (a UI é React/MUI + DevExtreme com classes geradas).
const DESCRIBE_INTERACTIVE_ELEMENTS_SRC = `
  function describe(el) {
    function closestLabelText(el) {
      const byFor = el.id ? document.querySelector('label[for="' + CSS.escape(el.id) + '"]') : null;
      if (byFor && byFor.innerText) return byFor.innerText.trim();
      const wrapLabel = el.closest('label');
      if (wrapLabel && wrapLabel.innerText) return wrapLabel.innerText.trim();
      const fieldWrap = el.closest('.MuiFormControl-root, .dx-field, .dx-fieldset-item, [class*="field" i]');
      if (fieldWrap) {
        const lbl = fieldWrap.querySelector('label, .dx-field-label, .MuiFormLabel-root, .MuiInputLabel-root');
        if (lbl && lbl.innerText) return lbl.innerText.trim();
      }
      return '';
    }
    const rect = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || '',
      id: el.id || '',
      name: el.getAttribute('name') || '',
      role: el.getAttribute('role') || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      placeholder: el.getAttribute('placeholder') || '',
      className: (el.className || '').toString().slice(0, 100),
      text: (el.innerText || el.textContent || '').trim().slice(0, 60),
      value: el.value !== undefined ? String(el.value).slice(0, 60) : '',
      label: closestLabelText(el),
      visible: rect.width > 0 && rect.height > 0,
    };
  }
  const sel = 'input, select, textarea, button, [role="button"], [role="combobox"], [role="checkbox"], [role="textbox"], .dx-texteditor-input, .dx-selectbox, .dx-checkbox, .dx-button';
  return Array.from(document.querySelectorAll(sel)).map(describe).filter(function (d) { return d.visible; });
`;

async function describeInteractiveElements(frame: Frame) {
  return frame.evaluate(new Function(DESCRIBE_INTERACTIVE_ELEMENTS_SRC) as () => unknown).catch((e: unknown) => `ERRO: ${e}`);
}

// Extrai linhas de uma tabela/grid de resultado, tentando alguns formatos
// comuns (tabela HTML nativa, ou DevExtreme dx-datagrid com role="row").
const EXTRACT_TABLE_ROWS_SRC = `
  function extractFromHtmlTable(table) {
    const headerCells = Array.from(table.querySelectorAll('thead th, thead td'));
    const headers = headerCells.map(function (c) { return c.innerText.trim(); });
    const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
    return bodyRows.map(function (tr) {
      const cells = Array.from(tr.querySelectorAll('td')).map(function (td) { return td.innerText.trim(); });
      if (headers.length === cells.length) {
        const obj = {};
        headers.forEach(function (h, i) { obj[h || ('col' + i)] = cells[i]; });
        return obj;
      }
      return { cells: cells };
    });
  }

  function extractFromDxGrid(grid) {
    const headerCells = Array.from(grid.querySelectorAll('.dx-datagrid-headers [role="columnheader"], .dx-datagrid-headers .dx-header-row td'));
    const headers = headerCells.map(function (c) { return c.innerText.trim(); });
    const rows = Array.from(grid.querySelectorAll('.dx-datagrid-rowsview [role="row"], .dx-datagrid-rowsview .dx-data-row'));
    return rows.map(function (row) {
      const cells = Array.from(row.querySelectorAll('[role="gridcell"], td')).map(function (td) { return td.innerText.trim(); });
      if (headers.length === cells.length) {
        const obj = {};
        headers.forEach(function (h, i) { obj[h || ('col' + i)] = cells[i]; });
        return obj;
      }
      return { cells: cells };
    });
  }

  const table = document.querySelector('table');
  if (table) return { source: 'html-table', rows: extractFromHtmlTable(table) };

  const dxGrid = document.querySelector('.dx-datagrid');
  if (dxGrid) return { source: 'dx-datagrid', rows: extractFromDxGrid(dxGrid) };

  return { source: 'none', rows: [] };
`;

async function extractTableRows(frame: Frame) {
  return frame.evaluate(new Function(EXTRACT_TABLE_ROWS_SRC) as () => unknown).catch((e: unknown) => `ERRO: ${e}`);
}

async function clickByText(frame: Frame, text: string): Promise<boolean> {
  try {
    const locator = frame.getByText(text, { exact: false }).first();
    await locator.waitFor({ state: "visible", timeout: 5000 });
    await locator.click();
    return true;
  } catch {
    return false;
  }
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

  const wizardSteps: Array<Record<string, unknown>> = [];

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

    let reportFrame = page.frames().find((f: Frame) => f.url().includes("reports_exec"));
    step(`Frame do relatório (reports_exec) encontrado: ${!!reportFrame}`);

    const allFrameUrls = page.frames().map((f: Frame) => f.url());

    if (reportFrame) {
      // Etapa 1: Filtros
      const step1Text = await reportFrame.evaluate(() => document.body?.innerText ?? "").catch((e: unknown) => `ERRO: ${e}`);
      const step1Elements = await describeInteractiveElements(reportFrame);
      wizardSteps.push({ name: "1-filtros", url: reportFrame.url(), textPreview: (step1Text as string).slice(0, 2000), elements: step1Elements });

      step("Tentando avançar da etapa Filtros...");
      const advanced1 = await clickByText(reportFrame, "AVANÇAR");
      step(`Clique em AVANÇAR (etapa 1): ${advanced1}`);
      await page.waitForTimeout(4000);

      // Playwright pode ter trocado a referência do frame após navegação interna do SPA.
      reportFrame = page.frames().find((f: Frame) => f.url().includes("reports_exec")) ?? reportFrame;

      // Etapa 2: Parâmetros
      const step2Text = await reportFrame.evaluate(() => document.body?.innerText ?? "").catch((e: unknown) => `ERRO: ${e}`);
      const step2Elements = await describeInteractiveElements(reportFrame);
      wizardSteps.push({ name: "2-parametros", url: reportFrame.url(), textPreview: (step2Text as string).slice(0, 2000), elements: step2Elements });

      step("Tentando avançar da etapa Parâmetros...");
      const advanced2 =
        (await clickByText(reportFrame, "AVANÇAR")) || (await clickByText(reportFrame, "EXECUTAR")) || (await clickByText(reportFrame, "GERAR"));
      step(`Clique em AVANÇAR/EXECUTAR/GERAR (etapa 2): ${advanced2}`);
      await page.waitForTimeout(4000);

      reportFrame = page.frames().find((f: Frame) => f.url().includes("reports_exec")) ?? reportFrame;

      // Etapa 3: Geração — tenta clicar em Executar e aguarda o resultado carregar.
      const preExecText = await reportFrame.evaluate(() => document.body?.innerText ?? "").catch((e: unknown) => `ERRO: ${e}`);
      const preExecElements = await describeInteractiveElements(reportFrame);
      wizardSteps.push({ name: "3-geracao-pre-exec", url: reportFrame.url(), textPreview: (preExecText as string).slice(0, 2000), elements: preExecElements });

      const executed =
        (await clickByText(reportFrame, "EXECUTAR")) || (await clickByText(reportFrame, "GERAR")) || (await clickByText(reportFrame, "AVANÇAR"));
      step(`Clique em EXECUTAR (etapa 3): ${executed}`);

      // Aguarda a tabela/grid de resultado aparecer (com timeout generoso, pois
      // a geração do relatório pode demorar).
      let resultReady = false;
      for (let i = 0; i < 15; i++) {
        await page.waitForTimeout(2000);
        reportFrame = page.frames().find((f: Frame) => f.url().includes("reports_exec")) ?? reportFrame;
        const hasResult = await reportFrame
          .evaluate(() => !!document.querySelector("table, .dx-datagrid"))
          .catch(() => false);
        if (hasResult) {
          resultReady = true;
          step(`Resultado detectado após ${(i + 1) * 2}s.`);
          break;
        }
      }
      step(`Resultado pronto: ${resultReady}`);

      const postExecText = await reportFrame.evaluate(() => document.body?.innerText ?? "").catch((e: unknown) => `ERRO: ${e}`);
      const postExecElements = await describeInteractiveElements(reportFrame);
      const extracted = await extractTableRows(reportFrame);
      wizardSteps.push({
        name: "3-geracao-pos-exec",
        url: reportFrame.url(),
        resultReady,
        textPreview: (postExecText as string).slice(0, 3000),
        elements: postExecElements,
        extracted,
      });
    }

    const screenshot = await page.screenshot({ fullPage: true });
    step(`Screenshot capturado (${screenshot.length} bytes).`);

    return NextResponse.json({
      ok: true,
      log,
      currentUrl: page.url(),
      allFrameUrls,
      reportFrameFound: !!reportFrame,
      wizardSteps,
      screenshotBase64: screenshot.toString("base64"),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    step(`ERRO: ${message}`);
    return NextResponse.json({ ok: false, error: message, log, wizardSteps }, { status: 500 });
  } finally {
    await browser?.close().catch(() => {});
  }
}
