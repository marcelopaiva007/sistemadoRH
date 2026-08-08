import chromiumServerless from "@sparticuz/chromium";
import { chromium, type Browser } from "playwright-core";

/**
 * Inicializador unificado do Chromium para geração de PDFs no servidor.
 * Em produção (Linux / Vercel Serverless) utiliza @sparticuz/chromium.
 * Em desenvolvimento local (macOS/Windows) utiliza o navegador instalado (Chrome/Edge).
 */
export async function launchChromium(): Promise<Browser> {
  if (process.platform === "linux") {
    return chromium.launch({
      args: chromiumServerless.args,
      executablePath: await chromiumServerless.executablePath(),
      headless: true,
    });
  }
  for (const channel of ["chrome", "msedge"] as const) {
    try {
      return await chromium.launch({ headless: true, channel });
    } catch {
      /* tenta o próximo canal */
    }
  }
  return chromium.launch({ headless: true });
}
