// Script standalone para testar localmente o mesmo fluxo de scraping do
// endpoint app/api/cron/sync-elleven/route.ts, sem precisar de servidor web.
// Reaproveita a lógica já validada em produção (login, seleção do campo
// "Filtrar por", preenchimento de datas Flatpickr, navegação do wizard).
import { chromium, type Frame } from "playwright";

const ELLEVEN_BASE = "https://elleven.assinelm.com.br";
const REPORT_PATH = "/ui/legacy/reports/316e54f3-bdaa-b95a-5597-e9164279071e";
const login = process.env.ELLEVEN_LOGIN;
const password = process.env.ELLEVEN_PASSWORD;
const DOWNLOAD_TIMEOUT = Number(process.env.DOWNLOAD_TIMEOUT) || 300000;

if (!login || !password) {
  console.error("ELLEVEN_LOGIN/ELLEVEN_PASSWORD não configurados nas env vars.");
  process.exit(1);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout-${label}-${ms}ms`)), ms),
    ),
  ]);
}
const EVAL_TIMEOUT_MS = 8000;

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

async function selectMuiOption(frame: Frame, elementId: string, matchRegex: RegExp) {
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
      Array.from(document.querySelectorAll('li[role="option"], ul[role="listbox"] li')).map(
        (el) => (el.textContent || "").trim(),
      ),
    ),
    EVAL_TIMEOUT_MS,
    "selectMuiOption-options",
  ).catch(() => [] as string[]);
  result.options = options as string[];
  if (result.options.length > 0) {
    const idx = result.options.findIndex((o) => matchRegex.test(o));
    const target = idx >= 0 ? idx : 0;
    try {
      await frame.locator('li[role="option"]').nth(target).click({ timeout: 5000 });
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

async function setFlatpickrDate(
  frame: Frame,
  selector: string,
  isoDate: string,
): Promise<{ ok: boolean; valueAfter: string; debug: string }> {
  return withTimeout(
    frame.evaluate(
      ({ selector, isoDate }) => {
        const el = document.querySelector(selector) as HTMLInputElement | null;
        if (!el) return { ok: false, valueAfter: "", debug: "elemento-nao-encontrado" };
        const anyEl = el as unknown as Record<string, unknown>;
        const fp = anyEl._flatpickr as
          | { setDate: (d: string, triggerChange: boolean) => void }
          | undefined;
        if (fp) {
          fp.setDate(isoDate, true);
          return { ok: true, valueAfter: el.value || "", debug: "usou-_flatpickr" };
        }
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
          return { ok: true, valueAfter: el.value || "", debug: "usou-registro-global" };
        }
        const fiberKey = Object.keys(anyEl).find(
          (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"),
        );
        if (fiberKey) {
          type FiberNode = { stateNode?: unknown; return?: FiberNode | null };
          let fiber = anyEl[fiberKey] as FiberNode | undefined;
          for (let depth = 0; fiber && depth < 25; depth++, fiber = fiber.return ?? undefined) {
            const sn = fiber.stateNode as Record<string, unknown> | null | undefined;
            const fpInst =
              sn &&
              (sn.flatpickr as { setDate: (d: string, triggerChange: boolean) => void } | undefined);
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
        const underscoreKeys = Object.keys(anyEl).filter((k) => k.startsWith("_"));
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
  ).catch((e: unknown) => ({ ok: false, valueAfter: "", debug: `erro-evaluate: ${e}` }));
}

async function clickFlatpickrToday(
  frame: Frame,
  selector: string,
): Promise<{ ok: boolean; valueAfter: string; debug: string }> {
  try {
    const locator = frame.locator(selector);
    await locator.click({ timeout: 3000 });
    const todayCell = frame.locator(".flatpickr-calendar.open .flatpickr-day.today").first();
    await todayCell.waitFor({ state: "visible", timeout: 3000 });
    await todayCell.click({ timeout: 3000 });
    await frame.page().waitForTimeout(300);
    const valueAfter = await locator.inputValue().catch(() => "");
    return { ok: valueAfter.length > 0, valueAfter, debug: "clicou-dia-today-no-calendario" };
  } catch (e) {
    return { ok: false, valueAfter: "", debug: `erro-click-calendario: ${e}` };
  }
}

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
  return withTimeout(
    frame.evaluate(new Function(DESCRIBE_INTERACTIVE_ELEMENTS_SRC) as () => unknown),
    EVAL_TIMEOUT_MS,
    "describeInteractiveElements",
  ).catch((e: unknown) => `ERRO: ${e}`);
}

async function fillDateLikeInputs(frame: Frame) {
  const results: Array<{
    selector: string;
    ok: boolean;
    label: string;
    valueAfter: string;
    debug?: string;
  }> = [];
  const { br, iso } = todayFormats();
  const candidates = (await describeInteractiveElements(frame)) as Array<Record<string, unknown>>;
  if (!Array.isArray(candidates)) return results;
  for (const el of candidates) {
    if (el.tag !== "input") continue;
    const name = String(el.name || "");
    if (name === "FilterDate") continue;
    const label = String(el.label || "");
    const placeholder = String(el.placeholder || "");
    const id = String(el.id || "");
    const className = String(el.className || "");
    const haystack = `${label} ${placeholder} ${name}`.toLowerCase();
    const looksLikeDate = /data|date|inicial|final|início|inicio|fim/.test(haystack);
    if (!looksLikeDate) continue;
    const selector = name ? `[name="${name}"]` : id ? `[id="${id}"]` : "";
    if (!selector) continue;

    if (className.includes("flatpickr")) {
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
    const valueAfter = await frame.locator(selector).inputValue().catch(() => "");
    results.push({ selector, ok, label: label || placeholder || name, valueAfter });
  }
  return results;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  try {
    console.log("1. Navegando para login...");
    await page.goto(`${ELLEVEN_BASE}/ui/login`, { waitUntil: "load", timeout: 30000 });

    console.log("2. Aguardando campo CPF...");
    await page.waitForSelector('input[placeholder="Entre com seu CPF"]', { timeout: 30000 });
    await page.fill('input[placeholder="Entre com seu CPF"]', login as string);
    await page.fill('input[placeholder="Entre com sua senha"]', password as string);
    await page.click('button:has-text("Entrar")');
    await page.waitForTimeout(6000);
    console.log("   URL após login:", page.url());

    if (page.url().includes("/login")) {
      console.log("   ERRO: login não avançou (credenciais incorretas ou CAPTCHA/MFA).");
      return;
    }

    console.log("2b. Navegando até o relatório...");
    await page.goto(`${ELLEVEN_BASE}${REPORT_PATH}`, { waitUntil: "load", timeout: 30000 });

    console.log("3. Localizando iframe do relatório (reports_exec)...");
    let reportFrame = page.frames().find((f) => f.url().includes("reports_exec")) ?? null;
    for (let i = 0; i < 20 && !reportFrame; i++) {
      await page.waitForTimeout(2000);
      reportFrame = page.frames().find((f) => f.url().includes("reports_exec")) ?? null;
    }
    if (!reportFrame) {
      console.log("   ERRO: iframe reports_exec não encontrado");
      await page.screenshot({ path: "scripts/debug-no-frame.png" });
      return;
    }

    for (let i = 0; i < 10; i++) {
      const hasText = await reportFrame
        .evaluate(() => (document.body?.innerText ?? "").trim().length > 0)
        .catch(() => false);
      if (hasText) break;
      await page.waitForTimeout(1500);
    }

    console.log("4. Selecionando campo de data em 'Filtrar por'...");
    const filterDateSelection = await selectMuiOption(reportFrame, "mui-component-select-FilterDate", /ativa/i);
    console.log("   ", JSON.stringify(filterDateSelection));
    await page.waitForTimeout(1000);

    console.log("5. Preenchendo campos de data (hoje)...");
    const dateFillResults = await fillDateLikeInputs(reportFrame);
    console.log("   ", JSON.stringify(dateFillResults));

    console.log("6. Avançando da etapa Filtros...");
    const advanced1 = await clickByText(reportFrame, "AVANÇAR");
    console.log("   Clique em AVANÇAR:", advanced1);
    await page.waitForTimeout(4000);

    reportFrame = page.frames().find((f) => f.url().includes("reports_exec")) ?? reportFrame;

    let stageText = await reportFrame.evaluate(() => document.body?.innerText ?? "").catch(() => "");
    console.log("7. Texto após etapa 1:", stageText.slice(0, 300));

    if (/Ativação Contratos - Par/i.test(stageText)) {
      console.log("   Etapa Parâmetros detectada, avançando...");
      const advancedParams =
        (await clickByText(reportFrame, "AVANÇAR")) ||
        (await clickByText(reportFrame, "EXECUTAR")) ||
        (await clickByText(reportFrame, "GERAR"));
      console.log("   Clique em AVANÇAR/EXECUTAR/GERAR:", advancedParams);
      await page.waitForTimeout(3000);
      reportFrame = page.frames().find((f) => f.url().includes("reports_exec")) ?? reportFrame;
      stageText = await reportFrame.evaluate(() => document.body?.innerText ?? "").catch(() => "");
      console.log("   Texto após Parâmetros:", stageText.slice(0, 300));
    }

    if (/Ativação Contratos - Ger/i.test(stageText) || /Escolha o modo de exporta/i.test(stageText)) {
      console.log("8. Etapa Geração — clicando no botão CSV (índice 1) e capturando o download...");
      const buttonLocators = reportFrame.locator("button.MuiButton-outlined");
      const count = await buttonLocators.count().catch(() => 0);
      console.log(`   Botões encontrados: ${count}`);

      if (count >= 2) {
        page.on("request", (req) => {
          if (/csv|export|report|download|arquivo/i.test(req.url())) {
            console.log(`   >> REQ ${req.method()} ${req.url()}`);
          }
        });
        page.on("response", (res) => {
          if (/csv|export|report|download|arquivo/i.test(res.url())) {
            console.log(`   << RES ${res.status()} ${res.url()}`);
          }
        });
        page.on("requestfailed", (req) => {
          console.log(`   XX FAILED ${req.url()} :: ${req.failure()?.errorText}`);
        });
        page.context().on("page", (newPage) => {
          console.log(`   ++ NOVA ABA/POPUP: ${newPage.url()}`);
        });

        console.log(`   Aguardando download com timeout de ${DOWNLOAD_TIMEOUT}ms...`);
        let download;
        try {
          [download] = await Promise.all([
            page.waitForEvent("download", { timeout: DOWNLOAD_TIMEOUT }),
            buttonLocators.nth(1).click(),
          ]);
        } catch (e) {
          console.log("   Timeout esperando download:", e);
          const postClickText = await reportFrame.evaluate(() => document.body?.innerText ?? "").catch(() => "");
          console.log("   Texto da página após clique:", postClickText.slice(0, 800));
          await page.screenshot({ path: "scripts/debug-csv-no-download.png", fullPage: true });
          console.log("   Screenshot salvo em scripts/debug-csv-no-download.png");
          return;
        }
        const csvPath = "scripts/ativacao-contratos.csv";
        await download.saveAs(csvPath);
        console.log(`   Download salvo em ${csvPath}`);

        const fs = await import("fs");
        const raw = fs.readFileSync(csvPath);
        let text = raw.toString("utf-8");
        if (text.includes("�")) {
          text = raw.toString("latin1");
        }

        const lines = text.split("\n").filter((l) => l.trim());
        const headers = lines[0]?.split(";").map((h) => h.trim().replace(/"/g, "")) ?? [];
        const rows = lines.slice(1, 4).map((line) => {
          const cells = line.split(";").map((c) => c.trim().replace(/"/g, ""));
          return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]));
        });

        console.log("9. Headers:", headers);
        console.log("   Sample rows:", JSON.stringify(rows, null, 2));
      } else {
        console.log("   Menos de 2 botões encontrados — não é possível clicar no botão CSV (índice 1).");
      }
    } else {
      console.log("8. Etapa Geração não detectada. Texto atual:", stageText.slice(0, 500));
    }

    await page.screenshot({ path: "scripts/debug-final.png", fullPage: true });
    console.log("Screenshot final salvo em scripts/debug-final.png");
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
