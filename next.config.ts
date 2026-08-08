import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@sparticuz/chromium",
    "playwright-core",
    "@prisma/adapter-pg",
    "pg",
    "pg-connection-string",
    "pgpass",
  ],
  turbopack: {
    root: __dirname,
  },
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
    // catálogo nem conteúdo visual dinâmico. Isto declara no nível do projeto
    // o que já valia em cada uso.
    //
    // ATENÇÃO, medido em produção: isto NÃO desliga o endpoint /_next/image
    // na Vercel. Ele continua respondendo 200 e redimensionando de verdade —
    // quem serve é a plataforma (`Server: Vercel`), não o build do Next, e a
    // configuração daqui não a alcança. Para fechar de fato, é no painel da
    // Vercel.
    //
    // Por que ainda assim não é exposição relevante: o endpoint só aceita
    // caminho local do próprio projeto. Testado — rota protegida devolve 307,
    // caminho de API 400, URL externa 400, travessia de diretório 400. Ou
    // seja, só processa as nossas imagens; não há como um estranho entregar
    // imagem criada por ele, que é o que as falhas herdadas do libvips
    // (GHSA-f88m-g3jw-g9cj, sharp 0.34.5) exigiriam. E o processamento roda
    // na infraestrutura da Vercel, não no sharp que vem no nosso pacote.
    unoptimized: true,
  },
  experimental: {
    // Anexos do dossiê digital (PDF/foto de RG, ASO, certificado de NR) sobem
    // por server action. O padrão de 1 MB derruba um PDF escaneado; 5 MB fica
    // logo acima do teto de 4 MB validado em lib/constants-dp.ts e abaixo do
    // limite de corpo de requisição da Vercel (4,5 MB + overhead).
    serverActions: { bodySizeLimit: "5mb" },
  },
  // Headers de segurança aplicados a toda resposta. Colocados aqui (não em
  // proxy.ts) de propósito: por doc do Next 16, `headers` do next.config
  // roda ANTES do proxy na cadeia de execução, então isto nunca disputa com
  // nem depende da lógica de autenticação do NextAuth em proxy.ts — os dois
  // arquivos ficam independentes um do outro.
  //
  // NÃO criar middleware.ts para isto: nesta versão o Next renomeou o
  // arquivo para proxy.ts (ver AGENTS.md) e middleware.ts é simplesmente
  // ignorado — foi tentado e descartado nesta mesma leva de mudanças.
  //
  // Sem CSP de propósito: a stack usa estilo inline do Tailwind/shadcn e
  // scripts de terceiros (Vercel Analytics, etc.) — uma CSP escrita sem
  // testar contra cada rota quebraria renderização em produção. Fica como
  // trabalho futuro, testado caso a caso.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
