"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { salvarPerguntas } from "@/lib/actions/pesquisas";
import { DIMENSOES_NR01, type DimensaoNR01 } from "@/lib/nr01-modelo";
import {
  TIPOS_PERGUNTA,
  DIMENSOES_GPTW,
  tipoPerguntaLabel,
  dimensaoGPTWLabel,
} from "@/lib/constants-rh";
import type { ActionResult } from "@/lib/constants";
import type { Pergunta, PesquisaBase } from "./tipos";

const initialState: ActionResult = { ok: true };

/**
 * Tela das perguntas.
 *
 * Editável só enquanto a pesquisa é rascunho, e nunca no modelo NR-01 — as 35
 * perguntas são fixas por norma. Nos demais casos é leitura: mexer no
 * questionário depois de o convite sair invalidaria o que já foi respondido.
 */
export function PerguntasView({
  empresaId,
  pesquisa,
}: {
  empresaId: string;
  pesquisa: PesquisaBase & { perguntas: Pergunta[] };
}) {
  if (pesquisa.status === "DRAFT" && pesquisa.modelo !== "NR01") {
    return <PerguntasBuilder empresaId={empresaId} pesquisa={pesquisa} />;
  }
  return <PerguntasSomenteLeitura perguntas={pesquisa.perguntas} />;
}

function PerguntasSomenteLeitura({ perguntas }: { perguntas: Pergunta[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Perguntas ({perguntas.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {perguntas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma pergunta cadastrada.</p>}
        {perguntas.map((p, i) => (
          <div key={p.id} className="rounded-md border p-3 text-sm">
            <p className="font-medium">
              {i + 1}. {p.enunciado}
            </p>
            <p className="text-muted-foreground">
              {tipoPerguntaLabel(p.tipo)}
              {p.dimensaoGPTW ? ` · ${dimensaoGPTWLabel(p.dimensaoGPTW)}` : ""}
              {p.dimensao && p.dimensao in DIMENSOES_NR01
                ? ` · ${DIMENSOES_NR01[p.dimensao as DimensaoNR01].label}${p.invertida ? " (fator de proteção)" : " (fator de risco)"}`
                : ""}
              {p.obrigatoria ? " · obrigatória" : ""}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

type PerguntaRascunho = {
  enunciado: string;
  tipo: string;
  dimensaoGPTW: string;
  obrigatoria: boolean;
  opcoes: string[];
};

function perguntaParaRascunho(p: Pergunta): PerguntaRascunho {
  return {
    enunciado: p.enunciado,
    tipo: p.tipo,
    dimensaoGPTW: p.dimensaoGPTW ?? "",
    obrigatoria: p.obrigatoria,
    opcoes: p.opcoes.map((o) => o.texto),
  };
}

function PerguntasBuilder({
  empresaId,
  pesquisa,
}: {
  empresaId: string;
  pesquisa: PesquisaBase & { perguntas: Pergunta[] };
}) {
  const [perguntas, setPerguntas] = useState<PerguntaRascunho[]>(
    pesquisa.perguntas.length > 0
      ? pesquisa.perguntas.map(perguntaParaRascunho)
      : [{ enunciado: "", tipo: "LIKERT_5", dimensaoGPTW: "GERAL", obrigatoria: true, opcoes: [] }]
  );

  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const payload = perguntas
      .filter((p) => p.enunciado.trim().length > 0)
      .map((p) => ({
        enunciado: p.enunciado.trim(),
        tipo: p.tipo,
        dimensaoGPTW: p.dimensaoGPTW || null,
        obrigatoria: p.obrigatoria,
        opcoes: p.tipo === "MULTIPLE_CHOICE" ? p.opcoes.filter((o) => o.trim()).map((texto) => ({ texto })) : [],
      }));
    fd.set("perguntasJson", JSON.stringify(payload));
    const result = await salvarPerguntas(empresaId, pesquisa.id, prev, fd);
    if (result.ok) toast.success("Perguntas salvas.");
    return result;
  }, initialState);

  function atualizarPergunta(index: number, patch: Partial<PerguntaRascunho>) {
    setPerguntas((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function adicionarPergunta() {
    setPerguntas((prev) => [
      ...prev,
      { enunciado: "", tipo: "LIKERT_5", dimensaoGPTW: "GERAL", obrigatoria: true, opcoes: [] },
    ]);
  }

  function removerPergunta(index: number) {
    setPerguntas((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Perguntas</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {perguntas.map((p, index) => (
            <div key={index} className="space-y-3 rounded-md border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 space-y-2">
                  <Label>Enunciado</Label>
                  <Textarea
                    rows={2}
                    value={p.enunciado}
                    onChange={(e) => atualizarPergunta(index, { enunciado: e.target.value })}
                    placeholder="Ex: Os gestores mantêm a equipe informada sobre assuntos importantes."
                  />
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => removerPergunta(index)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select
                    value={p.tipo}
                    onValueChange={(v) => atualizarPergunta(index, { tipo: v ?? "LIKERT_5" })}
                    items={Object.fromEntries(TIPOS_PERGUNTA.map((t) => [t.value, t.label]))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_PERGUNTA.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Dimensão GPTW</Label>
                  <Select
                    value={p.dimensaoGPTW}
                    onValueChange={(v) => atualizarPergunta(index, { dimensaoGPTW: v ?? "" })}
                    items={Object.fromEntries(DIMENSOES_GPTW.map((d) => [d.value, d.label]))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Nenhuma" />
                    </SelectTrigger>
                    <SelectContent>
                      {DIMENSOES_GPTW.map((d) => (
                        <SelectItem key={d.value} value={d.value}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Checkbox
                    id={`obrigatoria-${index}`}
                    checked={p.obrigatoria}
                    onCheckedChange={(v) => atualizarPergunta(index, { obrigatoria: v === true })}
                  />
                  <Label htmlFor={`obrigatoria-${index}`} className="font-normal">
                    Obrigatória
                  </Label>
                </div>
              </div>
              {p.tipo === "MULTIPLE_CHOICE" && (
                <div className="space-y-2">
                  <Label>Opções</Label>
                  {p.opcoes.map((o, oi) => (
                    <div key={oi} className="flex gap-2">
                      <Input
                        value={o}
                        onChange={(e) =>
                          atualizarPergunta(index, {
                            opcoes: p.opcoes.map((v, i) => (i === oi ? e.target.value : v)),
                          })
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => atualizarPergunta(index, { opcoes: p.opcoes.filter((_, i) => i !== oi) })}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => atualizarPergunta(index, { opcoes: [...p.opcoes, ""] })}
                  >
                    <Plus className="size-4" />
                    Adicionar opção
                  </Button>
                </div>
              )}
            </div>
          ))}

          <Button type="button" variant="outline" onClick={adicionarPergunta}>
            <Plus className="size-4" />
            Adicionar pergunta
          </Button>

          {!state.ok && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <div>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : "Salvar perguntas"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
