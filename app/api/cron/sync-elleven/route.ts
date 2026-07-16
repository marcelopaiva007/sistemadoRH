// Sincronização diária com o elleven (Voalle/EVO) — FASE DIAGNÓSTICO.
//
// Este endpoint ainda não grava nada no banco. Ele faz login no elleven,
// navega até o relatório "Ativação Contratos", percorre o assistente
// (Filtros -> Parâmetros -> Geração), clica no botão de modo de exportação
// que supostamente é "visualização em tela" e devolve as linhas extraídas da
// tabela de resultado no JSON — junto com um dump estruturado dos elementos
// interativos e screenshots de cada etapa. Objetivo desta fase: ver as
// colunas reais do relatório antes de desenhar o schema de persistência.
//
// ATENÇÃO: o índice do botão de modo (0=PDF, 1=Excel, 2=Tela) é um PALPITE
// NÃO CONFIRMADO VISUALMENTE — ver comentário em runWizard() na etapa
// "Geração". Confira buttonScreenshots e rows numa primeira execução antes
// de confiar nesse índice.
//
// Variáveis de ambiente necessárias:
//   ELLEVEN_LOGIN, ELLEVEN_PASSWORD — credenciais do elleven (CPF + senha)
//   SYNC_ELLEVEN_SECRET — protege o endpoint (?secret=... ou header x-sync-secret)
import { NextRequest, NextResponse } from "next/server";
import chromium from "@sparticuz/chromium";
import {
  chromium as playwrightChromium,
  type Browser,
  type Frame,
  type Page,
  type Locator,
} from "playwright-core";

export const runtime = "nodejs";
export const maxDuration = 300;

// Vários frame.evaluate() abaixo não tinham timeout algum — se a página travasse
// no meio de um evaluate, ficava pendurado até o watchdog/maxDuration (mesma causa
// já corrigida para Locator.screenshot() no passo de Geração). withTimeout()
// generaliza essa proteção para qualquer Promise do Playwright.
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout-${label}-${ms}ms`)), ms),
    ),
  ]);
}
const EVAL_TIMEOUT_MS = 8000;

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
  if (cronSecret && req.headers.get("authorization") === `Bearer ${cronSecret}`)
    return true;

  // Para disparo manual/diagnóstico: ?secret=... ou header x-sync-secret.
  const manualSecret = process.env.SYNC_ELLEVEN_SECRET;
  const provided =
    req.nextUrl.searchParams.get("secret") || req.headers.get("x-sync-secret");
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
    const svgTestId = el.querySelector('[data-testid]') ? el.querySelector('[data-testid]').getAttribute('data-testid') : '';
    const svgTitle = el.querySelector('title') ? el.querySelector('title').textContent : '';
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
      titleAttr: el.getAttribute('title') || '',
      iconTestId: svgTestId || '',
      svgTitle: svgTitle || '',
      visible: rect.width > 0 && rect.height > 0,
    };
  }
  const sel = 'input, select, textarea, button, [role="button"], [role="combobox"], [role="checkbox"], [role="textbox"], .dx-texteditor-input, .dx-selectbox, .dx-checkbox, .dx-button';
  return Array.from(document.querySelectorAll(sel)).map(describe).filter(function (d) { return d.visible; });
`;

async function describeInteractiveElements(frame: Frame) {
  return withTimeout(
    frame.evaluate(new Function(DESCRIBE_INTERACTIVE_ELEMENTS_SRC) as () => unknown),
    EVAL_TIMEOUT_MS,
    "describeInteractiveElements",
  ).catch((e: unknown) => `ERRO: ${e}`);
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
  return withTimeout(
    frame.evaluate(new Function(EXTRACT_TABLE_ROWS_SRC) as () => unknown),
    EVAL_TIMEOUT_MS,
    "extractTableRows",
  ).catch((e: unknown) => `ERRO: ${e}`);
}

