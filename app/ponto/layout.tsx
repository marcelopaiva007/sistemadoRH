import type { Metadata, Viewport } from "next";
import { Clock } from "lucide-react";

// O app de ponto. Para o colaborador é OUTRO sistema, separado do Portal do
// Colaborador: aqui só se bate ponto — identidade visual própria (verde, não
// o índigo do portal), manifesto PWA próprio e login próprio (CPF + PIN, sem
// Telegram). Uso diário: coluna única, alvos grandes, nada disputando espaço
// com o botão de bater.
export const metadata: Metadata = {
  title: "Ponto Eletrônico | LM Telecom",
  // `metadata.manifest` com caminho relativo exige metadataBase — sem ele o
  // build quebra. Definido aqui, vale só para /ponto e abaixo; o manifesto do
  // portal continua vindo do app/manifest.ts sem mudança.
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  manifest: "/manifest-ponto.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Ponto",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#059669",
  viewportFit: "cover",
};

export default function PontoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-gradient-to-b from-emerald-50/60 to-background dark:from-emerald-950/20">
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="rounded-xl bg-emerald-600 p-2 text-white shadow-sm">
              <Clock className="size-5" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold tracking-tight">Ponto Eletrônico</p>
              <p className="text-[11px] text-muted-foreground">LM Telecom · REP-P</p>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
