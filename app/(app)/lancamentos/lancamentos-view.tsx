"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { createLancamento, updateLancamento, deleteLancamento } from "@/lib/actions/lancamentos";
import type { ActionResult } from "@/lib/constants";
import { periodoLabel } from "@/lib/periodo";

type Cidade = { id: string; nome: string };
type Funcionario = { id: string; nome: string; cidade: Cidade | null };
type Lancamento = {
  id: string;
  funcionarioId: string;
  periodo: string;
  quantidade: number;
  aprovado: number;
  cancelado: number;
  valorInstalado: number;
  valorDemaisServicos: number;
  qtdInternet: number;
  qtdChip: number;
  qtdGps: number;
  qtdTv: number;
  qtdStreaming: number;
  qtdTelefoniaFixa: number;
  origem: string;
  funcionario: Funcionario;
};

const initialState: ActionResult = { ok: true };
const fmtMoeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function LancamentosView({
  periodo,
  funcionarios,
  lancamentos,
  fechado,
}: {
  periodo: string;
  funcionarios: Funcionario[];
  lancamentos: Lancamento[];
  fechado: boolean;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editLancamento, setEditLancamento] = useState<Lancamento | null>(null);

  const totalVendido = lancamentos.reduce((acc, l) => acc + l.valorInstalado, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Input
            type="month"
            value={periodo}
            onChange={(e) => router.push(`/lancamentos?periodo=${e.target.value}`)}
            className="w-44"
          />
          <span className="text-sm text-muted-foreground">
            {lancamentos.length} lançamento(s) · Total vendido: {fmtMoeda(totalVendido)}
          </span>
        </div>
        {!fechado && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger render={<Button />}>
              <Plus className="size-4" />
              Novo Lançamento
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
              <LancamentoForm
                action={createLancamento}
                title="Novo Lançamento"
                periodo={periodo}
                funcionarios={funcionarios}
                onSuccess={() => setCreateOpen(false)}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {fechado && (
        <Alert>
          <Lock className="size-4" />
          <AlertDescription>
            O mês {periodoLabel(periodo)} já foi fechado. Lançamentos ficam somente
            leitura — reabra o mês na tela de Fechamento Mensal para editar.
          </AlertDescription>
        </Alert>
      )}

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Funcionário</TableHead>
              <TableHead>Cidade</TableHead>
              <TableHead className="text-right">Qtd.</TableHead>
              <TableHead className="text-right">Aprovado</TableHead>
              <TableHead className="text-right">Cancelado</TableHead>
              <TableHead className="text-right">Valor Instalado</TableHead>
              <TableHead>Origem</TableHead>
              {!fechado && <TableHead className="w-24 text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lancamentos.length === 0 && (
              <TableRow>
                <TableCell colSpan={fechado ? 7 : 8} className="py-8 text-center text-muted-foreground">
                  Nenhum lançamento neste período ainda.
                </TableCell>
              </TableRow>
            )}
            {lancamentos.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.funcionario.nome}</TableCell>
                <TableCell>{l.funcionario.cidade?.nome ?? "—"}</TableCell>
                <TableCell className="text-right">{l.quantidade}</TableCell>
                <TableCell className="text-right">{l.aprovado}</TableCell>
                <TableCell className="text-right">{l.cancelado}</TableCell>
                <TableCell className="text-right">{fmtMoeda(l.valorInstalado)}</TableCell>
                <TableCell>
                  <Badge variant={l.origem === "MANUAL" ? "secondary" : "outline"}>
                    {l.origem === "MANUAL" ? "Manual" : l.origem === "HISTORICO" ? "Histórico" : "Importado"}
                  </Badge>
                </TableCell>
                {!fechado && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditLancamento(l)}>
                        <Pencil className="size-4" />
                      </Button>
                      <DeleteLancamentoButton lancamento={l} />
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editLancamento} onOpenChange={(open) => !open && setEditLancamento(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {editLancamento && (
            <LancamentoForm
              action={updateLancamento.bind(null, editLancamento.id)}
              title="Editar Lançamento"
              periodo={periodo}
              funcionarios={funcionarios}
              defaultValues={editLancamento}
              onSuccess={() => setEditLancamento(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LancamentoForm({
  action,
  title,
  periodo,
  funcionarios,
  defaultValues,
  onSuccess,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  title: string;
  periodo: string;
  funcionarios: Funcionario[];
  defaultValues?: Lancamento;
  onSuccess: () => void;
}) {
  const [funcionarioId, setFuncionarioId] = useState(defaultValues?.funcionarioId ?? "");

  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await action(prev, fd);
    if (result.ok) {
      toast.success("Lançamento salvo. Bonificação recalculada.");
      onSuccess();
    }
    return result;
  }, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
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
                {f.nome} {f.cidade ? `— ${f.cidade.nome}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label htmlFor="quantidade">Quantidade</Label>
          <Input id="quantidade" name="quantidade" type="number" defaultValue={defaultValues?.quantidade ?? 0} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="aprovado">Aprovado</Label>
          <Input id="aprovado" name="aprovado" type="number" defaultValue={defaultValues?.aprovado ?? 0} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cancelado">Cancelado</Label>
          <Input id="cancelado" name="cancelado" type="number" defaultValue={defaultValues?.cancelado ?? 0} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="valorInstalado">Valor instalado (R$)</Label>
          <Input
            id="valorInstalado"
            name="valorInstalado"
            type="number"
            step="0.01"
            defaultValue={defaultValues?.valorInstalado ?? 0}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="valorDemaisServicos">Valor demais serviços (R$)</Label>
          <Input
            id="valorDemaisServicos"
            name="valorDemaisServicos"
            type="number"
            step="0.01"
            defaultValue={defaultValues?.valorDemaisServicos ?? 0}
          />
          <p className="text-xs text-muted-foreground">
            Valor dos serviços não-internet — base dos 50% do Atendimento/ADM.
          </p>
        </div>
      </div>

      <Separator />
      <p className="text-sm font-medium">Quantidade vendida por produto</p>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        <div className="space-y-2">
          <Label htmlFor="qtdInternet">Internet</Label>
          <Input id="qtdInternet" name="qtdInternet" type="number" defaultValue={defaultValues?.qtdInternet ?? 0} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="qtdChip">Chip</Label>
          <Input id="qtdChip" name="qtdChip" type="number" defaultValue={defaultValues?.qtdChip ?? 0} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="qtdGps">GPS</Label>
          <Input id="qtdGps" name="qtdGps" type="number" defaultValue={defaultValues?.qtdGps ?? 0} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="qtdTv">TV</Label>
          <Input id="qtdTv" name="qtdTv" type="number" defaultValue={defaultValues?.qtdTv ?? 0} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="qtdStreaming">Streaming</Label>
          <Input id="qtdStreaming" name="qtdStreaming" type="number" defaultValue={defaultValues?.qtdStreaming ?? 0} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="qtdTelefoniaFixa">Tel. Fixa</Label>
          <Input
            id="qtdTelefoniaFixa"
            name="qtdTelefoniaFixa"
            type="number"
            defaultValue={defaultValues?.qtdTelefoniaFixa ?? 0}
          />
        </div>
      </div>

      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function DeleteLancamentoButton({ lancamento }: { lancamento: Lancamento }) {
  const [confirming, setConfirming] = useState(false);

  async function handleDelete() {
    const result = await deleteLancamento(lancamento.id);
    if (result.ok) {
      toast.success("Lançamento excluído. Bonificação recalculada.");
    } else {
      toast.error(result.error);
    }
    setConfirming(false);
  }

  if (confirming) {
    return (
      <div className="flex gap-1">
        <Button variant="destructive" size="sm" onClick={handleDelete}>
          Confirmar
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
          Cancelar
        </Button>
      </div>
    );
  }

  return (
    <Button variant="ghost" size="icon" onClick={() => setConfirming(true)}>
      <Trash2 className="size-4" />
    </Button>
  );
}
