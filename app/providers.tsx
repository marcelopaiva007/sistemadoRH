"use client";

import { SessionProvider } from "next-auth/react";

// O ThemeProvider do next-themes morou aqui da v1.58.0 à v1.153.2. Saiu com o
// tema escuro (v1.154.0, visual Modernist): sem tema para alternar, o provider
// só escrevia uma classe no <html> e obrigava o `suppressHydrationWarning`.
export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
