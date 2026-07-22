"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Send, RefreshCw } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { updatePesquisa, alterarStatusPesquisa, salvarPerguntas, gerarConvites, enviarConvites, enviarConviteToken } from "@/lib/actions/pesquisas";
import {
  TIPOS_PERGUNTA,
  DIMENSOES_GPTW,
  statusPesquisaLabel,
  tipoPerguntaLabel,
  dimensaoGPTWLabel,
  statusTokenLabel,
} from "@/lib/constants-rh";
import type { ActionResult } from "@/lib/constants";

type Opcao = { id: string; texto: string };
type Pergunta = {
  id: string;
  enunciado: string;
  tipo: string;
  dimensaoGPTW: string | null;
  obrigatoria: boolean;
  opcoes: Opcao[];
};
type Colaborador = { id: string; nome: string };
type Token = {
  id: string;
  status: string;
  erro: string | null;
  enviadoEm: Date | null;
  colaborador: Colaborador;
};
type Pesquisa = {
  id: string;
  titulo: string;
  descricao: string | null;
  anonima: boolean;
  status: string;
  perguntas: Pergunta[];
  tokens: Token[];
};

const initialState: ActionResult = { ok: true };

export function PesquisaDetalheView({
  empresaId,
  pesquisa,
  colaboradoresAtivos,
  totalRespostas,
  mediaPorDimensao,
  mediaPorSetor,
}: {
  empresaId: string;
  pesquisa: Pesquisa;
  colaboradoresAtivos: number;
  totalRespostas: number;
  mediaPorDimensao: { dimensao: string; media: number; respostas: number }[];
  mediaPorSetor: { setor: string; media: number; respostas: number }[];
}) {
  return (
    <div className="space-y-6">
      <CabecalhoPesquisa empresaId={empresaId} pesquisa={pesquisa} />

      {pesquisa.status === "DRAFT" ? (
        <PerguntasBuilder empresaId={empresaId} pesquisa={pesquisa} />
      ) : (
        <PerguntasSomenteLeitura perguntas={pesquisa.perguntas} />
      )}

      <ConvitesSection
        empresaId={empresaId}
        pesquisa={pesquisa}
        colaboradoresAtivos={colaboradoresAtivos}
      />

      <ResultadosSection
        totalRespostas={totalRespostas}
        anonima={pesquisa.anonima}
        mediaPorDimensao={mediaPorDimensao}
        mediaPorSetor={mediaPorSetor}
      />
    </div>
  );
}

function CabecalhoPesquisa({ empresaId, pesquisa }: { empresaId: string; pesquisa: Pesquisa }) {
  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    fd.set("anonima", pesquisa.anonima ? "true" : "false");
    const result = await updatePesquisa(empresaId, pesquisa.id, prev, fd);
    if (result.ok) toast.success("Pesquisa atualizada.");
    return result;
  }, initialState);

  const proximoStatus: Record<string, string | null> = {
    DRAFT: "ACTIVE",
    ACTIVE: "FINISHED",
    FINISHED: "ARCHIVED",
    ARCHIVED: null,
  };
  const proximo = proximoStatus[pesquisa.status];

  async function avancarStatus() {
    if (!proximo) return;
    const result = await alterarStatusPesquisa(empresaId, pesquisa.id, proximo as "ACTIVE" | "FINISHED" | "ARCHIVED");
    if (result.ok) {
      toast.success(`Pesquisa marcada como "${statusPesquisaLabel(proximo)}".`);
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-base">Dados da pesquisa</CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{statusPesquisaLabel(pesquisa.status)}</Badge>
          {proximo && (
            <Button type="button" size="sm" variant="outline" onClick={avancarStatus}>
              Marcar como {statusPesquisaLabel(proximo)}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
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

function PerguntasBuilder({ empresaId, pesquisa }: { empresaId: string; pesquisa: Pesquisa }) {
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

function ConvitesSection({
  empresaId,
  pesquisa,
  colaboradoresAtivos,
}: {
  empresaId: string;
  pesquisa: Pesquisa;
  colaboradoresAtivos: number;
}) {
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  async function handleGerarConvites() {
    setPendingAction("gerar");
    const result = await gerarConvites(empresaId, pesquisa.id);
    if (result.ok) toast.success("Convites gerados.");
    else toast.error(result.error);
    setPendingAction(null);
  }

  async function handleEnviarTodos() {
    setPendingAction("enviar-todos");
    const result = await enviarConvites(empresaId, pesquisa.id);
    if (result.ok) toast.success("Convites enviados.");
    else toast.error(result.error);
    setPendingAction(null);
  }

  async function handleEnviarUm(tokenId: string) {
    setPendingAction(tokenId);
    const result = await enviarConviteToken(empresaId, tokenId);
    if (result.ok) toast.success("Convite enviado.");
    else toast.error(result.error);
    setPendingAction(null);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-base">Convites ({pesquisa.tokens.length})</CardTitle>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pesquisa.status !== "ACTIVE" || pendingAction === "gerar"}
            onClick={handleGerarConvites}
          >
            <RefreshCw className="size-4" />
            Gerar convites ({colaboradoresAtivos} colaborador(es) ativo(s))
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pesquisa.tokens.length === 0 || pendingAction === "enviar-todos"}
            onClick={handleEnviarTodos}
          >
            <Send className="size-4" />
            Enviar pendentes/falhos
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {pesquisa.status !== "ACTIVE" && (
          <p className="mb-3 text-sm text-muted-foreground">
            Ative a pesquisa para gerar e enviar convites.
          </p>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Colaborador</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Erro</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pesquisa.tokens.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  Nenhum convite gerado ainda.
                </TableCell>
              </TableRow>
            )}
            {pesquisa.tokens.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{t.colaborador.nome}</TableCell>
                <TableCell>
                  <Badge variant={t.status === "RESPONDED" ? "default" : "secondary"}>
                    {statusTokenLabel(t.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{t.erro ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={t.status === "RESPONDED" || pendingAction === t.id}
                    onClick={() => handleEnviarUm(t.id)}
                  >
                    <Send className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ResultadosSection({
  totalRespostas,
  anonima,
  mediaPorDimensao,
  mediaPorSetor,
}: {
  totalRespostas: number;
  anonima: boolean;
  mediaPorDimensao: { dimensao: string; media: number; respostas: number }[];
  mediaPorSetor: { setor: string; media: number; respostas: number }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Resultados ({totalRespostas} resposta(s))</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {anonima && (
          <p className="text-xs text-muted-foreground">
            Pesquisa anônima: os agregados abaixo nunca identificam quem respondeu.
          </p>
        )}
        {totalRespostas === 0 ? (
          <p className="text-sm text-muted-foreground">Ainda não há respostas.</p>
        ) : (
          <>
            <div className="h-72">
              <p className="mb-2 text-sm font-medium">Média por dimensão GPTW</p>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={mediaPorDimensao} margin={{ left: 0, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="dimensao" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => Number(v).toFixed(2)} />
                  <Bar dataKey="media" name="Média" fill="var(--chart-2)" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="h-72">
              <p className="mb-2 text-sm font-medium">Média por setor</p>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={mediaPorSetor} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="setor" type="category" tick={{ fontSize: 12 }} width={100} />
                  <Tooltip formatter={(v) => Number(v).toFixed(2)} />
                  <Bar dataKey="media" name="Média" fill="var(--chart-4)" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
