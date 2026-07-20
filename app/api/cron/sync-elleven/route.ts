// Sincronização diária com o elleven (Voalle/EVO).
//
// Faz login no elleven, navega até o relatório "Ativação Contratos", percorre
// o assistente (Filtros -> Parâmetros -> Geração), baixa o CSV do relatório (o
// único modo de exportação com dados tabulares — não há visualização em tela)
// e faz upsert de cada linha em ContratoAtivacaoElleven (chave: número do
// Contrato) no banco via Prisma. Devolve também os headers, uma amostra das
// linhas, contadores de salvamento e um dump estruturado dos elementos
// interativos/screenshots de cada etapa, para diagnóstico.
//
// CONFIRMADO (scripts/test-elleven-scraping.ts): a etapa "Geração" tem 3
// botões (button.MuiButton-outlined) — índice 0 = PDF, índice 1 = CSV,
// índice 2 = FECHAR (fecha o wizard, não é modo de exportação). Não existe
// botão de "visualização em tela" para este relatório.
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
import { prisma } from "@/lib/prisma";
import { periodoAtual } from "@/lib/periodo";
import { importarLancamentosEllevenAuto } from "@/lib/importar-elleven-auto";

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

// Relatórios de venda do elleven que sincronizamos. Cada um é uma tela/assistente
// legado (mesmo fluxo: Filtros -> [Parâmetros] -> Geração -> download CSV). IDs
// vieram do menu (general/me/menus). Só "ativacao-contratos" tem tabela modelada
// e save; os demais estão em fase de descoberta (baixam o CSV e retornam os
// cabeçalhos/amostra para modelarmos a tabela certa depois).
// persist  = tabela própria modelada (só ativacao-contratos, com preview e save
//            tipado + regras de bonificação).
// generico = guarda cada linha do CSV como JSONB em elleven_relatorio_linha
//            (para os demais relatórios de venda, sem modelar tabela por relatório).
const REPORTS: Record<
  string,
  { path: string; nome: string; persist?: boolean; generico?: boolean }
