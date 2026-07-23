import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core"],
  // O tracer não detecta os arquivos auxiliares do playwright/chromium
  // (browsers.json, binário) — inclui o pacote inteiro na função do relatório
  // PDF (mesma solução usada no sync-elleven do lm-bonificacao).
  // A chave é um glob picomatch: colchetes de segmento dinâmico precisariam de
  // escape, então usamos o curinga do prefixo da rota.
  outputFileTracingIncludes: {
    "/api/rh/**": [
      "./node_modules/playwright-core/**/*",
      "./node_modules/@sparticuz/chromium/**/*",
    ],
  },
};

export default nextConfig;
