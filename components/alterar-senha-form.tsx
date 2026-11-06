"use client";

import { useActionState, useRef } from "react";
import { toast } from "sonner";
import { alterarSenha } from "@/lib/actions/conta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionResult } from "@/lib/constants";

const initialState: ActionResult = { ok: true };

export function AlterarSenhaForm() {
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, isPending] = useActionState(
    async (prev: ActionResult, fd: FormData) => {
      const result = await alterarSenha(prev, fd);
      if (result.ok) {
        toast.success("Senha alterada.");
        // Campo de senha preenchido depois de trocar é convite a trocar de
        // novo sem querer no próximo clique.
        formRef.current?.reset();
      }
      return result;
    },
    initialState,
  );

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="senhaAtual">Senha atual</Label>
        <Input id="senhaAtual" name="senhaAtual" type="password" autoComplete="current-password" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="novaSenha">Nova senha</Label>
        <Input
          id="novaSenha"
          name="novaSenha"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <p className="text-xs text-muted-foreground">Pelo menos 8 caracteres.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmarSenha">Confirmar nova senha</Label>
        <Input
          id="confirmarSenha"
          name="confirmarSenha"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>

      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Salvando..." : "Trocar senha"}
      </Button>
    </form>
  );
}
