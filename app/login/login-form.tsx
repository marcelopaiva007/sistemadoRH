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
//
// SÓ USUÁRIO E SENHA desde a v1.191.0 (decisão do CEO em 05/11/2026): o e-mail
// não entra mais, e o "Entrar com Google", que dependia dele, saiu. Quem
// digita o e-mail por hábito vê o aviso na hora — mas o formulário envia do
// mesmo jeito, porque algum usuário antigo pode ter "@" no próprio nome.
export function LoginForm({
  erroInicial = null,
}: {
  /** Erro que voltou do NextAuth para a tela, já em português. */
  erroInicial?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(erroInicial);
  const [digitouEmail, setDigitouEmail] = useState(false);

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
            : usuario.includes("@")
              ? "Usuário ou senha inválidos. O acesso agora é pelo nome de usuário, não pelo e-mail — não lembra o seu? Use “Esqueci meu usuário”."
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
    // 42px e o botão de 46px com o rótulo à esquerda e a seta à direita — os
    // dois "Esqueci" ficam na linha do rótulo de cada campo, onde a pessoa
    // está olhando quando trava.
    <form action={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="username">Usuário</Label>
          <Link href="/esqueci-usuario" className="text-xs text-primary hover:underline">
            Esqueci meu usuário
          </Link>
        </div>
        {/* Sem maiúscula e sem corretor automáticos: no celular o teclado
            trocava "marcelo" por "Marcelo" sem a pessoa perceber. */}
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          autoFocus
          aria-describedby={digitouEmail ? "aviso-email" : undefined}
          onChange={(e) => setDigitouEmail(e.target.value.includes("@"))}
          className="h-[42px]"
        />
        {digitouEmail && (
          <p id="aviso-email" className="text-xs text-primary">
            O acesso agora é pelo nome de usuário (ex.: maria ou maria.silva), não pelo e-mail.
          </p>
        )}
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
