"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { redefinirSenhaComToken } from "@/lib/actions/recuperacao-senha";

export function RedefinirSenhaForm({ token }: { token: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [redefinida, setRedefinida] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    const senha = String(formData.get("senha") ?? "");
    const confirmacao = String(formData.get("confirmacao") ?? "");
    if (senha !== confirmacao) {
      setError("As senhas não coincidem.");
      return;
    }
    startTransition(async () => {
      const result = await redefinirSenhaComToken({ ok: true }, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRedefinida(true);
      setTimeout(() => router.push("/login"), 2000);
    });
  }

  if (redefinida) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Senha redefinida! Levando você para o login...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <div className="space-y-2">
            <Label htmlFor="senha">Nova senha</Label>
            <Input id="senha" name="senha" type="password" autoComplete="new-password" required autoFocus minLength={8} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmacao">Confirme a nova senha</Label>
            <Input id="confirmacao" name="confirmacao" type="password" autoComplete="new-password" required minLength={8} />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Salvando..." : "Redefinir senha"}
          </Button>
        </form>
        <Link href="/login" className="mt-4 block text-center text-sm text-muted-foreground hover:underline">
          Voltar para o login
        </Link>
      </CardContent>
    </Card>
  );
}
