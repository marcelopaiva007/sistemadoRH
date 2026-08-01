"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Sem classe de cor escrita à mão aqui de propósito. Este formulário já
// carregou um tema escuro/neon inteiro (cartão em degradê slate-900, borda
// ciano, campos slate-800 com texto quase branco) de quando o sistema seria
// escuro. Como o sistema é claro, isso virou um cartão meio transparente sobre
// fundo claro, com rótulo a 1,4:1 de contraste — ilegível, logo na primeira
// tela. Deixando os componentes no padrão, eles seguem os tokens de
// app/globals.css, que já passam no contraste exigido.
//
// O logo e o nome do sistema ficam em page.tsx, com o arquivo oficial da
// marca. Aqui dentro havia uma segunda logo (um hexágono neon desenhado à
// mão, piscando) — duas marcas empilhadas na mesma tela.
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
    <Card>
      <CardContent className="pt-6">
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Usuário</Label>
            <Input id="username" name="username" autoComplete="username" required autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Entrando..." : "Entrar"}
          </Button>
        </form>
        <Link
          href="/esqueci-senha"
          className="mt-4 block text-center text-sm text-muted-foreground hover:underline"
        >
          Esqueci minha senha
        </Link>
      </CardContent>
    </Card>
  );
}
