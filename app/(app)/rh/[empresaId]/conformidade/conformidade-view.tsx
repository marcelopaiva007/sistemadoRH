"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useActionState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { definirRequisitoNR, removerRequisitoNR } from "@/lib/actions/rh-sst";
import { NORMAS_REGULAMENTADORAS, validadePadraoDaNorma } from "@/lib/constants-sst";
import { SITUACAO_LABEL, type ConformidadeColaborador, type SituacaoExame, type SituacaoItem } from "@/lib/conformidade";
import type { ActionResult } from "@/lib/constants";
import { Indicador } from "@/components/indicador";

type Posicao = {
  id: string;
  nome: string;
  requisitosNR: { id: string; norma: string; validadeMeses: number | null; observacoes: string | null }[];
};

type Linha = {
  id: string;
  nome: string;
  empresaId: string;
  empresaNome: string;
  posicaoNome: string;
  setorNome: string;
  conformidade: ConformidadeColaborador;
  situacaoExame: SituacaoExame;
};

const VARIANTE: Record<SituacaoItem, "default" | "secondary" | "destructive" | "outline"> = {
  EM_DIA: "default",
  VENCENDO: "secondary",
  VENCIDO: "destructive",
  NUNCA_FEITO: "destructive",
};

const estadoInicial: ActionResult = { ok: true };

