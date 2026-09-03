import type { Metadata, Viewport } from "next";
import { FastmaiLogo } from "@/components/logo-fastmai";
import { InstalarApp } from "./instalar-app";

// O portal é a única parte do sistema feita para o celular do colaborador em
// campo: coluna única, alvos de toque grandes, sem menu lateral. É também a
// única parte instalável como aplicativo — ver app/manifest.ts.
export const metadata: Metadata = {
  title: "Portal do Colaborador | FASTMAI",
  // Faz o iPhone abrir sem a barra do Safari quando o portal foi adicionado à
  // tela de início. No Android quem manda é o `display` do manifesto.
  appleWebApp: {
    capable: true,
    title: "Meu RH",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  // Pinta a barra do sistema com a cor do sistema quando aberto como
  // aplicativo — sem isto sobra uma faixa branca no topo.
  themeColor: "#c8280f",
  // `viewport-fit=cover` para o conteúdo alcançar a borda em telas com
  // recorte; o padding seguro fica com o CSS.
  viewportFit: "cover",
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-4 px-4 py-3">
          <FastmaiLogo className="text-base" />
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Portal do colaborador
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
        {children}
        {/* Depois do conteúdo, de propósito: quem abriu o portal veio bater
            ponto ou ver holerite. O convite para instalar não pode disputar
            espaço com isso no alto da tela. */}
        <InstalarApp />
      </main>
    </div>
  );
}
