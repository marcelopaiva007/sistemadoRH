"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Download, Lock, LockOpen, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  lancarEvento,
  excluirEvento,
  importarEventosDerivados,
  alternarFechamento,
} from "@/lib/actions/rh-folha";
import {
  RUBRICAS,
  formatarCompetencia,
  rubricaLabel,
  rubricaNatureza,
  rubricaUnidade,
  unidadeLabel,
} from "@/lib/constants-folha";
import type { ActionResult } from "@/lib/constants";
import { Indicador } from "@/components/indicador";
import { Trilha } from "@/components/trilha";

const initialState: ActionResult = { ok: true };
const classeSelect =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

type Evento = {
  id: string;
  tipo: string;
  quantidade: number | null;
  valor: number | null;
  observacoes: string | null;
  origem: string;
  colaboradorId: string;
  colaborador: { nome: string; matricula: string | null; cpf: string | null; setor: { nome: string } };
};

type Competencia = {
  id: string;
  referencia: Date;
  status: string;
  fechadaPorNome: string | null;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function CompetenciaDetalhe({
  empresaId,
  competencia,
  eventos,
  colaboradores,
}: {
  empresaId: string;
  competencia: Competencia;
  eventos: Evento[];
  colaboradores: { id: string; nome: string }[];
}) {
  const [lancarAberto, setLancarAberto] = useState(false);
  const [importando, setImportando] = useState(false);
  const [alternando, setAlternando] = useState(false);

  const fechada = competencia.status === "FECHADA";
  const pessoas = new Set(eventos.map((e) => e.colaboradorId)).size;
  const totalProventos = eventos
    .filter((e) => rubricaNatureza(e.tipo) === "PROVENTO" && e.valor)
    .reduce((s, e) => s + (e.valor ?? 0), 0);
  const totalDescontos = eventos
    .filter((e) => rubricaNatureza(e.tipo) === "DESCONTO" && e.valor)
    .reduce((s, e) => s + (e.valor ?? 0), 0);

  return (
    <div className="space-y-6">
      <Trilha empresaId={empresaId} atual={formatarCompetencia(competencia.referencia)} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1>
              Competência {formatarCompetencia(competencia.referencia)}
            </h1>
            {fechada ? (
              <Badge variant="secondary" className="gap-1">
                <Lock className="size-3" />
                Fechada
              </Badge>
            ) : (
              <Badge variant="default">Aberta</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {eventos.length} lançamento(s) · {pessoas} pessoa(s)
            {fechada && competencia.fechadaPorNome && ` · fechada por ${competencia.fechadaPorNome}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" render={<a href={`/api/rh/${empresaId}/folha/${competencia.id}/csv`} />}>
            <Download className="size-4" />
            Exportar CSV
          </Button>
          {!fechada && (
            <>
              <Button
                variant="outline"
                disabled={importando}
                onClick={async () => {
                  setImportando(true);
                  const r = await importarEventosDerivados(empresaId, competencia.id);
                  setImportando(false);
                  if (r.ok) toast.success("Faltas e benefícios atualizados.");
                  else toast.error(r.error);
                }}
              >
                <RefreshCw className="size-4" />
                {importando ? "Buscando..." : "Buscar faltas e benefícios"}
              </Button>
              <Dialog open={lancarAberto} onOpenChange={setLancarAberto}>
                <DialogTrigger render={<Button />}>
                  <Plus className="size-4" />
                  Lançar
                </DialogTrigger>
                <DialogContent>
                  <LancarForm
                    empresaId={empresaId}
                    competenciaId={competencia.id}
                    colaboradores={colaboradores}
                    onSuccess={() => setLancarAberto(false)}
                  />
                </DialogContent>
              </Dialog>
            </>
          )}
          <Button
            variant={fechada ? "outline" : "destructive"}
            disabled={alternando}
            onClick={async () => {
              setAlternando(true);
              const r = await alternarFechamento(empresaId, competencia.id);
              setAlternando(false);
              if (r.ok) toast.success(fechada ? "Competência reaberta." : "Competência fechada.");
              else toast.error(r.error);
            }}
          >
            {fechada ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
            {fechada ? "Reabrir" : "Fechar competência"}
          </Button>
        </div>
      </div>

      {fechada && (
        <Alert>
          <Lock className="size-4" />
          <AlertDescription>
            Competência fechada — o que está aqui é o que a contabilidade recebeu. Para corrigir,
            reabra antes; a reabertura fica registrada na auditoria.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Indicador rotulo="Pessoas com lançamento" valor={String(pessoas)} />
        <Indicador rotulo="Proventos em dinheiro" valor={brl(totalProventos)} />
        <Indicador rotulo="Descontos em dinheiro" valor={brl(totalDescontos)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lançamentos</CardTitle>
          <CardDescription>
            &quot;Derivado&quot; veio de outro módulo (falta de Ausências, benefício de Benefícios) e é
            recalculado ao buscar de novo. Manual é digitado e nunca é sobrescrito.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {eventos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum lançamento ainda. Use &quot;Buscar faltas e benefícios&quot; para trazer o que o
              sistema já sabe, e &quot;Lançar&quot; para hora extra, bônus e o resto.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table compacta>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Rubrica</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead>Origem</TableHead>
                    {!fechada && <TableHead className="w-16" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eventos.map((e) => {
                    const unidade = rubricaUnidade(e.tipo);
                    const natureza = rubricaNatureza(e.tipo);
                    return (
                      <TableRow key={e.id}>
                        <TableCell>
                          <div className="font-medium">{e.colaborador.nome}</div>
                          <div className="text-xs text-muted-foreground">{e.colaborador.setor.nome}</div>
                        </TableCell>
                        <TableCell>
                          {rubricaLabel(e.tipo)}
                          {natureza === "DESCONTO" && (
                            <span className="ml-1.5 text-xs text-destructive">desconto</span>
                          )}
                          {e.observacoes && (
                            <div className="text-xs text-muted-foreground">{e.observacoes}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {unidade === "VALOR"
                            ? brl(e.valor ?? 0)
                            : `${e.quantidade} ${unidadeLabel[unidade]}`}
                        </TableCell>
                        <TableCell>
                          <Badge variant={e.origem === "DERIVADO" ? "secondary" : "outline"}>
                            {e.origem === "DERIVADO" ? "Derivado" : "Manual"}
                          </Badge>
                        </TableCell>
                        {!fechada && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                const r = await excluirEvento(empresaId, competencia.id, e.id);
                                if (r.ok) toast.success("Lançamento removido.");
                                else toast.error(r.error);
                              }}
                            >
                              Remover
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


function LancarForm({
  empresaId,
  competenciaId,
  colaboradores,
  onSuccess,
}: {
  empresaId: string;
  competenciaId: string;
  colaboradores: { id: string; nome: string }[];
  onSuccess: () => void;
}) {
  const [tipo, setTipo] = useState<string>("HORA_EXTRA_50");
  const unidade = rubricaUnidade(tipo);

  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await lancarEvento(empresaId, competenciaId, prev, fd);
    if (result.ok) {
      toast.success("Lançamento registrado.");
      onSuccess();
    }
    return result;
  }, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Lançar evento</DialogTitle>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="colaboradorId">Colaborador</Label>
        <select id="colaboradorId" name="colaboradorId" required defaultValue="" className={classeSelect}>
          <option value="" disabled>
            Escolha o colaborador
          </option>
          {colaboradores.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="tipo">Rubrica</Label>
        <select
          id="tipo"
          name="tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className={classeSelect}
        >
          {RUBRICAS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="quantidade">
          {unidade === "VALOR" ? "Valor (R$)" : unidade === "HORAS" ? "Horas" : "Dias"}
        </Label>
        <Input
          id="quantidade"
          name="quantidade"
          inputMode="decimal"
          placeholder={unidade === "VALOR" ? "Ex.: 350,00" : unidade === "HORAS" ? "Ex.: 12,5" : "Ex.: 2"}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="observacoes">Observações</Label>
        <Textarea id="observacoes" name="observacoes" rows={2} />
      </div>
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Lançando..." : "Lançar"}
        </Button>
      </DialogFooter>
    </form>
  );
}