export function ConformidadeView({
  empresaId,
  posicoes,
  linhas,
  resumo,
}: {
  empresaId: string;
  posicoes: Posicao[];
  linhas: Linha[];
  resumo: {
    totalColaboradores: number;
    totalComRequisito: number;
    regularesNR: number;
    totalComExameExigivel: number;
    examesEmDia: number;
  };
}) {
  const [filtro, setFiltro] = useState<"todos" | "irregulares">("irregulares");

  const linhasFiltradas = useMemo(() => {
    const ordenadas = [...linhas].sort((a, b) => {
      const pesoA = (a.conformidade.regular ? 0 : 1) + (a.situacaoExame.situacao === "VENCIDO" || a.situacaoExame.situacao === "NUNCA_FEITO" ? 1 : 0);
      const pesoB = (b.conformidade.regular ? 0 : 1) + (b.situacaoExame.situacao === "VENCIDO" || b.situacaoExame.situacao === "NUNCA_FEITO" ? 1 : 0);
      return pesoB - pesoA || a.nome.localeCompare(b.nome);
    });
    if (filtro === "todos") return ordenadas;
    return ordenadas.filter(
      (l) =>
        !l.conformidade.regular ||
        l.situacaoExame.situacao === "VENCIDO" ||
        l.situacaoExame.situacao === "NUNCA_FEITO",
    );
  }, [linhas, filtro]);

  const percentualNR = resumo.totalComRequisito > 0 ? Math.round((resumo.regularesNR / resumo.totalComRequisito) * 100) : null;
  const percentualExame = resumo.totalComExameExigivel > 0 ? Math.round((resumo.examesEmDia / resumo.totalComExameExigivel) * 100) : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Conformidade — Saúde e Segurança</h2>
        <p className="text-sm text-muted-foreground">
          O que cada função exige (matriz de NRs) e quem está com o treinamento ou o ASO vencido.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Indicador
          rotulo="Colaboradores ativos"
          valor={`${resumo.totalColaboradores}`}
        />
        <Indicador
          rotulo="Em dia com as NRs da função"
          valor={percentualNR === null ? "—" : `${percentualNR}%`}
          complemento={resumo.totalComRequisito > 0 ? `${resumo.regularesNR}/${resumo.totalComRequisito}` : "nenhuma NR exigida ainda"}
          estado={percentualNR !== null && percentualNR < 100 ? "alerta" : "padrao"}
        />
        <Indicador
          rotulo="ASO em dia"
          valor={percentualExame === null ? "—" : `${percentualExame}%`}
          complemento={`${resumo.examesEmDia}/${resumo.totalComExameExigivel}`}
          estado={percentualExame !== null && percentualExame < 100 ? "alerta" : "padrao"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Matriz de exigências por função</CardTitle>
          <CardDescription>
            Quais NRs cada função precisa e de quanto em quanto tempo a reciclagem vence. Some uma
            função aqui para ela entrar no cálculo de conformidade.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {posicoes.map((posicao) => (
            <MatrizPosicao key={posicao.id} empresaId={empresaId} posicao={posicao} />
          ))}
          {posicoes.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nenhuma função ativa cadastrada nesta empresa.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Situação por colaborador</CardTitle>
          <CardDescription>
            <div className="flex flex-wrap items-center gap-2">
              <span>Cruzamento da matriz acima com o que cada pessoa comprovou.</span>
              <div className="ml-auto flex gap-1">
                <Button
                  variant={filtro === "irregulares" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFiltro("irregulares")}
                >
                  Só irregulares
                </Button>
                <Button variant={filtro === "todos" ? "default" : "outline"} size="sm" onClick={() => setFiltro("todos")}>
                  Todos
                </Button>
              </div>
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {linhasFiltradas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {filtro === "irregulares" ? "Ninguém irregular no momento." : "Nenhum colaborador ativo."}
            </p>
          ) : (
            <div className="rounded-md border">
              <Table compacta>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Setor / Função</TableHead>
                    <TableHead>NRs pendentes</TableHead>
                    <TableHead>ASO</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhasFiltradas.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <Link href={`/rh/${l.empresaId}/colaboradores/${l.id}`} className="font-medium hover:underline">
                          {l.nome}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{l.empresaNome}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {l.setorNome} · {l.posicaoNome}
                      </TableCell>
                      <TableCell>
                        {l.conformidade.pendencias.length === 0 ? (
                          <span className="text-muted-foreground">
                            {l.conformidade.itens.length === 0 ? "sem exigência" : "em dia"}
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {l.conformidade.pendencias.map((p) => (
                              <Badge key={p.norma} variant={VARIANTE[p.situacao]}>
                                {p.norma} · {SITUACAO_LABEL[p.situacao]}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={VARIANTE[l.situacaoExame.situacao]}>
                          {SITUACAO_LABEL[l.situacaoExame.situacao]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MatrizPosicao({ empresaId, posicao }: { empresaId: string; posicao: Posicao }) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{posicao.nome}</h3>
        <Button variant="outline" size="sm" onClick={() => setAberto((v) => !v)}>
          <Plus className="size-4" />
          Adicionar NR
        </Button>
      </div>

      {posicao.requisitosNR.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Nenhuma NR exigida para esta função.</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {posicao.requisitosNR.map((r) => (
            <span
              key={r.id}
              className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 py-1 pr-1 pl-3 text-sm"
              title={r.observacoes ?? undefined}
            >
              <span className="font-medium">{r.norma}</span>
              <span className="text-xs text-muted-foreground">
                {r.validadeMeses ? `recicla a cada ${r.validadeMeses}m` : "sem reciclagem"}
              </span>
              <button
                type="button"
                aria-label={`Remover ${r.norma}`}
                className="rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={async () => {
                  const resultado = await removerRequisitoNR(empresaId, r.id);
                  if (resultado.ok) toast.success("Removido.");
                  else toast.error(resultado.error);
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {aberto && <FormularioRequisito empresaId={empresaId} posicaoId={posicao.id} onSuccess={() => setAberto(false)} />}
    </div>
  );
}

function FormularioRequisito({
  empresaId,
  posicaoId,
  onSuccess,
}: {
  empresaId: string;
  posicaoId: string;
  onSuccess: () => void;
}) {
  const [norma, setNorma] = useState("");
  const [validadeMeses, setValidadeMeses] = useState("");

  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const resultado = await definirRequisitoNR(empresaId, prev, fd);
    if (resultado.ok) {
      toast.success("NR adicionada à função.");
      setNorma("");
      setValidadeMeses("");
      onSuccess();
    }
    return resultado;
  }, estadoInicial);

  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
      <input type="hidden" name="posicaoId" value={posicaoId} />
      <div className="min-w-48 space-y-1">
        <label className="text-xs text-muted-foreground">Norma</label>
        <select
          name="norma"
          required
          value={norma}
          onChange={(e) => {
            setNorma(e.target.value);
            const padrao = validadePadraoDaNorma(e.target.value);
            setValidadeMeses(padrao ? String(padrao) : "");
          }}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <option value="">Selecione</option>
          {NORMAS_REGULAMENTADORAS.map((n) => (
            <option key={n.value} value={n.value}>
              {n.label}
            </option>
          ))}
        </select>
      </div>
      <div className="w-40 space-y-1">
        <label className="text-xs text-muted-foreground">Recicla a cada (meses)</label>
        <Input
          name="validadeMeses"
          type="number"
          min={0}
          max={120}
          placeholder="sem reciclagem"
          value={validadeMeses}
          onChange={(e) => setValidadeMeses(e.target.value)}
        />
      </div>
      <Button type="submit" size="sm" disabled={isPending || !norma}>
        {isPending ? "Salvando..." : "Adicionar"}
      </Button>
      {!state.ok && (
        <Alert variant="destructive" className="w-full">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}

