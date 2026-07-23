"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Plus, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createPesquisa, criarPesquisaNR01, deletePesquisa } from "@/lib/actions/pesquisas";
import { statusPesquisaLabel } from "@/lib/constants-rh";
import type { ActionResult } from "@/lib/constants";

type Pesquisa = {
  id: string;
  titulo: string;
  status: string;
  anonima: boolean;
  modelo: string;
  createdAt: Date;
  _count: { perguntas: number; tokens: number; respostas: number };
};

const initialState: ActionResult = { ok: true };

export function PesquisasTable({ empresaId, pesquisas }: { empresaId: string; pesquisas: Pesquisa[] }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [criandoNR01, setCriandoNR01] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          disabled={criandoNR01}
          onClick={async () => {
            setCriandoNR01(true);
            // Em caso de sucesso a action redireciona para a tela da pesquisa;
            // só voltamos aqui em erro.
            const result = await criarPesquisaNR01(empresaId);
            setCriandoNR01(false);
            if (result && !result.ok) toast.error(result.error);
          }}
        >
          <ShieldAlert className="size-4" />
          {criandoNR01 ? "Criando..." : "Nova Avaliação NR-01"}
        </Button>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="size-4" />
            Nova Pesquisa
          </DialogTrigger>
          <DialogContent>
            <NovaPesquisaForm empresaId={empresaId} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Anônima</TableHead>
              <TableHead>Perguntas</TableHead>
              <TableHead>Convites</TableHead>
              <TableHead>Respostas</TableHead>
              <TableHead className="w-px" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pesquisas.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Nenhuma pesquisa cadastrada ainda.
                </TableCell>
              </TableRow>
            )}
            {pesquisas.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  <Link href={`/rh/${empresaId}/pesquisas/${p.id}`} className="hover:underline">
                    {p.titulo}
                  </Link>
                  {p.modelo === "NR01" && (
                    <Badge variant="outline" className="ml-2">
                      NR-01
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{statusPesquisaLabel(p.status)}</Badge>
                </TableCell>
                <TableCell>{p.anonima ? "Sim" : "Não"}</TableCell>
                <TableCell>{p._count.perguntas}</TableCell>
                <TableCell>{p._count.tokens}</TableCell>
                <TableCell>{p._count.respostas}</TableCell>
                <TableCell className="text-right">
                  <ExcluirPesquisaButton
                    empresaId={empresaId}
                    pesquisaId={p.id}
                    titulo={p.titulo}
                    respostas={p._count.respostas}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// Mesmo padrão de duas etapas da tela de detalhe (pesquisa-detalhe-view.tsx):
// primeiro clique arma, segundo executa. Aqui a confirmação nomeia a pesquisa e
// diz quantas respostas vão junto — numa lista o risco é clicar na linha errada,
// e a exclusão é irreversível.
function ExcluirPesquisaButton({
  empresaId,
  pesquisaId,
  titulo,
  respostas,
}: {
  empresaId: string;
  pesquisaId: string;
  titulo: string;
  respostas: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center justify-end gap-1 whitespace-nowrap">
        <span className="text-xs text-destructive">
          Excluir &ldquo;{titulo}&rdquo;
          {respostas > 0 && ` e ${respostas} resposta${respostas > 1 ? "s" : ""}`}?
        </span>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={excluindo}
          onClick={async () => {
            setExcluindo(true);
            const result = await deletePesquisa(empresaId, pesquisaId);
            // só volta aqui em erro — no sucesso a action redireciona
            setExcluindo(false);
            if (result && !result.ok) toast.error(result.error);
          }}
        >
          {excluindo ? "Excluindo..." : "Confirmar"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
          Cancelar
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="text-destructive hover:text-destructive"
      onClick={() => setConfirming(true)}
      aria-label={`Excluir ${titulo}`}
    >
      <Trash2 className="size-4" />
    </Button>
  );
}

function NovaPesquisaForm({ empresaId }: { empresaId: string }) {
  const [anonima, setAnonima] = useState(true);

  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    fd.set("anonima", anonima ? "true" : "false");
    // Em caso de sucesso, createPesquisa chama redirect() e nunca retorna —
    // a navegação para a tela de detalhe já fecha este diálogo. Só chegamos
    // aqui de volta em caso de erro de validação.
    return createPesquisa(empresaId, prev, fd);
  }, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Nova Pesquisa</DialogTitle>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="titulo">Título</Label>
        <Input id="titulo" name="titulo" required autoFocus placeholder="Pesquisa de Clima Organizacional 2026" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="descricao">Descrição (opcional)</Label>
        <Textarea id="descricao" name="descricao" rows={3} />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="anonima" checked={anonima} onCheckedChange={(v) => setAnonima(v === true)} />
        <Label htmlFor="anonima" className="font-normal">
          Pesquisa anônima (recomendado — respostas nunca identificam o colaborador)
        </Label>
      </div>
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Criando..." : "Criar e continuar"}
        </Button>
      </DialogFooter>
    </form>
  );
}
