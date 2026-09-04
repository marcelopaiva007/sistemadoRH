"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { confirmarCpfDoPortal } from "@/lib/actions/portal";
import type { ActionResult } from "@/lib/constants";

const estadoInicial: ActionResult = { ok: true };

export function ConfirmarCpf({ primeiroNome }: { primeiroNome: string }) {
  const [state, formAction, isPending] = useActionState(confirmarCpfDoPortal, estadoInicial);

  return (
    <div className="space-y-5">
      <div>
        <h1>Oi, {primeiroNome}!</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Só nesta primeira vez: confirme seu CPF para o portal ter certeza de que é você. Depois
          disso, o link do Telegram já basta.
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="cpf">Seu CPF</Label>
          <Input
            id="cpf"
            name="cpf"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Somente números"
            maxLength={14}
            required
            autoFocus
            className="h-11 text-base"
          />
        </div>
        {!state.ok && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={isPending}>
          {isPending ? "Conferindo..." : "Confirmar"}
        </Button>
      </form>

      <p className="text-xs text-muted-foreground">
        Seu CPF não é enviado para ninguém — ele só é comparado com o que já está no seu cadastro.
      </p>
    </div>
  );
}
