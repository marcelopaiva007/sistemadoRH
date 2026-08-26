import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FASTMAI | Sistema do RH",
  description: "Sistema de RH do grupo — departamento pessoal, segurança, desempenho e recrutamento",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      // O next-themes escreve a classe do tema (`dark`) no <html> por script,
      // ANTES do React hidratar — é assim que ele evita o flash de tema
      // errado. Então o HTML que sai do servidor e o que o cliente encontra
      // divergem por construção, e sem isto o React reclama no console a cada
      // carregamento de quem usa o tema escuro.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