// Clica no botão de modo `targetIdx` (dentre `buttonLocators`) e tenta
// distinguir, sem navegar de volta, se o modo ativado foi um arquivo
// (PDF/Excel) ou a visualização em tela:
//   1. Clica e aguarda 3s.
//   2. Se o texto da página indicar geração de PDF/Excel, retorna erro sem
//      tentar desfazer nada — clicar em "VOLTAR" depois de um modo de
//      exportação em arquivo já se mostrou quebrar a navegação (volta para a
//      etapa Filtros, não para a tela de escolha de modo), então o mais
//      seguro é só reportar o erro e deixar o cron terminar.
//   3. Se nenhuma tabela/grid aparecer em tela, também reporta erro.
//   4. Caso contrário, extrai as linhas da tabela e retorna.
async function attemptModeClick(
  frame: Frame,
  page: Page,
  buttonLocators: Locator,
  targetIdx: number,
): Promise<{
  ok: boolean;
  error?: string;
  pageTextPreview?: string;
  rows?: unknown[];
  rowCount?: number;
}> {
  try {
    await buttonLocators.nth(targetIdx).click({ timeout: 5000 });
  } catch (e) {
    return { ok: false, error: `Falha ao clicar no botão (índice ${targetIdx}): ${e}` };
  }

  await page.waitForTimeout(3000);
  const pageText = await withTimeout(
    frame.evaluate(() => document.body?.innerText ?? ""),
    EVAL_TIMEOUT_MS,
    "attemptModeClick-pageText",
  ).catch((e: unknown) => `ERRO: ${e}`);
  const pageTextStr = typeof pageText === "string" ? pageText : String(pageText);

  if (
    /gerando relat[oó]rio em pdf/i.test(pageTextStr) ||
    /gerando relat[oó]rio em excel/i.test(pageTextStr)
  ) {
    return {
      ok: false,
      error: `Botão ${targetIdx} ativou geração de arquivo (PDF/Excel), não visualização em tela.`,
      pageTextPreview: pageTextStr.slice(0, 500),
    };
  }

  const tableCount = await frame
    .locator("table, .dx-datagrid")
    .count()
    .catch(() => 0);
  if (tableCount === 0) {
    return {
      ok: false,
      error: `Botão ${targetIdx} clicado mas nenhuma tabela apareceu após 3s.`,
      pageTextPreview: pageTextStr.slice(0, 500),
    };
  }

  const extracted = await extractTableRows(frame);
  const rows =
    extracted &&
    typeof extracted === "object" &&
    Array.isArray((extracted as { rows?: unknown }).rows)
      ? (extracted as { rows: unknown[] }).rows
      : [];

  return {
    ok: true,
    rows,
    rowCount: rows.length,
    pageTextPreview: pageTextStr.slice(0, 500),
  };
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

// Abre um MUI Select pelo id (ids costumam começar com dígito/UUID, por isso
// usamos o seletor de atributo [id="..."] em vez de "#id") e escolhe a opção
// cujo texto bate com `matchRegex`, ou a primeira disponível como fallback.
async function selectMuiOption(
  frame: Frame,
  elementId: string,
  matchRegex: RegExp,
) {
  const result: { opened: boolean; options: string[]; selected?: string } = {
    opened: false,
    options: [],
  };
  try {
    await frame.locator(`[id="${elementId}"]`).click({ timeout: 5000 });
    result.opened = true;
  } catch {
    return result;
  }
  await frame.page().waitForTimeout(600);
  const options = await withTimeout(
    frame.evaluate(() =>
      Array.from(
        document.querySelectorAll('li[role="option"], ul[role="listbox"] li'),
      ).map((el) => (el.textContent || "").trim()),
    ),
    EVAL_TIMEOUT_MS,
    "selectMuiOption-options",
  ).catch(() => [] as string[]);
  result.options = options as string[];
  if (result.options.length > 0) {
    const idx = result.options.findIndex((o) => matchRegex.test(o));
    const target = idx >= 0 ? idx : 0;
    try {
      await frame
        .locator('li[role="option"]')
        .nth(target)
        .click({ timeout: 5000 });
      result.selected = result.options[target];
    } catch {
      /* ignore */
    }
  }
  return result;
}

function todayFormats() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = String(now.getFullYear());
  return { br: `${dd}/${mm}/${yyyy}`, iso: `${yyyy}-${mm}-${dd}` };
}

