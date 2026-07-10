"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { alterarSenha } from "@/lib/actions/conta";
import type { ActionResult } from "@/lib/constants";

const initialState: ActionResult = { ok: true };

export function AlterarSenhaForm() {
  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await alterarSenha(prev, fd);
    if (result.ok) {
      toast.success("Senha alterada com sucesso.");
      (document.getElementById("form-senha") as HTMLFormElement | null)?.reset();
    }
    return result;
  }, initialState);

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="text-base">Alterar senha</CardTitle>
      </CardHeader>
      <CardContent>
        <form id="form-senha" action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="senhaAtual">Senha atual</Label>
            <Input id="senhaAtual" name="senhaAtual" type="password" autoComplete="current-password" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="novaSenha">Nova senha</Label>
            <Input id="novaSenha" name="novaSenha" type="password" autoComplete="new-password" required minLength={8} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmarSenha">Confirmar nova senha</Label>
            <Input
              id="confirmarSenha"
              name="confirmarSenha"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </div>
          {!state.ok && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={isPending}>
            {isPending ? "Salvando..." : "Alterar senha"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
