"use client";

import { useActionState, useState, startTransition } from "react";
import { toast } from "sonner";
import { Check, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { salvarMinhaAvaliacao } from "@/lib/actions/portal-avaliacao";
import { COMPETENCIAS, NIVEIS_POTENCIAL } from "@/lib/constants-avaliacao";
import type { ActionResult } from "@/lib/constants";

const inicial: ActionResult = { ok: true };

// A escala é a mesma nota de 1 a 5 do preenchimento interno. A diferença é que
// aqui quem responde não é do RH: sem uma legenda do que cada número quer
// dizer, 3 vira "não sei" e a régua muda de pessoa para pessoa.
const ESCALA = [
  { nota: 1, rotulo: "Muito abaixo do esperado" },
  { nota: 2, rotulo: "Abaixo do esperado" },
  { nota: 3, rotulo: "Atende ao esperado" },
  { nota: 4, rotulo: "Acima do esperado" },
  { nota: 5, rotulo: "Muito acima do esperado" },
];

export type MinhaAvaliacao = {
  id: string;
  tipoAvaliador: string;
  status: string;
  potencial: string | null;
  pontosFortes: string | null;
  pontosDesenvolvimento: string | null;
  comentarios: string | null;
  avaliado: string;
  souEu: boolean;
  ciclo: { nome: string; dataFim: Date };
  notas: { competencia: string; nota: number }[];
};

const comoAvalio: Record<string, string> = {
  GESTOR: "como gestor",
  PAR: "como colega de equipe",
  SUBORDINADO: "como liderado",
};

export function MinhasAvaliacoes({ avaliacoes: recebidas }: { avaliacoes: MinhaAvaliacao[] }) {
  // O que falta responder primeiro, e a própria antes das dos outros: quem tem
  // dez pessoas na equipe rola a lista até o fim e esquece a própria.
  const avaliacoes = [...recebidas].sort(
    (a, b) =>
      Number(a.status === "CONCLUIDA") - Number(b.status === "CONCLUIDA") ||
      Number(b.souEu) - Number(a.souEu) ||
      a.avaliado.localeCompare(b.avaliado, "pt-BR"),
  );

  const [aberta, setAberta] = useState<string | null>(
    // Uma pendência só: abre direto. Duas ou mais viram lista — abrir todas de
    // uma vez esconde quantas ainda faltam.
    avaliacoes.filter((a) => a.status !== "CONCLUIDA").length === 1
      ? (avaliacoes.find((a) => a.status !== "CONCLUIDA")?.id ?? null)
      : null,
  );

  const pendentes = avaliacoes.filter((a) => a.status !== "CONCLUIDA").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Avaliação de desempenho</CardTitle>
        <CardDescription>
          {pendentes === 0
            ? "Você respondeu tudo. Obrigado! Dá para revisar suas respostas enquanto o ciclo estiver aberto."
            : `${pendentes} avaliação(ões) esperando por você. São 6 notas e um espaço para comentar — leva uns 3 minutos cada.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {avaliacoes.map((a) => {
          const concluida = a.status === "CONCLUIDA";
          const estaAberta = aberta === a.id;
          return (
            <div key={a.id} className="rounded-lg border">
              <button
                type="button"
                onClick={() => setAberta(estaAberta ? null : a.id)}
                className="flex w-full items-center gap-3 p-3 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {a.souEu ? "Sua autoavaliação" : a.avaliado}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {a.souEu ? "Como você avalia o próprio trabalho" : comoAvalio[a.tipoAvaliador] ?? "avaliação"}
                  </span>
                </span>
                <Badge variant={concluida ? "default" : "secondary"}>
                  {concluida ? (
                    <>
                      <Check className="size-3" />
                      Respondida
                    </>
                  ) : (
                    "Responder"
                  )}
                </Badge>
                <ChevronDown
                  className={`size-4 shrink-0 text-muted-foreground transition-transform ${estaAberta ? "rotate-180" : ""}`}
                />
              </button>
              {estaAberta && (
                <div className="border-t p-3">
                  <FormularioAvaliacao avaliacao={a} onSalvou={() => setAberta(null)} />
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function FormularioAvaliacao({
  avaliacao,
  onSalvou,
}: {
  avaliacao: MinhaAvaliacao;
  onSalvou: () => void;
}) {
  const [estado, acao, salvando] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const r = await salvarMinhaAvaliacao(avaliacao.id, prev, fd);
    if (r.ok) {
      toast.success("Avaliação enviada. Obrigado!");
      onSalvou();
    }
    return r;
  }, inicial);

  const notaDe = (competencia: string) =>
    avaliacao.notas.find((n) => n.competencia === competencia)?.nota ?? null;

  return (
    // Mesmo motivo do cadastro: com `action={...}` o React 19 limpa o
    // formulário quando a ação devolve erro, e quem deu seis notas e escreveu
    // três parágrafos perderia tudo por causa de um campo em branco.
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        startTransition(() => acao(dados));
      }}
      className="space-y-5"
    >
      <p className="text-xs text-muted-foreground">
        Sua resposta vai para o RH e para a gestão.{" "}
        {avaliacao.souEu
          ? "Na autoavaliação, responda pensando no seu próprio trabalho no semestre."
          : "Responda pensando no trabalho da pessoa no semestre, não em um episódio isolado."}
      </p>

      <div className="space-y-4">
        {COMPETENCIAS.map((c) => (
          <div key={c.value} className="space-y-1.5">
            <Label className="text-sm font-medium">{c.label}</Label>
            <div className="flex gap-1.5">
              {ESCALA.map((e) => (
                <label key={e.nota} className="flex-1" title={e.rotulo}>
                  <input
                    type="radio"
                    name={`nota_${c.value}`}
                    value={e.nota}
                    defaultChecked={notaDe(c.value) === e.nota}
                    className="peer sr-only"
                  />
                  <span className="flex h-11 cursor-pointer items-center justify-center rounded-md border text-sm font-medium tabular-nums transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground">
                    {e.nota}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <ul className="space-y-0.5 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
        {ESCALA.map((e) => (
          <li key={e.nota}>
            <span className="font-medium tabular-nums">{e.nota}</span> — {e.rotulo}
          </li>
        ))}
      </ul>

      {avaliacao.tipoAvaliador === "GESTOR" && (
        <div className="space-y-1.5">
          <Label htmlFor={`potencial-${avaliacao.id}`} className="text-sm font-medium">
            Potencial de crescimento
          </Label>
          <select
            id={`potencial-${avaliacao.id}`}
            name="potencial"
            defaultValue={avaliacao.potencial ?? ""}
            className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm dark:bg-input/30"
          >
            <option value="">Prefiro não informar</option>
            {NIVEIS_POTENCIAL.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Quanto a pessoa pode crescer daqui para frente — é diferente de como ela vai hoje.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`fortes-${avaliacao.id}`} className="text-sm font-medium">
          Pontos fortes
        </Label>
        <Textarea
          id={`fortes-${avaliacao.id}`}
          name="pontosFortes"
          rows={3}
          defaultValue={avaliacao.pontosFortes ?? ""}
          placeholder={avaliacao.souEu ? "O que você faz bem?" : "O que essa pessoa faz bem?"}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`desenvolver-${avaliacao.id}`} className="text-sm font-medium">
          Pontos a desenvolver
        </Label>
        <Textarea
          id={`desenvolver-${avaliacao.id}`}
          name="pontosDesenvolvimento"
          rows={3}
          defaultValue={avaliacao.pontosDesenvolvimento ?? ""}
          placeholder="O que pode melhorar no próximo semestre?"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`comentarios-${avaliacao.id}`} className="text-sm font-medium">
          Comentários
        </Label>
        <Textarea
          id={`comentarios-${avaliacao.id}`}
          name="comentarios"
          rows={3}
          defaultValue={avaliacao.comentarios ?? ""}
          placeholder="Opcional"
        />
      </div>

      {!estado.ok && estado.error && (
        <Alert variant="destructive">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={salvando}>
        {salvando ? "Enviando..." : avaliacao.status === "CONCLUIDA" ? "Salvar alterações" : "Enviar avaliação"}
      </Button>
    </form>
  );
}
