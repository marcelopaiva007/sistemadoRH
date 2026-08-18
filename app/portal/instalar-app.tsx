"use client";

import { InstalarPwa } from "@/components/instalar-pwa";

// Convite para instalar o portal como aplicativo no celular.
//
// A mecânica inteira (beforeinstallprompt no Android, instrução manual no
// iOS/Safari, useSyncExternalStore contra a piscada da dupla renderização,
// service worker burro só para o Chrome oferecer instalar) vive em
// components/instalar-pwa.tsx desde que o /ponto virou um segundo PWA — os
// dois convites diferem só em escopo, chave e texto.
export function InstalarApp() {
  return (
    <InstalarPwa
      escopo="/portal"
      chaveDispensa="portal-instalar-dispensado"
      titulo="Deixe o portal na tela do celular"
      descricaoAndroid="Abre direto pelo ícone, sem digitar endereço nem procurar o link no Telegram."
    />
  );
}
