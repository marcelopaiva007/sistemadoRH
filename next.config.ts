import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core"],
  // O tracer não detecta os arquivos auxiliares do playwright/chromium
  // (browsers.json, binário) — inclui o pacote inteiro na função do relatório
  // PDF (mesma solução usada no sync-elleven do lm-bonificacao).
  outputFileTracingIncludes: {
    "/api/rh/[empresaId]/pesquisas/[pesquisaId]/relatorio-pdf": [
      "./node_modules/playwright-core/**/*",
      "./node_modules/@sparticuz/chromium/**/*",
    ],
  },
};

export default nextConfig;
