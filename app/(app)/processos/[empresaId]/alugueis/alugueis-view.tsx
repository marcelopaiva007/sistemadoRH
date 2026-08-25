"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleDollarSign, RotateCcw, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Indicador } from "@/components/indicador";
import { formatarReais } from "@/lib/constants-beneficios";
import {
  desfazerRecebimento,
  gerarParcelas,
  registrarRecebimento,
} from "@/lib/actions/processos-alugueis";

type Parcela = {
  id: string;
  competencia: string;
  vencimentoTexto: string;
  vencimentoInput: string;
  vencido: boolean;
  valorPrevisto: number;
  recebido: boolean;
  recebidoEmTexto: string;
  valorRecebido: number | null;
};

export type ContratoDeAluguel = {
  id: string;
  empresaId: string;
  empresaNome: string;
  numero: string;
  titulo: string;
  status: string;
  inquilino: string;
  valorMensal: number | null;
  diaVencimentoSugerido: number | null;
  podeEstender: boolean;
  parcelas: Parcela[];
};

const CAMPO = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm";

export function AlugueisView({ empresaId, contratos }: { empresaId: string; contratos: ContratoDeAluguel[] }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [receber, setReceber] = useState<{ id: string; data: string; valor: string } | null>(null);
  const [diaVenc, setDiaVenc] = useState<Record<string, string>>({});

  // O resumo do que a tela mostra, somando todas as parcelas visíveis.
  const resumo = useMemo(() => {
    let aReceber = 0;
    let emAtraso = 0;
    let recebido = 0;
    let qtdAtraso = 0;
    for (const c of contratos) {
      for (const p of c.parcelas) {
        if (p.recebido) recebido += p.valorRecebido ?? p.valorPrevisto;
        else {
          aReceber += p.valorPrevisto;
          if (p.vencido) {
            emAtraso += p.valorPrevisto;
            qtdAtraso++;
          }
        }
      }
    }
    return { aReceber, emAtraso, recebido, qtdAtraso };
  }, [contratos]);

  function gerar(contrato: ContratoDeAluguel) {
    const dia = Number(diaVenc[contrato.id] ?? "");
    if (!dia || dia < 1 || dia > 31) {
      setErro("Escolha o dia de vencimento (1 a 31) antes de gerar as parcelas.");
      return;
    }
    setErro(null);
    setAviso(null);
    iniciar(async () => {
      const r = await gerarParcelas({ empresaId, contratoId: contrato.id, diaVencimento: dia });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setAviso(`${r.criadas ?? 0} parcela(s) geradas para o contrato ${contrato.numero}.`);
      router.refresh();
    });
  }

  function confirmarRecebimento() {
    if (!receber) return;
    setErro(null);
    iniciar(async () => {
      const r = await registrarRecebimento({
        empresaId,
        id: receber.id,
        recebidoEm: receber.data,
        valorRecebido: receber.valor ? Number(receber.valor.replace(",", ".")) : null,
      });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setReceber(null);
      router.refresh();
    });
  }

  function desfazer(id: string) {
    setErro(null);
    iniciar(async () => {
      const r = await desfazerRecebimento({ empresaId, id });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {erro && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="rounded-md border border-emerald-600/40 bg-emerald-600/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          {aviso}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Indicador rotulo="A receber (em aberto)" valor={formatarReais(resumo.aReceber)} />
        <Indicador
          icone={resumo.qtdAtraso > 0 ? <span className="text-destructive">●</span> : undefined}
          rotulo="Em atraso"
          valor={formatarReais(resumo.emAtraso)}
        />
        <Indicador rotulo="Recebido" valor={formatarReais(resumo.recebido)} />
      </div>

      {receber && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Registrar recebimento</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-muted-foreground">
              Recebido em
              <input
                type="date"
                value={receber.data}
                onChange={(e) => setReceber({ ...receber, data: e.target.value })}
                className={CAMPO}
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Valor recebido (R$)
              <input
                type="number"
                step="0.01"
                value={receber.valor}
                onChange={(e) => setReceber({ ...receber, valor: e.target.value })}
                className={CAMPO}
              />
              <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                Em branco = o valor previsto da parcela.
              </span>
            </label>
            <div className="flex items-end gap-2 sm:col-span-2">
              <Button size="sm" disabled={pendente} onClick={confirmarRecebimento}>Confirmar</Button>
              <Button size="sm" variant="ghost" onClick={() => { setReceber(null); setErro(null); }}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {contratos.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhum contrato de receita cadastrado. Um imóvel alugado a terceiro é um contrato de
            categoria <strong className="text-foreground">Receita</strong> — cadastre-o em Contratos
            e volte aqui para gerar as parcelas.
          </CardContent>
        </Card>
      )}

      {contratos.map((c) => (
        <Card key={c.id}>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CircleDollarSign className="size-4 text-muted-foreground" />
                  {c.numero} — {c.inquilino}
                  {c.status !== "VIGENTE" && <Badge variant="outline">{c.status}</Badge>}
                </CardTitle>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {c.titulo}
                  {c.empresaNome && <span className="ml-2 text-xs">· {c.empresaNome}</span>}
                </p>
              </div>
              {(c.parcelas.length === 0 || c.podeEstender) && (
                <div className="flex items-end gap-2">
                  <label className="text-xs text-muted-foreground">
                    Dia do vencimento
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={diaVenc[c.id] ?? (c.diaVencimentoSugerido ? String(c.diaVencimentoSugerido) : "")}
                      onChange={(e) => setDiaVenc((d) => ({ ...d, [c.id]: e.target.value }))}
                      className={cn(CAMPO, "w-28")}
                    />
                  </label>
                  <Button size="sm" variant={c.parcelas.length === 0 ? "default" : "outline"} disabled={pendente} onClick={() => gerar(c)}>
                    {c.parcelas.length === 0 ? "Gerar parcelas" : "Estender parcelas"}
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {c.parcelas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {c.valorMensal === null
                  ? "Este contrato não tem valor mensal — informe-o em Contratos para gerar as parcelas."
                  : "Escolha o dia de vencimento e gere as parcelas mensais deste contrato."}
              </p>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {c.parcelas.map((p) => (
                  <div
                    key={p.id}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm",
                      p.recebido
                        ? "border-emerald-600/30 bg-emerald-600/5"
                        : p.vencido
                          ? "border-destructive/30 bg-destructive/5"
                          : "border-border",
                    )}
                  >
                    <div className="min-w-0">
                      <span className="font-medium">{p.competencia}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {p.recebido ? (
                          <>recebido {p.recebidoEmTexto} · {formatarReais(p.valorRecebido ?? p.valorPrevisto)}</>
                        ) : (
                          <span className={cn(p.vencido && "text-destructive")}>
                            {p.vencido && (
                              <TriangleAlert className="mr-0.5 inline size-3 align-[-1px]" />
                            )}
                            vence {p.vencimentoTexto} · {formatarReais(p.valorPrevisto)}
                          </span>
                        )}
                      </span>
                    </div>
                    {p.recebido ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Desfazer"
                        disabled={pendente}
                        onClick={() => desfazer(p.id)}
                      >
                        <RotateCcw className="size-4 text-muted-foreground" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 whitespace-nowrap"
                        onClick={() =>
                          setReceber({ id: p.id, data: p.vencimentoInput, valor: String(p.valorPrevisto) })
                        }
                      >
                        <Check className="size-4" />
                        Recebi
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
