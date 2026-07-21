"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

const LMLogo = () => (
  <svg className="w-12 h-12 mx-auto mb-4" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Fundo com gradiente e brilho */}
    <defs>
      <linearGradient id="lmGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: "#00d4ff", stopOpacity: 1 }} />
        <stop offset="100%" style={{ stopColor: "#2563eb", stopOpacity: 1 }} />
      </linearGradient>
      <filter id="glow">
        <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>

    {/* L */}
    <rect x="8" y="12" width="8" height="40" fill="url(#lmGrad)" filter="url(#glow)" rx="2"/>
    <rect x="8" y="48" width="20" height="4" fill="url(#lmGrad)" filter="url(#glow)" rx="2"/>

    {/* M - dois picos */}
    <rect x="36" y="12" width="8" height="40" fill="url(#lmGrad)" filter="url(#glow)" rx="2"/>
    <polygon points="44,12 48,26 52,12 52,28 52,52 60,52 60,12" fill="url(#lmGrad)" filter="url(#glow)"/>

    {/* Acentos ciano (brilho lateral) */}
    <circle cx="4" cy="16" r="2" fill="#00d4ff" opacity="0.6"/>
    <circle cx="60" cy="32" r="2" fill="#00d4ff" opacity="0.6"/>
  </svg>
);

export function LoginForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await signIn("credentials", {
        username: formData.get("username"),
        password: formData.get("password"),
        redirect: false,
      });

      if (result?.error) {
        setError("Usuário ou senha inválidos.");
        return;
      }

      router.push("/");
      router.refresh();
    });
  }

  return (
    <Card className="border-cyan-500/30 bg-gradient-to-br from-slate-900/40 to-slate-950/40 backdrop-blur-md shadow-2xl shadow-cyan-500/20">
      <CardContent className="pt-6">
        <div className="space-y-6">
          <div className="text-center">
            <LMLogo />
            <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              LM Telecom
            </h1>
            <p className="text-sm text-slate-400 mt-1">Sistema de Bonificação</p>
          </div>

          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-slate-300">Usuário</Label>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                required
                className="bg-slate-800/50 border-slate-700/50 text-slate-100 placeholder:text-slate-500 focus:border-cyan-500/50 focus:ring-cyan-500/30"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-300">Senha</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="bg-slate-800/50 border-slate-700/50 text-slate-100 placeholder:text-slate-500 focus:border-cyan-500/50 focus:ring-cyan-500/30"
              />
            </div>
            {error && (
              <Alert variant="destructive" className="bg-red-950/50 border-red-800/50">
                <AlertDescription className="text-red-200">{error}</AlertDescription>
              </Alert>
            )}
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-slate-950 font-semibold shadow-lg shadow-cyan-500/30 disabled:opacity-50"
              disabled={isPending}
            >
              {isPending ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
