"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { updatePesquisa } from "@/lib/actions/pesquisas";
import type { ActionResult } from "@/lib/constants";
import type { PesquisaBase } from "./tipos";

const initialState: ActionResult = { ok: true };

export function DadosPesquisaForm({
  empresaId,
  pesquisa,
}: {
  empresaId: string;
  pesquisa: PesquisaBase;
}) {
  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    // Não reenvia `anonima`: updatePesquisa ignora o campo de propósito.
    const result = await updatePesquisa(empresaId, pesquisa.id, prev, fd);
    if (result.ok) toast.success("Pesquisa atualizada.");
    return result;
  }, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="titulo">Título</Label>
        <Input id="titulo" name="titulo" defaultValue={pesquisa.titulo} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="descricao">Descrição</Label>
        <Textarea id="descricao" name="descricao" rows={2} defaultValue={pesquisa.descricao ?? ""} />
      </div>
      <p className="text-sm text-muted-foreground">
        Anônima: {pesquisa.anonima ? "sim" : "não"} — respostas de pesquisas anônimas nunca
        identificam o colaborador, só um snapshot de setor/posição.
      </p>
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? "Salvando..." : "Salvar"}
      </Button>
    </form>
  );
}
