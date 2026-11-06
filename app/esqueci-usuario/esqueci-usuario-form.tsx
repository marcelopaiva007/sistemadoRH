"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { solicitarLembreteDeUsuario } from "@/lib/actions/recuperacao-senha";

export function EsqueciUsuarioForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await solicitarLembreteDeUsuario({ ok: true }, formData);
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
              Se este e-mail estiver cadastrado em algum usuário ativo, enviamos para ele o seu
              usuário de acesso — ou todos, se você tiver mais de um. Confira a caixa de entrada (e o
              spam).
            </p>
            <p>Não chegou nada? Peça ao administrador do sistema o seu usuário.</p>
          </div>
        ) : (
          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Seu e-mail</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
              <p className="text-xs text-muted-foreground">
                Mandamos para este e-mail o seu usuário de acesso. Quem tem um usuário na L&amp;M e
                outro nas demais marcas recebe os dois.
              </p>
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Enviando..." : "Receber meu usuário por e-mail"}
            </Button>
          </form>
        )}
        <div className="flex flex-col items-center gap-2 text-sm">
          <Link href="/esqueci-senha" className="text-primary hover:underline">
            Esqueci minha senha
          </Link>
          <Link href="/login" className="text-muted-foreground hover:underline">
            Voltar para o login
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