> = {
  "ativacao-contratos": {
    path: "/ui/legacy/reports/316e54f3-bdaa-b95a-5597-e9164279071e",
    nome: "Ativação Contratos",
    persist: true,
  },
  "vendedores-comercial": {
    path: "/ui/legacy/reports/fc792c4f-d4cf-572a-361b-3502c29ede8c",
    nome: "Vendedores - Comercial",
    generico: true,
  },
  "funil-de-vendas": {
    path: "/ui/legacy/reports/9f47af3b-785a-cd9f-c1b6-c0aec822e2e3",
    nome: "Funil de Vendas - Gerencial",
    generico: true,
  },
  "pedidos-de-venda": {
    path: "/ui/legacy/reports/e2e1a318-bdfb-ae98-1510-957558e4b02e",
    nome: "Listagem Pedidos de Venda",
    generico: true,
  },
  // Faturamento por Vendedor (modal JS legado, sem iframe de relatório) e
  // CRE - Títulos Recebidos (exige campo obrigatório extra) NÃO são usados para
  // comissão — removidos da sincronização a pedido do usuário.
};
const DEFAULT_REPORT = "ativacao-contratos";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Garante que a tabela genérica exista antes de gravar, criando-a sob demanda
// (idempotente, IF NOT EXISTS — mesmo padrão da migração do CPF). Assim o save
// dos relatórios genéricos funciona sem depender de aplicar a migração à mão.
let relatorioTableEnsured = false;
async function ensureRelatorioTable(): Promise<void> {
  if (relatorioTableEnsured) return;
  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "elleven_relatorio_linha" (
      "id" SERIAL NOT NULL,
      "relatorio" TEXT NOT NULL,
      "periodo" TEXT NOT NULL,
      "chave" TEXT NOT NULL,
      "dados" JSONB NOT NULL,
      "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "elleven_relatorio_linha_pkey" PRIMARY KEY ("id")
    );`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "elleven_relatorio_linha_relatorio_periodo_idx" ON "elleven_relatorio_linha"("relatorio", "periodo");`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "elleven_relatorio_linha_relatorio_periodo_chave_key" ON "elleven_relatorio_linha"("relatorio", "periodo", "chave");`,
  );
  relatorioTableEnsured = true;
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

// Clica no botão de export CSV e captura o download via page.waitForEvent.
// IMPORTANTE: o índice do botão CSV varia por relatório — "Ativação Contratos"
// tem 3 botões (PDF, CSV, FECHAR) e outros têm 2 (CSV, FECHAR). Por isso
// localizamos o botão pelo texto "CSV", não por índice. A geração do CSV no
// servidor do elleven pode ser lenta, por isso o timeout generoso de 180s.
// Depois de baixado, detecta o encoding (UTF-8 ou Latin-1) e faz o parse do
// CSV (separador ';', padrão BR) em headers + linhas.
async function downloadAndParseCsv(
  page: Page,
  csvButton: Locator,
): Promise<{
  ok: boolean;
  error?: string;
  csvHeaders: string[];
  rowCount: number;
  sampleRows: Record<string, string>[];
  rows: Record<string, string>[];
}> {
  let download;
  try {
    [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 180_000 }),
      csvButton.click({ timeout: 10_000 }),
    ]);
  } catch (e) {
    return {
      ok: false,
      error: `Timeout/erro esperando download do CSV: ${e}`,
      csvHeaders: [],
      rowCount: 0,
      sampleRows: [],
      rows: [],
    };
  }

  try {
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", resolve);
      stream.on("error", reject);
    });
    const raw = Buffer.concat(chunks);

    // Detecta encoding: se o UTF-8 tiver os artefatos típicos de um Latin-1
    // mal interpretado, refaz a decodificação como Latin-1.
    const utf8 = raw.toString("utf-8");
    const text =
      utf8.includes("ï¿½") || utf8.includes("â€") ? raw.toString("latin1") : utf8;

    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const csvHeaders = (lines[0] ?? "")
      .split(";")
      .map((h) => h.replace(/"/g, "").trim());
    const rows = lines.slice(1).map((line) => {
      const cells = line.split(";").map((c) => c.replace(/"/g, "").trim());
      return Object.fromEntries(csvHeaders.map((h, i) => [h, cells[i] ?? ""]));
    });

    return {
      ok: true,
      csvHeaders,
      rowCount: rows.length,
      sampleRows: rows.slice(0, 3),
      rows,
    };
  } catch (e) {
    return {
      ok: false,
      error: `Erro lendo/parseando CSV: ${e}`,
      csvHeaders: [],
      rowCount: 0,
      sampleRows: [],
      rows: [],
    };
  }
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

// Data "hoje"/"mês corrente" SEMPRE no fuso de Brasília (America/Sao_Paulo), e
// não no relógio do servidor: em produção (Vercel) o servidor é UTC, então a
// partir das ~21h do último dia do mês o UTC já virou o mês seguinte e o sync
// puxaria o relatório do Elleven do mês errado na virada. Intl garante o dia/mês
// corretos no Brasil sem depender de ajuste manual a cada mês.
function saoPauloParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { dd: get("day"), mm: get("month"), yyyy: get("year") };
}

function dateFormats({ dd, mm, yyyy }: { dd: string; mm: string; yyyy: string }) {
  return { br: `${dd}/${mm}/${yyyy}`, iso: `${yyyy}-${mm}-${dd}` };
}

function todayFormats() {
  return dateFormats(saoPauloParts(new Date()));
}

// Primeiro dia do mês corrente — usado como "Data Inicial" para puxar o relatório
// do mês inteiro (a cada rodada, do dia 1º até hoje). O upsert por número de
// contrato garante que reprocessar os mesmos dias não gera duplicata.
function firstOfMonthFormats() {
  const { mm, yyyy } = saoPauloParts(new Date());
  return dateFormats({ dd: "01", mm, yyyy });
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

// Abre o calendário e clica na célula de um dia específico DO MÊS ATUALMENTE
// EXIBIDO (ao abrir, o Flatpickr mostra o mês da data corrente por padrão),
// ignorando as células de transbordo do mês anterior/seguinte. Usado para
// selecionar o dia 1º como "Data Inicial". Mesma interação real do
// clickFlatpickrToday, que é a única que o estado do formulário reconhece.
async function clickFlatpickrDay(
  frame: Frame,
  selector: string,
  dayNumber: number,
): Promise<{ ok: boolean; valueAfter: string; debug: string }> {
  try {
    const locator = frame.locator(selector);
    await locator.click({ timeout: 3000 });
    const dayCell = frame
      .locator(
        ".flatpickr-calendar.open .flatpickr-day:not(.prevMonthDay):not(.nextMonthDay):not(.flatpickr-disabled)",
      )
      .filter({ hasText: new RegExp(`^${dayNumber}$`) })
      .first();
    await dayCell.waitFor({ state: "visible", timeout: 3000 });
    await dayCell.click({ timeout: 3000 });
    await frame.page().waitForTimeout(300);
    const valueAfter = await locator.inputValue().catch(() => "");
    return {
      ok: valueAfter.length > 0,
      valueAfter,
      debug: `clicou-dia-${dayNumber}-no-calendario`,
    };
  } catch (e) {
    return {
      ok: false,
      valueAfter: "",
      debug: `erro-click-dia-${dayNumber}: ${e}`,
    };
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
  const hoje = todayFormats();
  const inicioMes = firstOfMonthFormats();
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

    // Classifica o campo: "Data Inicial" recebe o dia 1º do mês; "Data Final"
    // (e qualquer campo de data não classificável) recebe hoje. Assim cada
    // rodada do cron puxa o relatório do mês inteiro (dia 1º -> hoje).
    const isInicial = /inicial|início|inicio|\bde\b|from/.test(haystack);
    const alvo = isInicial ? inicioMes : hoje;

    if (className.includes("flatpickr")) {
      // 1ª tentativa: interação real (abrir o calendário e clicar na célula do
      // dia certo) — é o único caminho que dispara corretamente o estado do
      // formulário. 2ª tentativa (fallback): API JS via fiber do React.
      let attempt = isInicial
        ? await clickFlatpickrDay(frame, selector, 1)
        : await clickFlatpickrToday(frame, selector);
      if (!attempt.ok) {
        let apiAttempt = await setFlatpickrDate(frame, selector, alvo.iso);
        for (let i = 0; i < 5 && !apiAttempt.ok; i++) {
          await frame.page().waitForTimeout(400);
          apiAttempt = await setFlatpickrDate(frame, selector, alvo.iso);
        }
        attempt = apiAttempt;
      }
      results.push({
        selector,
        ok: attempt.ok,
        label: label || placeholder || name,
        valueAfter: attempt.valueAfter,
        debug: `${isInicial ? "inicial" : "final"}: ${attempt.debug}`,
      });
      continue;
    }

    let ok = false;
    const digitsOnly = alvo.br.replace(/\D/g, "");
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
      label: `${isInicial ? "inicial" : "final"}: ${label || placeholder || name}`,
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

  const slug = req.nextUrl.searchParams.get("report") || DEFAULT_REPORT;
  const report = REPORTS[slug];
  if (!report) {
    return NextResponse.json(
      {
        error: `Relatório desconhecido: "${slug}". Válidos: ${Object.keys(REPORTS).join(", ")}`,
      },
      { status: 400 },
    );
  }
  // O cabeçalho de cada etapa do assistente é "<Nome do Relatório> - <Etapa>"
  // (ex.: "Ativação Contratos - Geração"). Ancoramos no nome do relatório para
  // não confundir com um eventual breadcrump/stepper que liste as etapas.
  const headingBase = escapeRegex(report.nome).replace(/\s+/g, "\\s+");
  const reParametros = new RegExp(`${headingBase}\\s*-\\s*Par[âa]metros`, "i");
  const reGeracao = new RegExp(`${headingBase}\\s*-\\s*Gera[çc][ãa]o`, "i");

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

      // Diagnóstico do carregamento da SPA de login: se o #root não montar, esses
      // arrays revelam a causa (erro de JS na página, bundle bloqueado, etc.).
      const pageConsoleErrors: string[] = [];
      const pageFailedRequests: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") pageConsoleErrors.push(m.text().slice(0, 300));
      });
      page.on("pageerror", (e) =>
        pageConsoleErrors.push(`PAGEERROR: ${e.message.slice(0, 300)}`),
      );
      page.on("requestfailed", (r) =>
        pageFailedRequests.push(
          `${r.url().slice(0, 200)} :: ${r.failure()?.errorText ?? ""}`,
        ),
      );

      step("Abrindo tela de login do elleven...");
      await page.goto(`${ELLEVEN_BASE}/ui/login`, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });

      const CPF_SELECTOR = 'input[placeholder="Entre com seu CPF"]';
      let cpfVisible = await page
        .waitForSelector(CPF_SELECTOR, { timeout: 45000 })
        .then(() => true)
        .catch(() => false);

      // A hidratação do React às vezes não conclui a tempo em Chromium serverless
      // (CPU limitada / cold start) — recarrega e tenta de novo, até 2 reloads.
      for (let tentativa = 1; !cpfVisible && tentativa <= 2; tentativa++) {
        step(`Campo de CPF não apareceu — reload ${tentativa}/2...`);
        await page
          .reload({ waitUntil: "domcontentloaded", timeout: 45000 })
          .catch(() => {});
        cpfVisible = await page
          .waitForSelector(CPF_SELECTOR, { timeout: 45000 })
          .then(() => true)
          .catch(() => false);
      }

      if (!cpfVisible) {
        const failScreenshot = await page
          .screenshot({ timeout: 10000 })
          .catch(() => null);
        const rootDump = await withTimeout(
          page.evaluate(() => ({
            bodyLen: (document.body?.innerText || "").length,
            rootHtml: (
              document.getElementById("root")?.innerHTML || "NO_ROOT"
            ).slice(0, 400),
            scripts: Array.from(document.scripts)
              .map((s) => s.src)
              .filter(Boolean),
          })),
          EVAL_TIMEOUT_MS,
          "login-fail-rootDump",
        ).catch((e) => ({ erro: String(e) }));
        wizardSteps.push({
          name: "login-cpf-nao-encontrado",
          url: page.url(),
          title: await page.title().catch(() => "?"),
          rootDump,
          consoleErrors: pageConsoleErrors.slice(0, 20),
          failedRequests: pageFailedRequests.slice(0, 20),
          screenshotBase64: failScreenshot
            ? failScreenshot.toString("base64")
            : null,
        });
        throw new Error(
          `Campo de CPF não apareceu após reloads (URL atual: ${page.url()}).`,
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

      step(`Navegando até o relatório ${report.nome}...`);
      await page.goto(`${ELLEVEN_BASE}${report.path}`, {
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
      let modeResult: Awaited<ReturnType<typeof downloadAndParseCsv>> | null = null;
      let savedCount = 0;
      let errorCount = 0;
      let importacaoAuto: Awaited<
        ReturnType<typeof importarLancamentosEllevenAuto>
      > | null = null;

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

        if (reParametros.test(stageText as string)) {
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
        // texto). CONFIRMADO (scripts/test-elleven-scraping.ts): este relatório só
        // tem 3 botões — 0=PDF, 1=CSV, 2=FECHAR (fecha o wizard, não exporta nada).
        // Não há visualização em tela. Por isso baixamos o CSV (índice 1) via
        // page.waitForEvent('download') em vez de procurar uma tabela na página.
        if (
          reGeracao.test(stageText as string) ||
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

          // O "CSV" do botão é um ícone/SVG, não texto do DOM — hasText não
          // acha. Mas o layout é consistente: os botões de modo são sempre
          // [..., CSV, FECHAR], ou seja, o CSV é o PENÚLTIMO (3 botões
          // PDF/CSV/FECHAR -> índice 1; 2 botões CSV/FECHAR -> índice 0). Logo
          // o índice do CSV é sempre count-2.
          const csvIndex = count - 2;
          const hasCsv = count >= 2;
          const csvButton = buttonLocators.nth(Math.max(0, csvIndex));

          if (hasCsv) {
            step(`Botão CSV = índice ${csvIndex} de ${count} — clicando e aguardando download...`);
            modeResult = await downloadAndParseCsv(page, csvButton);
            step(
              `Resultado do download do CSV: ok=${modeResult.ok}, colunas=${modeResult.csvHeaders.length}, linhas=${modeResult.rowCount}` +
                (modeResult.error ? `, error=${modeResult.error}` : ""),
            );
            wizardSteps.push({
              name: "3-csv-resultado",
              url: reportFrame.url(),
              count,
              ...modeResult,
            });

            // Relatórios sem tabela modelada própria: guardamos cada linha do
            // CSV como JSONB em elleven_relatorio_linha (chave = 1ª coluna, ou
            // um índice quando vazia). Snapshot mensal: apaga o período e recria,
            // mais rápido e simples que upsert linha a linha.
            if (modeResult.ok && report.generico) {
              const periodo = firstOfMonthFormats().iso.slice(0, 7); // YYYY-MM
              const linhas = modeResult.rows.map((row, i) => {
                const primeira = String(Object.values(row)[0] ?? "").trim();
                return {
                  relatorio: slug,
                  periodo,
                  chave: primeira || `linha-${i}`,
                  dados: row,
                };
              });
              try {
                await ensureRelatorioTable();
                await prisma.ellevenRelatorioLinha.deleteMany({
                  where: { relatorio: slug, periodo },
                });
                const res = await prisma.ellevenRelatorioLinha.createMany({
                  data: linhas,
                  skipDuplicates: true,
                });
                savedCount = res.count;
                step(
                  `Genérico (${slug}): ${savedCount} linha(s) salvas em elleven_relatorio_linha (período ${periodo}).`,
                );
              } catch (e) {
                errorCount++;
                step(`Erro salvando genérico (${slug}): ${e}`);
              }
            }

            if (modeResult.ok && report.persist) {
              step(`Salvando ${modeResult.rows.length} linhas no banco...`);
              for (const row of modeResult.rows) {
                if (!row["Contrato"]) continue;
                try {
                  await prisma.contratoAtivacaoElleven.upsert({
                    where: { contrato: row["Contrato"] },
                    update: {
                      vendedor1: row["Vendedor 1"] || null,
                      vendedor2: row["Vendedor 2"] || null,
                      origem: row["Origem"] || null,
                      dataContrato: row["Data Contrato"] || null,
                      localContrato: row["Local do Contrato"] || null,
                      primeiraMensalidade: row["Primeira Mensalidade"] || null,
                      valorPrimeiraMensalidade:
                        row["Valor Primeira Mensalidade"] || null,
                      codigoCliente: row["Codigo Cliente"] || null,
                      nomeCliente: row["Nome Cliente"] || null,
                      enderecoAtivacao: row["Endereco Ativacao"] || null,
                      cep: row["CEP"] || null,
                      cidade: row["Cidade"] || null,
                      servicoAtivado: row["Servico Ativado"] || null,
                      valServAtivado: row["Val Serv Ativado"] || null,
                      assinaturaContrato: row["Assinatura Contrato"] || null,
                      prazoAtivacaoContrato:
                        row["Prazo Ativacao Contrato"] || null,
                      ativacaoContrato: row["Ativacao Contrato"] || null,
                      statusContrato: row["Status Contrato"] || null,
                      ativacaoConexao: row["Ativacao Conexao"] || null,
                    },
                    create: {
                      contrato: row["Contrato"],
                      vendedor1: row["Vendedor 1"] || null,
                      vendedor2: row["Vendedor 2"] || null,
                      origem: row["Origem"] || null,
                      dataContrato: row["Data Contrato"] || null,
                      localContrato: row["Local do Contrato"] || null,
                      primeiraMensalidade: row["Primeira Mensalidade"] || null,
                      valorPrimeiraMensalidade:
                        row["Valor Primeira Mensalidade"] || null,
                      codigoCliente: row["Codigo Cliente"] || null,
                      nomeCliente: row["Nome Cliente"] || null,
                      enderecoAtivacao: row["Endereco Ativacao"] || null,
                      cep: row["CEP"] || null,
                      cidade: row["Cidade"] || null,
                      servicoAtivado: row["Servico Ativado"] || null,
                      valServAtivado: row["Val Serv Ativado"] || null,
                      assinaturaContrato: row["Assinatura Contrato"] || null,
                      prazoAtivacaoContrato:
                        row["Prazo Ativacao Contrato"] || null,
                      ativacaoContrato: row["Ativacao Contrato"] || null,
                      statusContrato: row["Status Contrato"] || null,
                      ativacaoConexao: row["Ativacao Conexao"] || null,
                    },
                  });
                  savedCount++;
                } catch (e) {
                  errorCount++;
                  step(`Erro upsert contrato ${row["Contrato"]}: ${e}`);
                }
              }
              step(`Banco atualizado: ${savedCount} salvos, ${errorCount} erros`);

              // Importação automática: transforma os contratos recém-sincronizados
              // do mês corrente em lançamentos e recalcula o fechamento (ABERTO).
              // Idempotente — roda a cada sync. Falha aqui não invalida o sync dos
              // contratos, então é capturada e apenas registrada no log.
              try {
                const periodo = periodoAtual();
                step(`Importando lançamentos do elleven para ${periodo}...`);
                importacaoAuto = await importarLancamentosEllevenAuto(periodo);
                step(
                  `Importação automática: ${importacaoAuto.lancamentosGerados} lançamento(s) ` +
                    `(${importacaoAuto.matchExato} exato, ${importacaoAuto.matchFuzzy} fuzzy, ` +
                    `${importacaoAuto.funcionariosCriados} vendedor(es) criado(s)) ` +
                    `de ${importacaoAuto.contratosNoPeriodo} contrato(s).`,
                );
              } catch (e) {
                step(`Erro na importação automática: ${e}`);
              }
            }
          } else {
            step(
              `Menos de 2 botões de export encontrados (${count}) — sem botão CSV para clicar.`,
            );
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
        report: slug,
        reportNome: report.nome,
        persist: report.persist,
        modeError: modeResult?.ok === false ? modeResult.error : undefined,
        csvHeaders: modeResult?.csvHeaders ?? [],
        rowCount: modeResult?.rowCount ?? 0,
        sampleRows: modeResult?.sampleRows ?? [],
        savedCount,
        errorCount,
        importacaoAuto,
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
