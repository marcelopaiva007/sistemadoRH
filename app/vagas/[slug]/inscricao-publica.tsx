"use client";

import { useActionState, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { inscreverSePublicamente } from "@/lib/actions/vagas-publico";
import { MIMES_ANEXO_ACEITOS } from "@/lib/constants-dp";
import type { ActionResult } from "@/lib/constants";

const initialState: ActionResult = { ok: true };

export function InscricaoPublica({ slug, empresaNome }: { slug: string; empresaNome: string }) {
  const [enviado, setEnviado] = useState(false);
  // Campos controlados de propósito: com <form action={...}> o React limpa os
  // inputs não controlados quando a action retorna. Num formulário do RH isso
  // é um aborrecimento; aqui seria o candidato redigitando tudo por causa de
  // um dígito errado no CPF — e provavelmente desistindo.
  const [valores, setValores] = useState({
    nome: "",
    cpf: "",
    telefone: "",
    email: "",
    cidade: "",
  });
  const campo = (nome: keyof typeof valores) => ({
    value: valores[nome],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setValores((v) => ({ ...v, [nome]: e.target.value })),
  });

  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await inscreverSePublicamente(slug, prev, fd);
    if (result.ok) setEnviado(true);
    return result;
  }, initialState);

  if (enviado) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <CheckCircle2 className="mx-auto mb-3 size-8 text-success" />
        <h2 className="text-lg font-semibold">Inscrição enviada</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Recebemos sua inscrição. Se o perfil for compatível, o RH entrará em contato. Se você já
          tinha cadastro conosco, valem os dados e o currículo que já constam — para atualizá-los,
          fale com o RH.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4 rounded-lg border bg-card p-6">
      <h2 className="text-lg font-semibold">Candidate-se</h2>

      <div className="space-y-2">
        <Label htmlFor="nome">Nome completo *</Label>
        <Input id="nome" name="nome" required autoComplete="name" {...campo("nome")} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cpf">CPF *</Label>
          <Input id="cpf" name="cpf" inputMode="numeric" placeholder="só números" required {...campo("cpf")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="telefone">Telefone com DDD *</Label>
          <Input id="telefone" name="telefone" inputMode="tel" autoComplete="tel" required {...campo("telefone")} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" autoComplete="email" {...campo("email")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cidade">Cidade</Label>
          <Input id="cidade" name="cidade" {...campo("cidade")} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="arquivo">Currículo (PDF ou foto, até 4 MB)</Label>
        <Input id="arquivo" type="file" name="arquivo" accept={MIMES_ANEXO_ACEITOS.join(",")} />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="consentimento"
          value="true"
          required
          className="mt-0.5 size-4 rounded border-input accent-primary"
        />
        <span className="text-muted-foreground">
          Autorizo {empresaNome || "a empresa"} a guardar e usar os dados acima para este processo
          seletivo e para futuras oportunidades. Posso pedir a exclusão a qualquer momento.
        </span>
      </label>

      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Enviando..." : "Enviar inscrição"}
      </Button>
    </form>
  );
}
