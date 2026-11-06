"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { solicitarRecuperacaoSenha } from "@/lib/actions/recuperacao-senha";

// Desde a v1.191.0 o acesso é só pelo nome de usuário: o pedido é pelo
// USUÁRIO, e o link vai para o e-mail cadastrado nele. Quem não lembra o
// usuário tem a outra porta ao lado, o "Esqueci meu usuário".
export function EsqueciSenhaForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [digitouEmail, setDigitouEmail] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await solicitarRecuperacaoSenha({ ok: true }, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEnviado(true);
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        {enviado ? (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Se o usuário existir e tiver e-mail cadastrado, enviamos para esse e-mail um link para
              criar uma senha nova. Confira a caixa de entrada (e o spam).
            </p>
            <p>Não chegou nada? Peça ao administrador do sistema para redefinir a sua senha.</p>
          </div>
        ) : (
          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="usuario">Seu usuário</Label>
              {/* Sem maiúscula e sem corretor automáticos — o mesmo campo do
                  login (app/login/login-form.tsx). */}
              <Input
                id="usuario"
                name="usuario"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                autoFocus
                onChange={(e) => setDigitouEmail(e.target.value.includes("@"))}
              />
              {digitouEmail ? (
                <p className="text-xs text-primary">
                  Aqui vai o nome de usuário, não o e-mail. Não lembra o usuário?{" "}
                  <Link href="/esqueci-usuario" className="font-semibold underline">
                    Receba no seu e-mail
                  </Link>
                  .
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  O link vai para o e-mail cadastrado no seu usuário.
                </p>
              )}
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Enviando..." : "Enviar link de redefinição"}
            </Button>
          </form>
        )}
        <div className="flex flex-col items-center gap-2 text-sm">
          <Link href="/esqueci-usuario" className="text-primary hover:underline">
            Esqueci meu usuário
          </Link>
          <Link href="/login" className="text-muted-foreground hover:underline">
            Voltar para o login
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
