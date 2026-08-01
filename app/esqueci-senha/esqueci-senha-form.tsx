"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { solicitarRecuperacaoSenha } from "@/lib/actions/recuperacao-senha";

export function EsqueciSenhaForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

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
      <CardContent className="pt-6">
        {enviado ? (
          <p className="text-sm text-muted-foreground">
            Se o e-mail informado tiver uma conta ativa, enviamos um link para redefinir a senha.
            Confira sua caixa de entrada (e o spam).
          </p>
        ) : (
          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail cadastrado</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
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
        <Link href="/login" className="mt-4 block text-center text-sm text-muted-foreground hover:underline">
          Voltar para o login
        </Link>
      </CardContent>
    </Card>
  );
}