// Define a data num input controlado pela biblioteca Flatpickr usando a API JS dela
// (window/elemento expõe `_flatpickr`), em vez de digitar — o input costuma ser
// somente leitura ou interceptar o teclado para navegação do calendário, então
// `.fill()`/digitação simulada não funciona de forma confiável.
async function setFlatpickrDate(
  frame: Frame,
  selector: string,
  isoDate: string,
): Promise<{ ok: boolean; valueAfter: string; debug: string }> {
  return withTimeout(
    frame.evaluate(
      ({ selector, isoDate }) => {
        const el = document.querySelector(selector) as HTMLInputElement | null;
        if (!el)
          return {
            ok: false,
            valueAfter: "",
            debug: "elemento-nao-encontrado",
          };
        const anyEl = el as unknown as Record<string, unknown>;
        const fp = anyEl._flatpickr as
          { setDate: (d: string, triggerChange: boolean) => void } | undefined;
        if (fp) {
          fp.setDate(isoDate, true);
          return {
            ok: true,
            valueAfter: el.value || "",
            debug: "usou-_flatpickr",
          };
        }
        // fallback: algumas versões só registram a instância no array global window.flatpickr.instances
        const globalFp = (
          window as unknown as {
            flatpickr?: {
              instances?: Array<{
                _input?: HTMLElement;
                setDate: (d: string, triggerChange: boolean) => void;
              }>;
            };
          }
        ).flatpickr;
        const inst = globalFp?.instances?.find((i) => i._input === el);
        if (inst) {
          inst.setDate(isoDate, true);
          return {
            ok: true,
            valueAfter: el.value || "",
            debug: "usou-registro-global",
          };
        }
        // fallback: react-flatpickr guarda a instância em `this.flatpickr` no componente
        // React (não no DOM) — sobe a árvore de fiber a partir do nó procurando isso.
        const fiberKey = Object.keys(anyEl).find(
          (k) =>
            k.startsWith("__reactFiber$") ||
            k.startsWith("__reactInternalInstance$"),
        );
        if (fiberKey) {
          type FiberNode = { stateNode?: unknown; return?: FiberNode | null };
          let fiber = anyEl[fiberKey] as FiberNode | undefined;
          for (
            let depth = 0;
            fiber && depth < 25;
            depth++, fiber = fiber.return ?? undefined
          ) {
            const sn = fiber.stateNode as
              Record<string, unknown> | null | undefined;
            const fpInst =
              sn &&
              (sn.flatpickr as
                | { setDate: (d: string, triggerChange: boolean) => void }
                | undefined);
            if (fpInst && typeof fpInst.setDate === "function") {
              fpInst.setDate(isoDate, true);
              return {
                ok: true,
                valueAfter: el.value || "",
                debug: `usou-react-fiber-flatpickr (depth=${depth})`,
              };
            }
          }
        }
        const underscoreKeys = Object.keys(anyEl).filter((k) =>
          k.startsWith("_"),
        );
        return {
          ok: false,
          valueAfter: el.value || "",
          debug: `sem-instancia-flatpickr; chaves-underscore=${underscoreKeys.join(",")}`,
        };
      },
      { selector, isoDate },
    ),
    EVAL_TIMEOUT_MS,
    "setFlatpickrDate",
  ).catch((e: unknown) => ({
    ok: false,
    valueAfter: "",
    debug: `erro-evaluate: ${e}`,
  }));
}

// Abre o calendário do Flatpickr clicando no input (comportamento padrão da lib:
// `clickOpens`) e clica na célula do dia de hoje — simula a interação real do
// usuário, que é o único caminho confiável até agora para o estado do formulário
// (fora do DOM) reconhecer a mudança de valor.
async function clickFlatpickrToday(
  frame: Frame,
  selector: string,
): Promise<{ ok: boolean; valueAfter: string; debug: string }> {
  try {
    const locator = frame.locator(selector);
    await locator.click({ timeout: 3000 });
    const todayCell = frame
      .locator(".flatpickr-calendar.open .flatpickr-day.today")
      .first();
    await todayCell.waitFor({ state: "visible", timeout: 3000 });
    await todayCell.click({ timeout: 3000 });
    await frame.page().waitForTimeout(300);
    const valueAfter = await locator.inputValue().catch(() => "");
    return {
      ok: valueAfter.length > 0,
      valueAfter,
      debug: "clicou-dia-today-no-calendario",
    };
  } catch (e) {
    return { ok: false, valueAfter: "", debug: `erro-click-calendario: ${e}` };
  }
}

