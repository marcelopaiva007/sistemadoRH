"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { salvarCondutor } from "@/lib/actions/processos-frota";
import { PONTOS_PARA_CURSO_PREVENTIVO } from "@/lib/processos/ctb";

export type CondutorNaTela = {
  id: string | null;
  colaboradorId: string;
  nome: string;
  empresaNome: string;
  cnhCategoria: string | null;
  cnhNumero: string | null;
  cnhUf: string | null;
  cnhValidadeTexto: string;
  /** Formato do <input type="date"> — o prefill da edição. */
  cnhValidadeInput: string;
  toxicologicoValidadeInput: string;
  cursoReciclagemInput: string;
  diasParaCnh: number | null;
  possuiEAR: boolean;
  /** Pontos ATIVOS: derivados das infrações indicadas nos últimos 12 meses. */
  pontosAcumulados: number;
  limitePontos: number;
  statusHabilitacao: string;
};

const CAMPO = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm";

export function CondutoresView({
  empresaId,
  condutores,
  colaboradoresSemCondutor,
}: {
  empresaId: string;
  condutores: CondutorNaTela[];
  colaboradoresSemCondutor: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string> | null>(null);

  function campo(nome: string) {
    return {
      value: form?.[nome] ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setForm((f) => ({ ...(f ?? {}), [nome]: e.target.value })),
    };
  }

  function salvar() {
    if (!form?.colaboradorId) {
      setErro("Escolha o colaborador.");
      return;
    }
    setErro(null);
    iniciar(async () => {
      const r = await salvarCondutor({
        id: form.id || null,
        empresaId,
        colaboradorId: form.colaboradorId,
        cnhNumero: form.cnhNumero ?? null,
        cnhCategoria: form.cnhCategoria ?? null,
        cnhUf: form.cnhUf ?? null,
        cnhValidade: form.cnhValidade ?? null,
        possuiEAR: form.possuiEAR === "sim",
        toxicologicoValidade: form.toxicologicoValidade ?? null,
        cursoReciclagemUltimaData: form.cursoReciclagemUltimaData ?? null,
        statusHabilitacao: form.statusHabilitacao || "APTO",
      });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setForm(null);
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

      <div className="flex justify-end">
        <Button size="sm" className="gap-2" onClick={() => setForm({ statusHabilitacao: "APTO" })}>
          <Plus className="size-4" />
          Registrar condutor
        </Button>
      </div>

      {form && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{form.id ? "Editar condutor" : "Registrar condutor"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-muted-foreground">
              Colaborador
              {form.id ? (
                <input value={form.nome ?? ""} readOnly className={cn(CAMPO, "bg-muted")} />
              ) : (
                <select {...campo("colaboradorId")} className={CAMPO}>
                  <option value="">Escolha…</option>
                  {colaboradoresSemCondutor.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              )}
            </label>
            <label className="text-xs text-muted-foreground">
              Categoria da CNH
              <input {...campo("cnhCategoria")} className={CAMPO} maxLength={3} placeholder="AB" />
            </label>
            <label className="text-xs text-muted-foreground">
              Validade da CNH
              <input {...campo("cnhValidade")} type="date" className={CAMPO} />
              <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                Copie do documento — não é conta de 10 anos.
              </span>
            </label>
            <label className="text-xs text-muted-foreground">
              Exerce atividade remunerada (EAR)?
              <select {...campo("possuiEAR")} className={CAMPO}>
                <option value="">Não</option>
                <option value="sim">Sim</option>
              </select>
            </label>
            {form.possuiEAR === "sim" && (
              <label className="text-xs text-muted-foreground">
                Validade do exame toxicológico
                <input {...campo("toxicologicoValidade")} type="date" className={CAMPO} />
              </label>
            )}
            <label className="text-xs text-muted-foreground">
              Último curso de reciclagem
              <input {...campo("cursoReciclagemUltimaData")} type="date" className={CAMPO} />
            </label>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
              <Button size="sm" disabled={pendente} onClick={salvar}>Salvar</Button>
              <Button size="sm" variant="ghost" onClick={() => { setForm(null); setErro(null); }}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="px-0 pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Condutor</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>CNH</TableHead>
                <TableHead>Vence em</TableHead>
                <TableHead>Pontos</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {condutores.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum condutor registrado. Sem condutor, a multa não tem a quem ser indicada.
                  </TableCell>
                </TableRow>
              )}
              {condutores.map((c) => {
                // O curso preventivo zera os pontos, mas só dá para fazer a
                // partir de 30 — aos 40 com EAR já é suspensão, e não há mais
                // saída. Mostrar o aviso na faixa certa é a única utilidade
                // real desta coluna.
                const podeCurso = c.possuiEAR && c.pontosAcumulados >= PONTOS_PARA_CURSO_PREVENTIVO;
                const perto = c.pontosAcumulados >= c.limitePontos * 0.7;
                return (
                  <TableRow key={c.colaboradorId}>
                    <TableCell className="font-medium">{c.nome}</TableCell>
                    <TableCell className="text-muted-foreground">{c.empresaNome}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.cnhCategoria ?? "—"}
                      {c.possuiEAR && <Badge variant="secondary" className="ml-2">EAR</Badge>}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "tabular-nums",
                        c.diasParaCnh !== null && c.diasParaCnh < 0 && "font-semibold text-destructive",
                        c.diasParaCnh !== null && c.diasParaCnh >= 0 && c.diasParaCnh <= 60 &&
                          "text-amber-600 dark:text-amber-500",
                      )}
                    >
                      {c.cnhValidadeTexto}
                    </TableCell>
                    <TableCell>
                      <span className={cn("tabular-nums", perto && "font-semibold text-amber-600 dark:text-amber-500")}>
                        {c.pontosAcumulados} / {c.limitePontos}
                      </span>
                      {podeCurso && (
                        <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-500">
                          <TriangleAlert className="size-3" />
                          pode fazer o curso que zera
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          // TODOS os campos entram no prefill. Campo fora do
                          // formulário na edição = campo apagado no salvar —
                          // foi assim que a primeira versão apagava a validade
                          // da CNH de quem só corrigia a categoria.
                          setForm({
                            id: c.id ?? "",
                            colaboradorId: c.colaboradorId,
                            nome: c.nome,
                            cnhNumero: c.cnhNumero ?? "",
                            cnhCategoria: c.cnhCategoria ?? "",
                            cnhUf: c.cnhUf ?? "",
                            cnhValidade: c.cnhValidadeInput,
                            toxicologicoValidade: c.toxicologicoValidadeInput,
                            cursoReciclagemUltimaData: c.cursoReciclagemInput,
                            possuiEAR: c.possuiEAR ? "sim" : "",
                            statusHabilitacao: c.statusHabilitacao,
                          })
                        }
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
