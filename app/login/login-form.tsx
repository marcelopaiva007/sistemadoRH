"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { motivoDaFalhaDeLogin } from "@/lib/actions/login";

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
        // O NextAuth devolve o mesmo erro para senha errada e para tentativa
        // bloqueada. Quem sabe a diferença é o servidor — sem esta pergunta,
        // quem está bloqueado leria "senha inválida" e ficaria redigitando a
        // senha certa.
        const usuario = String(formData.get("username") ?? "");
        const motivo = await motivoDaFalhaDeLogin(usuario).catch(() => null);
        setError(
          motivo?.tipo === "bloqueado"
            ? `Muitas tentativas seguidas. Tente de novo em ${motivo.minutos} minuto${motivo.minutos > 1 ? "s" : ""}.`
            : "Usuário ou senha inválidos.",
        );
        return;
      }

      router.push("/");
      router.refresh();
    });
  }

  return (
    // Sem cartão: o formulário senta direto no papel (Modernist). Campos de
    // 42px e o botão de 46px com o rótulo à esquerda e a seta à direita —
    // "Esqueci minha senha" fica na linha do rótulo Senha, onde a pessoa
    // está olhando quando trava.
    <div>
      <form action={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="username">Usuário</Label>
          <Input id="username" name="username" autoComplete="username" required autoFocus className="h-[42px]" />
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
    </div>
  );
}