// Tenta preencher, de forma best-effort, qualquer input cujo rótulo/placeholder/name
// sugira ser um campo de data (ex.: "Data Inicial", "Data Final") com a data de hoje.
async function fillDateLikeInputs(
  frame: Frame,
): Promise<
  Array<{
    selector: string;
    ok: boolean;
    label: string;
    valueAfter: string;
    debug?: string;
  }>
> {
  const results: Array<{
    selector: string;
    ok: boolean;
    label: string;
    valueAfter: string;
    debug?: string;
  }> = [];
  const { br, iso } = todayFormats();
  const candidates = (await describeInteractiveElements(frame)) as Array<
    Record<string, unknown>
  >;
  if (!Array.isArray(candidates)) return results;
  for (const el of candidates) {
    if (el.tag !== "input") continue;
    const name = String(el.name || "");
    if (name === "FilterDate") continue; // já tratado por selectMuiOption, não é um campo de data digitável
    const label = String(el.label || "");
    const placeholder = String(el.placeholder || "");
    const id = String(el.id || "");
    const className = String(el.className || "");
    const haystack = `${label} ${placeholder} ${name}`.toLowerCase();
    const looksLikeDate = /data|date|inicial|final|início|inicio|fim/.test(
      haystack,
    );
    if (!looksLikeDate) continue;
    const selector = name ? `[name="${name}"]` : id ? `[id="${id}"]` : "";
    if (!selector) continue;

    if (className.includes("flatpickr")) {
      // 1ª tentativa: interação real (clicar no input abre o calendário, clicar no
      // dia de hoje) — é o único caminho que dispara corretamente o estado do
      // formulário. 2ª tentativa (fallback): API JS via fiber do React.
      let attempt = await clickFlatpickrToday(frame, selector);
      if (!attempt.ok) {
        let apiAttempt = await setFlatpickrDate(frame, selector, iso);
        for (let i = 0; i < 5 && !apiAttempt.ok; i++) {
          await frame.page().waitForTimeout(400);
          apiAttempt = await setFlatpickrDate(frame, selector, iso);
        }
        attempt = apiAttempt;
      }
      results.push({
        selector,
        ok: attempt.ok,
        label: label || placeholder || name,
        valueAfter: attempt.valueAfter,
        debug: attempt.debug,
      });
      continue;
    }

    let ok = false;
    const digitsOnly = br.replace(/\D/g, "");
    try {
      const locator = frame.locator(selector);
      await locator.click({ timeout: 3000, clickCount: 3 });
      await locator.press("Delete").catch(() => {});
      await locator.pressSequentially(digitsOnly, { delay: 80, timeout: 5000 });
      await locator.press("Escape").catch(() => {});
      ok = true;
    } catch {
      /* ignore */
    }
    const valueAfter = await frame
      .locator(selector)
      .inputValue()
      .catch(() => "");
    results.push({
      selector,
      ok,
      label: label || placeholder || name,
      valueAfter,
    });
  }
  return results;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();

  const login = process.env.ELLEVEN_LOGIN;
  const password = process.env.ELLEVEN_PASSWORD;
  if (!login || !password) {
    return NextResponse.json(
      {
        error: "ELLEVEN_LOGIN/ELLEVEN_PASSWORD não configurados nas env vars.",
      },
      { status: 500 },
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

  // Já tivemos execuções que travaram por mais de 300s sem retornar erro (o
  // maxDuration do Vercel mata a function, mas a conexão HTTP não fecha de
  // forma limpa e o fetch do cliente fica pendurado esperando para sempre).
  // Esse watchdog garante que SEMPRE devolvemos alguma resposta — com o log
  // e os wizardSteps coletados até então — bem antes desse limite.
  const WATCHDOG_MS = 260000;
  const watchdog = new Promise<NextResponse>((resolve) => {
    setTimeout(() => {
      step(
        `WATCHDOG: excedeu ${WATCHDOG_MS}ms — retornando estado parcial antes do timeout do servidor.`,
      );
      resolve(
        NextResponse.json(
          { ok: false, error: "watchdog-timeout", log, wizardSteps },
          { status: 200 },
        ),
      );
    }, WATCHDOG_MS);
  });

  const runWizard = async (): Promise<NextResponse> => {
    try {
      step("Iniciando Chromium serverless...");
      browser = await playwrightChromium.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: true,
      });
      const page = await browser.newPage({
        viewport: { width: 1600, height: 1000 },
      });

      step("Abrindo tela de login do elleven...");
      await page.goto(`${ELLEVEN_BASE}/ui/login`, {
        waitUntil: "load",
        timeout: 30000,
      });

      const CPF_SELECTOR = 'input[placeholder="Entre com seu CPF"]';
      let cpfVisible = await page
        .waitForSelector(CPF_SELECTOR, { timeout: 30000 })
        .then(() => true)
        .catch(() => false);

      // A hidratação do React às vezes não conclui a tempo em Chromium serverless
      // com CPU limitada — um reload costuma resolver antes de desistirmos.
      if (!cpfVisible) {
        step("Campo de CPF não apareceu em 30s — recarregando e tentando de novo...");
        await page
          .reload({ waitUntil: "load", timeout: 30000 })
          .catch(() => {});
        cpfVisible = await page
          .waitForSelector(CPF_SELECTOR, { timeout: 30000 })
          .then(() => true)
          .catch(() => false);
      }

      if (!cpfVisible) {
        const failScreenshot = await page
          .screenshot({ timeout: 10000 })
          .catch(() => null);
        wizardSteps.push({
          name: "login-cpf-nao-encontrado",
          url: page.url(),
          title: await page.title().catch(() => "?"),
          bodyPreview: await withTimeout(
            page.evaluate(() => document.body?.innerText ?? ""),
            EVAL_TIMEOUT_MS,
            "login-fail-bodyPreview",
          )
            .then((t) => (t as string).slice(0, 1000))
            .catch(() => ""),
          screenshotBase64: failScreenshot
            ? failScreenshot.toString("base64")
            : null,
        });
        throw new Error(
          `Campo de CPF não apareceu mesmo após reload (URL atual: ${page.url()}).`,
        );
      }

      await page.fill(CPF_SELECTOR, login);
      await page.fill('input[placeholder="Entre com sua senha"]', password);
      await page.click('button:has-text("Entrar")');
      await page.waitForTimeout(6000);
      step(`Login concluído. URL atual: ${page.url()}`);

      if (page.url().includes("/login")) {
        throw new Error(
          "Login não avançou — continua na tela de login (credenciais incorretas ou CAPTCHA/MFA apareceu).",
        );
      }

      step("Navegando até o relatório Ativação Contratos...");
      await page.goto(`${ELLEVEN_BASE}${REPORT_PATH}`, {
        waitUntil: "load",
        timeout: 30000,
      });

      let reportFrame = page
        .frames()
        .find((f: Frame) => f.url().includes("reports_exec"));
      for (let i = 0; i < 20 && !reportFrame; i++) {
        await page.waitForTimeout(2000);
        reportFrame = page
          .frames()
          .find((f: Frame) => f.url().includes("reports_exec"));
      }
      step(`Frame do relatório (reports_exec) encontrado: ${!!reportFrame}`);

      if (reportFrame) {
        for (let i = 0; i < 10; i++) {
          const hasText = await withTimeout(
            reportFrame.evaluate(
              () => (document.body?.innerText ?? "").trim().length > 0,
            ),
            EVAL_TIMEOUT_MS,
            "hasText",
          ).catch(() => false);
          if (hasText) break;
          await page.waitForTimeout(1500);
        }
      }

      const allFrameUrls = page.frames().map((f: Frame) => f.url());
      let modeResult: Awaited<ReturnType<typeof attemptModeClick>> | null = null;

      if (reportFrame) {
        // Etapa 1: Filtros
        const step1Text = await withTimeout(
          reportFrame.evaluate(() => document.body?.innerText ?? ""),
          EVAL_TIMEOUT_MS,
          "step1Text",
        ).catch((e: unknown) => `ERRO: ${e}`);
        const step1Elements = await describeInteractiveElements(reportFrame);
        wizardSteps.push({
          name: "1-filtros",
          url: reportFrame.url(),
          textPreview: (step1Text as string).slice(0, 2000),
          elements: step1Elements,
        });

        // "Filtrar por *" (id mui-component-select-FilterDate) é obrigatório e define
        // qual campo de data será usado para filtrar (ex.: Data de Ativação).
        step("Selecionando campo de data em 'Filtrar por'...");
        const filterDateSelection = await selectMuiOption(
          reportFrame,
          "mui-component-select-FilterDate",
          /ativa/i,
        );
        step(
          `Filtrar por -> aberto: ${filterDateSelection.opened}, opções: ${JSON.stringify(filterDateSelection.options)}, selecionado: ${filterDateSelection.selected}`,
        );
        await page.waitForTimeout(1000);

        const step1AfterFilterDateElements =
          await describeInteractiveElements(reportFrame);
        wizardSteps.push({
          name: "1-filtros-apos-filterdate",
          url: reportFrame.url(),
          filterDateSelection,
          elements: step1AfterFilterDateElements,
        });

        step(
          "Tentando preencher campos de data (hoje) que tenham aparecido...",
        );
        const dateFillResults = await fillDateLikeInputs(reportFrame);
        step(`Preenchimento de datas: ${JSON.stringify(dateFillResults)}`);

        const step1AfterDateFillElements =
          await describeInteractiveElements(reportFrame);
        wizardSteps.push({
          name: "1-filtros-apos-preencher-datas",
          url: reportFrame.url(),
          dateFillResults,
          elements: step1AfterDateFillElements,
        });

        step("Tentando avançar da etapa Filtros...");
        const advanced1 = await clickByText(reportFrame, "AVANÇAR");
        step(`Clique em AVANÇAR (etapa 1): ${advanced1}`);
        await page.waitForTimeout(4000);

        // Playwright pode ter trocado a referência do frame após navegação interna do SPA.
        reportFrame =
          page.frames().find((f: Frame) => f.url().includes("reports_exec")) ??
          reportFrame;

        // Etapa 2: pode ser "Parâmetros" (se o relatório tiver parâmetros extras) ou
        // pular direto para "Geração" (quando não há parâmetros configuráveis).
        let stageText = await withTimeout(
          reportFrame.evaluate(() => document.body?.innerText ?? ""),
          EVAL_TIMEOUT_MS,
          "stageText-1",
        ).catch((e: unknown) => `ERRO: ${e}`);
        let stageElements = await describeInteractiveElements(reportFrame);
        wizardSteps.push({
          name: "2-apos-avancar-filtros",
          url: reportFrame.url(),
          textPreview: (stageText as string).slice(0, 2000),
          elements: stageElements,
        });

        if (/Ativação Contratos - Par/i.test(stageText as string)) {
          step("Etapa Parâmetros detectada, tentando avançar...");
          const advancedParams =
            (await clickByText(reportFrame, "AVANÇAR")) ||
            (await clickByText(reportFrame, "EXECUTAR")) ||
            (await clickByText(reportFrame, "GERAR"));
          step(
            `Clique em AVANÇAR/EXECUTAR/GERAR (Parâmetros): ${advancedParams}`,
          );
          await page.waitForTimeout(3000);

          reportFrame =
            page
              .frames()
              .find((f: Frame) => f.url().includes("reports_exec")) ??
            reportFrame;
          stageText = await withTimeout(
            reportFrame.evaluate(() => document.body?.innerText ?? ""),
            EVAL_TIMEOUT_MS,
            "stageText-2",
          ).catch((e: unknown) => `ERRO: ${e}`);
          stageElements = await describeInteractiveElements(reportFrame);
          wizardSteps.push({
            name: "3-apos-avancar-parametros",
            url: reportFrame.url(),
            textPreview: (stageText as string).slice(0, 2000),
            elements: stageElements,
          });
        }

        // Etapa "Geração": escolher o modo de exportação (botões só com ícone, sem
        // texto). Descoberto que clicar em "VOLTAR" depois de escolher um modo de
        // exportação em arquivo (PDF/Excel) volta direto para a etapa Filtros, não
        // para a tela de escolha de modo — então testar cada botão por tentativa e
        // erro quebra a navegação. Por isso sempre tiramos screenshot de cada botão
        // (sem clicar) antes de decidir — serve de evidência para confirmar/corrigir
        // o palpite abaixo caso o índice esteja errado — e, depois do clique,
        // detectamos pelo texto da página se um arquivo (PDF/Excel) foi ativado por
        // engano, para não precisar tentar voltar (abortamos e reportamos o erro).
        //
        // PALPITE NÃO CONFIRMADO VISUALMENTE: assume-se a ordem típica PDF / Excel /
        // Tela, então clicamos no último botão (índice 2 com 3 botões, índice 1 com
        // 2). Ninguém validou isso contra os screenshots acima ainda.
        if (
          /Ativação Contratos - Ger/i.test(stageText as string) ||
          /Escolha o modo de exporta/i.test(stageText as string)
        ) {
          step(
            "Etapa Geração detectada — capturando screenshots dos botões de modo antes de clicar...",
          );
          const buttonLocators = reportFrame.locator(
            "button.MuiButton-outlined",
          );
          const count = await buttonLocators.count().catch(() => 0);
          const buttonScreenshots: string[] = [];
          for (let i = 0; i < count; i++) {
            try {
              // Locator.screenshot() não tem timeout padrão (fica esperando o elemento
              // "estabilizar" indefinidamente) — isso já travou a função até o
              // maxDuration do servidor sem retornar erro. Timeout explícito evita isso.
              const buf = await buttonLocators
                .nth(i)
                .screenshot({ timeout: 5000 });
              buttonScreenshots.push(buf.toString("base64"));
            } catch {
              buttonScreenshots.push("");
            }
          }
          step(`Total de botões de modo capturados: ${count}`);
          stageElements = await describeInteractiveElements(reportFrame);
          wizardSteps.push({
            name: "3-modo-botoes-screenshots",
            url: reportFrame.url(),
            count,
            buttonScreenshots,
            elements: stageElements,
          });

          if (count > 0) {
            const targetIdx = count >= 3 ? 2 : count >= 2 ? 1 : 0;
            step(
              `Clicando no botão de modo (palpite não confirmado): índice=${targetIdx} de ${count} botões.`,
            );
            modeResult = await attemptModeClick(
              reportFrame,
              page,
              buttonLocators,
              targetIdx,
            );
            step(
              `Resultado do clique no modo: ok=${modeResult.ok}` +
                (modeResult.rowCount !== undefined
                  ? `, rowCount=${modeResult.rowCount}`
                  : "") +
                (modeResult.error ? `, error=${modeResult.error}` : ""),
            );
            wizardSteps.push({
              name: "3-modo-clique-resultado",
              url: reportFrame.url(),
              targetIdx,
              count,
              ...modeResult,
            });
          } else {
            step("Nenhum botão de modo encontrado — não há como clicar.");
          }
        }
      }

      const screenshot = await page.screenshot({
        fullPage: true,
        timeout: 15000,
      });
      step(`Screenshot capturado (${screenshot.length} bytes).`);

      return NextResponse.json({
        ok: modeResult?.ok ?? true,
        modeError: modeResult?.ok === false ? modeResult.error : undefined,
        rows: modeResult?.rows ?? [],
        rowCount: modeResult?.rowCount ?? 0,
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
      return NextResponse.json(
        { ok: false, error: message, log, wizardSteps },
        { status: 500 },
      );
    } finally {
      await browser?.close().catch(() => {});
    }
  };

  return Promise.race([runWizard(), watchdog]);
}
