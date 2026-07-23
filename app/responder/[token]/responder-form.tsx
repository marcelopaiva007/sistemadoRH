"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { responderPesquisa } from "@/lib/actions/pesquisas-publico";
import type { ActionResult } from "@/lib/constants";

type Opcao = { id: string; texto: string };
type Pergunta = {
  id: string;
  enunciado: string;
  tipo: string;
  obrigatoria: boolean;
  opcoes: Opcao[];
};
type Pesquisa = { id: string; titulo: string; descricao: string | null; perguntas: Pergunta[] };

type RespostaItem = { valorNumerico?: number; valorTexto?: string; opcaoId?: string };

const initialState: ActionResult = { ok: true };
const LIKERT_LABELS = ["Discordo totalmente", "Discordo", "Neutro", "Concordo", "Concordo totalmente"];
// Escala de frequência da avaliação NR-01 (riscos psicossociais): 0 a 4.
const FREQ_LABELS = ["Nunca", "Raramente", "Às vezes", "Frequentemente", "Sempre"];

export function ResponderForm({ token, pesquisa }: { token: string; pesquisa: Pesquisa }) {
  const [respostas, setRespostas] = useState<Record<string, RespostaItem>>({});
  const [enviado, setEnviado] = useState(false);

  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const itens = pesquisa.perguntas
      .filter((p) => respostas[p.id])
      .map((p) => ({ perguntaId: p.id, ...respostas[p.id] }));
    fd.set("itensJson", JSON.stringify(itens));
    const result = await responderPesquisa(token, prev, fd);
    if (result.ok) setEnviado(true);
    return result;
  }, initialState);

  if (enviado) {
    return <p className="text-center text-muted-foreground">Resposta enviada. Obrigado pela participação!</p>;
  }

  return (
    <form action={formAction} className="space-y-6">
      <div className="text-center">
        <h1 className="text-xl font-semibold tracking-tight">{pesquisa.titulo}</h1>
        {pesquisa.descricao && <p className="mt-1 text-sm text-muted-foreground">{pesquisa.descricao}</p>}
      </div>

      {pesquisa.perguntas.map((pergunta, index) => (
        <div key={pergunta.id} className="space-y-3 rounded-md border p-4">
          <Label className="text-sm font-medium">
            {index + 1}. {pergunta.enunciado}
            {pergunta.obrigatoria && <span className="text-destructive"> *</span>}
          </Label>

          {pergunta.tipo === "LIKERT_5" && (
            <RadioGroup
              value={respostas[pergunta.id]?.valorNumerico?.toString() ?? ""}
              onValueChange={(v) =>
                setRespostas((prev) => ({ ...prev, [pergunta.id]: { valorNumerico: Number(v) } }))
              }
              className="gap-2"
            >
              {[1, 2, 3, 4, 5].map((valor) => (
                <div key={valor} className="flex items-center gap-2">
                  <RadioGroupItem value={String(valor)} id={`${pergunta.id}-${valor}`} />
                  <Label htmlFor={`${pergunta.id}-${valor}`} className="font-normal">
                    {valor} — {LIKERT_LABELS[valor - 1]}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          )}

          {pergunta.tipo === "FREQ_0_4" && (
            <RadioGroup
              value={respostas[pergunta.id]?.valorNumerico?.toString() ?? ""}
              onValueChange={(v) =>
                setRespostas((prev) => ({ ...prev, [pergunta.id]: { valorNumerico: Number(v) } }))
              }
              className="gap-2"
            >
              {[0, 1, 2, 3, 4].map((valor) => (
                <div key={valor} className="flex items-center gap-2">
                  <RadioGroupItem value={String(valor)} id={`${pergunta.id}-${valor}`} />
                  <Label htmlFor={`${pergunta.id}-${valor}`} className="font-normal">
                    {valor} — {FREQ_LABELS[valor]}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          )}

          {pergunta.tipo === "NPS_10" && (
            <RadioGroup
              value={respostas[pergunta.id]?.valorNumerico?.toString() ?? ""}
              onValueChange={(v) =>
                setRespostas((prev) => ({ ...prev, [pergunta.id]: { valorNumerico: Number(v) } }))
              }
              className="grid grid-cols-6 gap-2 sm:grid-cols-11"
            >
              {Array.from({ length: 11 }, (_, v) => v).map((valor) => (
                <div key={valor} className="flex flex-col items-center gap-1">
                  <RadioGroupItem value={String(valor)} id={`${pergunta.id}-${valor}`} />
                  <Label htmlFor={`${pergunta.id}-${valor}`} className="font-normal text-xs">
                    {valor}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          )}

          {pergunta.tipo === "MULTIPLE_CHOICE" && (
            <RadioGroup
              value={respostas[pergunta.id]?.opcaoId ?? ""}
              onValueChange={(v) => setRespostas((prev) => ({ ...prev, [pergunta.id]: { opcaoId: v ?? undefined } }))}
              className="gap-2"
            >
              {pergunta.opcoes.map((opcao) => (
                <div key={opcao.id} className="flex items-center gap-2">
                  <RadioGroupItem value={opcao.id} id={opcao.id} />
                  <Label htmlFor={opcao.id} className="font-normal">
                    {opcao.texto}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          )}

          {pergunta.tipo === "TEXT" && (
            <Textarea
              rows={3}
              value={respostas[pergunta.id]?.valorTexto ?? ""}
              onChange={(e) =>
                setRespostas((prev) => ({ ...prev, [pergunta.id]: { valorTexto: e.target.value } }))
              }
            />
          )}
        </div>
      ))}

      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Enviando..." : "Enviar respostas"}
      </Button>
    </form>
  );
}
