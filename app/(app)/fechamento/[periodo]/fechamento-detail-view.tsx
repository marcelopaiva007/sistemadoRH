"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Lock, LockOpen, RefreshCw, Plus, Trash2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { fecharMes, reabrirMes, recalcular } from "@/lib/actions/fechamento";
import { createAjuste, deleteAjuste } from "@/lib/actions/lancamentos";
import type { ActionResult } from "@/lib/constants";

const fmtMoeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const initialState: ActionResult = { ok: true };

type Cidade = { id: string; nome: string };
type Funcionario = { id: string; nome: string; cidade?: Cidade | null };
type Bonificacao = {
  id: string;
  funcionario: Funcionario;
  valorInternet: number;
  valorChip: number;
  valorDemais: number;
  valorSupervisor: number;
  valorTotal: number;
};
type AjusteItem = {
  id: string;
  funcionario: Funcionario;
  descricao: string;
  valor: number;
};
type Fechamento = {
  id: string;
  periodo: string;
  status: string;
  valorTotalVendido: number;
  valorTotalBonificacao: number;
  fechadoPor: { nome: string } | null;
  fechadoEm: Date | null;
  bonificacoes: Bonificacao[];
  ajustes: AjusteItem[];
} | null;

export function FechamentoDetailView({
  periodo,
  fechamento,
  funcionarios,
  role,
}: {
  periodo: string;
  fechamento: Fechamento;
  funcionarios: Funcionario[];
  role: string;
}) {
  const isAdmin = role === "ADMIN";
  const isFechado = fechamento?.status === "FECHADO";
  const [isPending, startTransition] = useTransition();

  function handleFechar() {
    startTransition(async () => {
      const result = await fecharMes(periodo);
      if (result.ok) toast.success("Mês fechado com sucesso.");
      else toast.error(result.error);
    });
  }

  function handleReabrir() {
    startTransition(async () => {
      const result = await reabrirMes(periodo);
      if (result.ok) toast.success("Mês reaberto para edição.");
      else toast.error(result.error);
    });
  }

  function handleRecalcular() {
    startTransition(async () => {
      const result = await recalcular(periodo);
      if (result.ok) toast.success("Bonificação recalculada.");
      else toast.error(result.error);
    });
  }

  async function handleExportar() {
    const XLSX = await import("xlsx");
    const wsData = [
      ["Funcionário", "Internet", "Chip", "Demais", "Supervisor", "Total"],
      ...(fechamento?.bonificacoes.map((b) => [
        b.funcionario.nome,
        b.valorInternet,
        b.valorChip,
        b.valorDemais,
        b.valorSupervisor,
        b.valorTotal,
      ]) ?? []),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Fechamento");
    XLSX.writeFile(wb, `fechamento-${periodo}.xlsx`);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={isFechado ? "default" : "secondary"} className="text-sm">
              {isFechado ? "Fechado" : "Aberto"}
            </Badge>
            {isFechado && fechamento?.fechadoPor && (
              <p className="mt-1 text-xs text-muted-foreground">
                por {fechamento.fechadoPor.nome}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Valor Vendido</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{fmtMoeda(fechamento?.valorTotalVendido ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Bonificação Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{fmtMoeda(fechamento?.valorTotalBonificacao ?? 0)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={handleExportar}
          disabled={(fechamento?.bonificacoes.length ?? 0) === 0}
        >
          <Download className="size-4" />
          Exportar Excel
        </Button>
      </div>

      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          {!isFechado ? (
            <>
              <Button variant="outline" onClick={handleRecalcular} disabled={isPending}>
                <RefreshCw className="size-4" />
                Recalcular
              </Button>
              <Button onClick={handleFechar} disabled={isPending}>
                <Lock className="size-4" />
                Fechar Mês
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={handleReabrir} disabled={isPending}>
              <LockOpen className="size-4" />
              Reabrir Mês
            </Button>
          )}
        </div>
      )}

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Funcionário</TableHead>
              <TableHead className="text-right">Internet</TableHead>
              <TableHead className="text-right">Chip</TableHead>
              <TableHead className="text-right">Demais</TableHead>
              <TableHead className="text-right">Supervisor</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(fechamento?.bonificacoes.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Nenhuma bonificação calculada ainda. Lance vendas neste período.
                </TableCell>
              </TableRow>
            )}
            {fechamento?.bonificacoes.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium">{b.funcionario.nome}</TableCell>
                <TableCell className="text-right">{fmtMoeda(b.valorInternet)}</TableCell>
                <TableCell className="text-right">{fmtMoeda(b.valorChip)}</TableCell>
                <TableCell className="text-right">{fmtMoeda(b.valorDemais)}</TableCell>
                <TableCell className="text-right">{fmtMoeda(b.valorSupervisor)}</TableCell>
                <TableCell className="text-right font-medium">{fmtMoeda(b.valorTotal)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Ajustes manuais</h2>
          {isAdmin && !isFechado && (
            <AjusteDialog periodo={periodo} funcionarios={funcionarios} />
          )}
        </div>
        <div className="rounded-md border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Funcionário</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                {isAdmin && !isFechado && <TableHead className="w-16 text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(fechamento?.ajustes.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={isAdmin && !isFechado ? 4 : 3} className="py-6 text-center text-muted-foreground">
                    Nenhum ajuste manual neste período.
                  </TableCell>
                </TableRow>
              )}
              {fechamento?.ajustes.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.funcionario.nome}</TableCell>
                  <TableCell className="text-muted-foreground">{a.descricao}</TableCell>
                  <TableCell className="text-right">{fmtMoeda(a.valor)}</TableCell>
                  {isAdmin && !isFechado && (
                    <TableCell className="text-right">
                      <DeleteAjusteButton id={a.id} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function AjusteDialog({ periodo, funcionarios }: { periodo: string; funcionarios: Funcionario[] }) {
  const [open, setOpen] = useState(false);
  const [funcionarioId, setFuncionarioId] = useState("");

  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await createAjuste(prev, fd);
    if (result.ok) {
      toast.success("Ajuste adicionado. Bonificação recalculada.");
      setOpen(false);
      setFuncionarioId("");
    }
    return result;
  }, initialState);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Plus className="size-4" />
        Novo Ajuste
      </DialogTrigger>
      <DialogContent>
        <form action={formAction} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Novo Ajuste Manual</DialogTitle>
          </DialogHeader>
          <input type="hidden" name="periodo" value={periodo} />
          <div className="space-y-2">
            <Label>Funcionário</Label>
            <Select
              value={funcionarioId}
              onValueChange={(v) => setFuncionarioId(v ?? "")}
              name="funcionarioId"
              items={Object.fromEntries(funcionarios.map((f) => [f.id, f.nome]))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione o funcionário" />
              </SelectTrigger>
              <SelectContent>
                {funcionarios.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição / motivo</Label>
            <Textarea id="descricao" name="descricao" placeholder="Ex: Ação comercial, bônus extra..." required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="valor">Valor (R$) — use negativo para desconto</Label>
            <Input id="valor" name="valor" type="number" step="0.01" required />
          </div>
          {!state.ok && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : "Adicionar Ajuste"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteAjusteButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteAjuste(id);
      if (result.ok) toast.success("Ajuste removido. Bonificação recalculada.");
      else toast.error(result.error);
    });
  }

  return (
    <Button variant="ghost" size="icon" onClick={handleDelete} disabled={isPending}>
      <Trash2 className="size-4" />
    </Button>
  );
}
