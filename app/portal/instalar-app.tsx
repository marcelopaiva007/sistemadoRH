"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// Convite para instalar o portal como aplicativo no celular.
//
// Os dois sistemas fazem isto de formas diferentes, e não dá para escolher um:
//
//   ANDROID/CHROME dispara `beforeinstallprompt`. Guardamos o evento e
//   chamamos `prompt()` no clique — o navegador exige gesto do usuário, então
//   não dá para instalar sozinho, nem se quiséssemos.
//
//   iOS/SAFARI não tem esse evento e nunca vai ter: instalar lá é sempre
//   Compartilhar → "Adicionar à Tela de Início", feito à mão. Por isso a
//   instrução em texto, que é a única coisa que funciona no iPhone.
//
// Some por completo quando o portal JÁ está aberto como aplicativo — convidar
// para instalar quem já instalou é ruído puro.
//
// TUDO QUE VEM DO NAVEGADOR É LIDO COM `useSyncExternalStore`, e não com
// useState+useEffect: o par renderiza duas vezes e faz o convite piscar na cara
// de quem já instalou ou já dispensou. É o mesmo motivo do seletor de tema em
// components/app-topbar.tsx.
const CHAVE_DISPENSADO = "portal-instalar-dispensado";

type EventoDeInstalacao = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// `display-mode: standalone` é o sinal de "aberto como aplicativo".
function assinarModoApp(callback: () => void) {
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}
const lerModoApp = () => window.matchMedia("(display-mode: standalone)").matches;

// O sistema do aparelho não muda no meio da sessão: assinar é no-op, mas a
// leitura precisa acontecer no cliente, porque no servidor não existe
// `navigator`.
const assinarNada = () => () => {};
const lerEhIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

// Store mínima em volta do localStorage: `useSyncExternalStore` precisa de
// alguém para avisar que o valor mudou, e quem muda é o clique em "agora não".
let ouvintesDispensa: (() => void)[] = [];
function assinarDispensa(callback: () => void) {
  ouvintesDispensa.push(callback);
  return () => {
    ouvintesDispensa = ouvintesDispensa.filter((o) => o !== callback);
  };
}
const lerDispensa = () => localStorage.getItem(CHAVE_DISPENSADO) === "sim";
function marcarDispensado() {
  localStorage.setItem(CHAVE_DISPENSADO, "sim");
  for (const avisar of ouvintesDispensa) avisar();
}

// No servidor nada disto existe. `true` para dispensado e `false` para o resto
// faz o HTML sair sem o convite — que é o estado certo para quase todo mundo,
// e some a chance de o bloco aparecer e desaparecer na primeira pintura.
const naoNoServidor = () => false;
const dispensadoNoServidor = () => true;

export function InstalarApp() {
  const jaEhApp = useSyncExternalStore(assinarModoApp, lerModoApp, naoNoServidor);
  const ehIOS = useSyncExternalStore(assinarNada, lerEhIOS, naoNoServidor);
  const dispensado = useSyncExternalStore(assinarDispensa, lerDispensa, dispensadoNoServidor);

  const [evento, setEvento] = useState<EventoDeInstalacao | null>(null);

  useEffect(() => {
    // O service worker existe só para o Android oferecer a instalação; ele não
    // guarda nada em cache (ver public/sw.js). Falha aqui não pode derrubar o
    // portal: sem ele, o site continua funcionando, só não é instalável.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/portal" }).catch(() => {});
    }

    const aoPoderInstalar = (e: Event) => {
      // Sem isto o Chrome mostra a barrinha dele por cima, e a pessoa vê dois
      // convites diferentes para a mesma coisa.
      e.preventDefault();
      setEvento(e as EventoDeInstalacao);
    };
    window.addEventListener("beforeinstallprompt", aoPoderInstalar);
    return () => window.removeEventListener("beforeinstallprompt", aoPoderInstalar);
  }, []);

  const instalar = useCallback(async () => {
    if (!evento) return;
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    // O evento é de uso único: depois do prompt ele não serve mais, e guardar
    // um evento morto faria o botão não responder no segundo clique.
    setEvento(null);
    if (outcome === "accepted") marcarDispensado();
  }, [evento]);

  if (jaEhApp || dispensado) return null;
  // No Android só aparece depois que o navegador avisa que dá para instalar —
  // oferecer antes disso é botão que não faz nada.
  if (!evento && !ehIOS) return null;

  return (
    <div className="mt-6 rounded-lg border bg-muted/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">Deixe o portal na tela do celular</p>
          {ehIOS ? (
            <p className="text-sm text-muted-foreground">
              Toque em <Share className="inline size-4 align-text-bottom" /> Compartilhar, na
              barra do Safari, e escolha <strong>Adicionar à Tela de Início</strong>. Depois é só
              abrir pelo ícone, sem digitar endereço.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Abre direto pelo ícone, sem digitar endereço nem procurar o link no Telegram.
            </p>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={marcarDispensado} title="Agora não">
          <X className="size-4" />
        </Button>
      </div>
      {!ehIOS && (
        <Button className="mt-3 w-full" onClick={instalar}>
          <Download className="size-4" />
          Instalar
        </Button>
      )}
    </div>
  );
}
