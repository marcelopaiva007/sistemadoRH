import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core"],
  // O tracer não detecta os arquivos auxiliares do playwright/chromium
  // (browsers.json, binário) — inclui o pacote inteiro na função do relatório
  // PDF.
  // A chave é um glob picomatch: colchetes de segmento dinâmico precisariam de
  // escape, então usamos `**` no lugar dos segmentos dinâmicos. O sufixo importa
  // — sem ele, o Chromium entraria também na função de download de anexos.
  outputFileTracingIncludes: {
    "/api/rh/**/relatorio-pdf": [
      "./node_modules/playwright-core/**/*",
      "./node_modules/@sparticuz/chromium/**/*",
    ],
  },
  images: {
    // O projeto não otimiza imagem nenhuma: os três usos de next/image (o
    // logo, em components/logo.tsx) já passam `unoptimized`, e não há foto de
    // catálogo nem conteúdo visual dinâmico.
    //
    // Mesmo assim o endpoint /_next/image ficava de pé em produção,
    // respondendo 200 e alimentando o `sharp` — que carrega as
    // vulnerabilidades herdadas do libvips (aviso GHSA-f88m-g3jw-g9cj, versão
    // instalada 0.34.5, corrigida só a partir da 0.35).
    //
    // Desligar remove a superfície inteira em vez de perseguir a versão do
    // sharp, e não muda nada na tela: todo uso já era `unoptimized`.
    unoptimized: true,
  },
  experimental: {
    // Anexos do dossiê digital (PDF/foto de RG, ASO, certificado de NR) sobem
    // por server action. O padrão de 1 MB derruba um PDF escaneado; 5 MB fica
    // logo acima do teto de 4 MB validado em lib/constants-dp.ts e abaixo do
    // limite de corpo de requisição da Vercel (4,5 MB + overhead).
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;
