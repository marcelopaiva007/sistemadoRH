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
  <svg className="w-16 h-16 mx-auto mb-6" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="lmGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#00d4ff" />
        <stop offset="50%" stopColor="#0ea5e9" />
        <stop offset="100%" stopColor="#2563eb" />
      </linearGradient>
      <filter id="glowEffect" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <filter id="innerGlow">
        <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>

    {/* Hexágono externo (borda) */}
    <path d="M 50 10 L 85 30 L 85 70 L 50 90 L 15 70 L 15 30 Z" stroke="#00d4ff" strokeWidth="2" fill="none" opacity="0.5" filter="url(#glowEffect)"/>

    {/* Hexágono interno (fundo) */}
    <path d="M 50 12 L 83 30 L 83 70 L 50 88 L 17 70 L 17 30 Z" fill="url(#lmGradient)" opacity="0.1" filter="url(#innerGlow)"/>

    {/* Letra L */}
    <g filter="url(#glowEffect)">
      <rect x="28" y="30" width="6" height="36" fill="url(#lmGradient)" rx="2"/>
      <rect x="28" y="64" width="16" height="4" fill="url(#lmGradient)" rx="2"/>
    </g>

    {/* Letra M */}
    <g filter="url(#glowEffect)">
      <rect x="54" y="30" width="6" height="36" fill="url(#lmGradient)" rx="2"/>
      <polygon points="60,30 66,45 72,30 72,66 66,66 66,45 60,66 54,66" fill="url(#lmGradient)"/>
    </g>

    {/* Pontos de brilho (accent) */}
    <circle cx="20" cy="25" r="1.5" fill="#00d4ff" opacity="0.8" filter="url(#glowEffect)"/>
    <circle cx="80" cy="50" r="1.5" fill="#00d4ff" opacity="0.8" filter="url(#glowEffect)"/>
    <circle cx="50" cy="92" r="1.5" fill="#00d4ff" opacity="0.8" filter="url(#glowEffect)"/>
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
