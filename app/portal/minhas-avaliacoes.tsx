"use client";

import { useActionState, useState, startTransition } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { adicionarPessoaParaAvaliar, salvarMinhaAvaliacao } from "@/lib/actions/portal-avaliacao";
import { NIVEIS_POTENCIAL } from "@/lib/constants-avaliacao";
import type { OpcaoCatalogo } from "@/lib/catalogos";
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
  competenciasDisponiveis: OpcaoCatalogo[];
};

export type EquipeDoGerente = {
  /** Nome do ciclo aberto na empresa, ou null quando não há nenhum. */
  cicloAberto: string | null;
  candidatos: { id: string; nome: string; setor: string; empresa: string }[];
};

const comoAvalio: Record<string, string> = {
  GESTOR: "como gestor",
  PAR: "como colega de equipe",
  SUBORDINADO: "como liderado",
};

export function MinhasAvaliacoes({
  avaliacoes: recebidas,
  equipe,
}: {
  avaliacoes: MinhaAvaliacao[];
  equipe: EquipeDoGerente | null;
}) {
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
          {avaliacoes.length === 0
            ? "Sua lista está vazia. Comece incluindo as pessoas que você avalia."
            : pendentes === 0
              ? "Você respondeu tudo. Obrigado! Dá para revisar suas respostas enquanto o ciclo estiver aberto."
              : `${pendentes} avaliação(ões) esperando por você. São 6 notas e um espaço para comentar — leva uns 3 minutos cada.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {equipe && <IncluirNaEquipe equipe={equipe} />}
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

/**
 * Inclusão de gente na equipe do gerente. Fica dentro da própria aba, acima da
 * lista: quem abre o portal para avaliar é quem sabe quem falta ali.
 */
function IncluirNaEquipe({ equipe }: { equipe: EquipeDoGerente }) {
  const [escolhido, setEscolhido] = useState("");
  const [busca, setBusca] = useState("");
  const [incluindo, setIncluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // São 200+ nomes do grupo inteiro. Sem filtro, achar alguém no seletor do
  // celular é rolagem cega.
  const termo = busca.trim().toLowerCase();
  const candidatos = termo
    ? equipe.candidatos.filter((c) => c.nome.toLowerCase().includes(termo))
    : equipe.candidatos;

  if (!equipe.cicloAberto) {
    return (
      <Alert>
        <AlertDescription>
          Não há ciclo de avaliação aberto na sua empresa no momento. Quando o RH abrir, suas
          pessoas aparecem aqui.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <p className="text-sm font-medium">Quem mais você avalia?</p>
      <p className="text-xs text-muted-foreground">
        Inclua as pessoas da sua equipe, de qualquer empresa do grupo. Cada uma entra na sua lista e
        recebe também a própria autoavaliação. Incluiu errado? O RH remove.
      </p>
      <Input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por nome"
        className="h-11"
      />
      <div className="flex gap-2">
        <select
          value={escolhido}
          onChange={(e) => {
            setEscolhido(e.target.value);
            setErro(null);
          }}
          className="h-11 min-w-0 flex-1 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">
            {termo && candidatos.length === 0 ? "Ninguém com esse nome" : "Escolha a pessoa"}
          </option>
          {candidatos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome} · {c.setor} ({c.empresa})
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="lg"
          variant="outline"
          disabled={!escolhido || incluindo}
          onClick={async () => {
            setIncluindo(true);
            const r = await adicionarPessoaParaAvaliar(escolhido);
            setIncluindo(false);
            if (r.ok) {
              toast.success("Pessoa incluída na sua lista.");
              setEscolhido("");
              setErro(null);
            } else {
              setErro(r.error ?? "Não foi possível incluir.");
            }
          }}
        >
          <UserPlus className="size-4" />
          {incluindo ? "Incluindo..." : "Incluir"}
        </Button>
      </div>
      {equipe.candidatos.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Todo mundo da sua empresa já está na sua lista.
        </p>
      )}
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}
    </div>
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
        {avaliacao.competenciasDisponiveis.map((c) => (
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
            className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm"
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
