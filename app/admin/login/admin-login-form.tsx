"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { motivoDaFalhaDeLogin } from "@/lib/actions/login";

// O formulário do login do admin: o mesmo login por usuário e senha do sistema
// (Credentials do NextAuth, com o mesmo bloqueio por tentativas), só que,
// dando certo, vai para /admin. Se a conta digitada não for a de
// administrador, o proxy devolve para esta tela — que então mostra com que
// conta a pessoa entrou e que ela não administra o sistema.
export function AdminLoginForm({ destino = "/admin" }: { destino?: string }) {
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
        const usuario = String(formData.get("username") ?? "");
        const motivo = await motivoDaFalhaDeLogin(usuario).catch(() => null);
        setError(
          motivo?.tipo === "bloqueado"
            ? `Muitas tentativas seguidas. Tente de novo em ${motivo.minutos} minuto${motivo.minutos > 1 ? "s" : ""}.`
            : "Usuário ou senha inválidos.",
        );
        return;
      }

      // `destino` já vem validado pela página (só caminho dentro de /admin).
      router.push(destino);
      router.refresh();
    });
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="username">Usuário do administrador</Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          autoFocus
          className="h-[42px]"
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="password">Senha</Label>
          <Link href="/esqueci-senha" className="text-xs text-primary hover:underline">
            Esqueci minha senha
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-[42px]"
        />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" size="lg" className="h-[46px] w-full" disabled={isPending}>
        {isPending ? "Entrando..." : "Entrar"}
        <ArrowRight data-icon="inline-end" />
      </Button>
    </form>
  );
}
