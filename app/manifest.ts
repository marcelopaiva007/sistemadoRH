import type { MetadataRoute } from "next";

// O portal do colaborador como aplicativo instalável no celular.
//
// POR QUE SITE INSTALÁVEL, E NÃO APLICATIVO DE LOJA. Era a decisão em aberto
// registrada em `lib/proximas-atualizacoes.ts` ("aplicativo de loja ou site
// instalável — esforços e prazos bem diferentes"). O caminho instalável usa o
// portal que JÁ existe e já funciona no celular, não exige conta de
// desenvolvedor na Apple nem no Google, e a correção chega na hora — sem
// esperar aprovação de loja. Aplicativo de loja continua sendo outra decisão,
// e nada aqui atrapalha ela.
//
// ESCOPO NO /portal, DE PROPÓSITO. Instalar é oferecido só dentro do portal:
// é a única parte do sistema desenhada para celular (coluna única, alvo de
// toque grande, sem menu lateral). Com `scope` fora daqui, o RH poderia
// instalar as telas de mesa no telefone e receber um app que não se navega.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Portal do Colaborador — LM Telecom",
    // Até 12 caracteres: é o que cabe embaixo do ícone na tela inicial do
    // Android. Mais que isso o próprio sistema corta com reticências.
    short_name: "Meu RH",
    description:
      "Bater ponto, ver holerite e documentos, pedir férias e falar com o RH pelo celular.",
    start_url: "/portal",
    scope: "/portal",
    // "standalone": abre sem barra de endereço, como aplicativo. A pessoa em
    // campo não precisa ver URL para bater ponto.
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#4f46e5",
    lang: "pt-BR",
    dir: "ltr",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icone-app-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icone-app-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // "maskable" é obrigatório para o Android não desenhar o ícone dentro de
      // um quadrado branco na tela inicial. A arte deste tem margem própria,
      // porque o sistema recorta as bordas em círculo ou squircle.
      {
        src: "/icone-app-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
