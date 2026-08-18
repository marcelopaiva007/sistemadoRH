"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// Convite genérico para instalar UMA área do sistema como aplicativo.
// Extraído de app/portal/instalar-app.tsx quando o /ponto virou um segundo
// PWA: os dois convites são idênticos em mecânica (beforeinstallprompt no
// Android, instrução manual no iOS, useSyncExternalStore contra piscada) e
// diferem só em escopo, chave de dispensa e texto. Ver o arquivo original
// para o histórico completo das decisões.

type EventoDeInstalacao = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function assinarModoApp(callback: () => void) {
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}
const lerModoApp = () => window.matchMedia("(display-mode: standalone)").matches;

const assinarNada = () => () => {};
const lerEhIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

// Ouvintes por chave: duas instâncias (portal e ponto) não podem disparar a
// dispensa uma da outra.
const ouvintesDispensa = new Map<string, (() => void)[]>();
function assinarDispensa(chave: string) {
  return (callback: () => void) => {
    ouvintesDispensa.set(chave, [...(ouvintesDispensa.get(chave) ?? []), callback]);
    return () => {
      ouvintesDispensa.set(
        chave,
        (ouvintesDispensa.get(chave) ?? []).filter((o) => o !== callback),
      );
    };
  };
}
function marcarDispensado(chave: string) {
  localStorage.setItem(chave, "sim");
  for (const avisar of ouvintesDispensa.get(chave) ?? []) avisar();
}

const naoNoServidor = () => false;
const dispensadoNoServidor = () => true;

export function InstalarPwa({
  escopo,
  chaveDispensa,
  titulo,
  descricaoAndroid,
}: {
  /** Escopo do service worker — "/portal" ou "/ponto". */
  escopo: string;
  /** Chave própria no localStorage: dispensar um convite não cala o outro. */
  chaveDispensa: string;
  titulo: string;
  descricaoAndroid: string;
}) {
  const jaEhApp = useSyncExternalStore(assinarModoApp, lerModoApp, naoNoServidor);
  const ehIOS = useSyncExternalStore(assinarNada, lerEhIOS, naoNoServidor);
  const dispensado = useSyncExternalStore(
    assinarDispensa(chaveDispensa),
    () => localStorage.getItem(chaveDispensa) === "sim",
    dispensadoNoServidor,
  );

  const [evento, setEvento] = useState<EventoDeInstalacao | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: escopo }).catch(() => {});
    }

    const aoPoderInstalar = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoDeInstalacao);
    };
    window.addEventListener("beforeinstallprompt", aoPoderInstalar);
    return () => window.removeEventListener("beforeinstallprompt", aoPoderInstalar);
  }, [escopo]);

  const instalar = useCallback(async () => {
    if (!evento) return;
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    setEvento(null);
    if (outcome === "accepted") marcarDispensado(chaveDispensa);
  }, [evento, chaveDispensa]);

  if (jaEhApp || dispensado) return null;
  if (!evento && !ehIOS) return null;

  return (
    <div className="mt-6 rounded-lg border bg-muted/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">{titulo}</p>
          {ehIOS ? (
            <p className="text-sm text-muted-foreground">
              Toque em <Share className="inline size-4 align-text-bottom" /> Compartilhar, na
              barra do Safari, e escolha <strong>Adicionar à Tela de Início</strong>. Depois é só
              abrir pelo ícone, sem digitar endereço.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">{descricaoAndroid}</p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => marcarDispensado(chaveDispensa)}
          title="Agora não"
        >
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
