import type { Metadata } from "next";
import { Archivo, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

// Archivo nos três pesos do Modernist (corpo 400, ênfase 600, título 800).
// Geist Mono continua para número de versão e afins (globals.css, --font-mono).
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "600", "800"],
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
    <html lang="pt-BR" className={`${archivo.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
