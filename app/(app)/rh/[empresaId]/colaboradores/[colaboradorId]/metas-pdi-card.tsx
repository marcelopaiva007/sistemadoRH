"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  criarMetaIndividual,
  atualizarMeta,
  excluirMeta,
  criarItemPDI,
  alternarItemPDI,
  excluirItemPDI,
} from "@/lib/actions/rh-metas";
import { statusMetaLabel } from "@/lib/constants-metas";
import type { OpcaoCatalogo } from "@/lib/catalogos";
import { formatarData } from "@/lib/datas";
import type { ActionResult } from "@/lib/constants";
import { BotaoExcluir } from "./dependentes-card";

const initialState: ActionResult = { ok: true };
const classeSelect =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

const variantePorStatus: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  EM_ANDAMENTO: "outline",
  ATINGIDA: "default",
  NAO_ATINGIDA: "destructive",
  CANCELADA: "secondary",
};

type Meta = {
  id: string;
  titulo: string;
  descricao: string | null;
  dataInicio: Date;
  dataFim: Date;
  progresso: number;
  status: string;
};

type ItemPDI = {
  id: string;
  titulo: string;
  descricao: string | null;
  prazo: Date | null;
  concluido: boolean;
  concluidoPorNome: string | null;
};

export function MetasPdiCard({
  empresaId,
  colaboradorId,
  metas,
  pdi,
  statusMetaDisponiveis,
}: {
  empresaId: string;
  colaboradorId: string;
  metas: Meta[];
  pdi: ItemPDI[];
  statusMetaDisponiveis: OpcaoCatalogo[];
}) {
  const [novaMetaAberto, setNovaMetaAberto] = useState(false);
  const [editarMeta, setEditarMeta] = useState<Meta | null>(null);
  const [novoItemAberto, setNovoItemAberto] = useState(false);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Metas individuais</CardTitle>
          <CardAction>
            <Dialog open={novaMetaAberto} onOpenChange={setNovaMetaAberto}>
              <DialogTrigger render={<Button size="sm" variant="outline" />}>
                <Plus className="size-4" />
                Nova meta
              </DialogTrigger>
              <DialogContent>
                <NovaMetaForm empresaId={empresaId} colaboradorId={colaboradorId} onSuccess={() => setNovaMetaAberto(false)} />
              </DialogContent>
            </Dialog>
          </CardAction>
        </CardHeader>
        <CardContent>
          {metas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma meta individual ainda.</p>
          ) : (
            <ul className="divide-y">
              {metas.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{m.titulo}</span>
                      <Badge variant={variantePorStatus[m.status] ?? "outline"}>{statusMetaLabel(m.status)}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatarData(m.dataInicio)} a {formatarData(m.dataFim)} · {m.progresso}%
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setEditarMeta(m)}>
                    Editar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>PDI — Plano de desenvolvimento individual</CardTitle>
          <CardDescription>Ações de desenvolvimento acompanhadas, uma por linha.</CardDescription>
          <CardAction>
            <Dialog open={novoItemAberto} onOpenChange={setNovoItemAberto}>
              <DialogTrigger render={<Button size="sm" variant="outline" />}>
                <Plus className="size-4" />
                Novo item
              </DialogTrigger>
              <DialogContent>
                <NovoItemPDIForm empresaId={empresaId} colaboradorId={colaboradorId} onSuccess={() => setNovoItemAberto(false)} />
              </DialogContent>
            </Dialog>
          </CardAction>
        </CardHeader>
        <CardContent>
          {pdi.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum item de PDI ainda.</p>
          ) : (
            <ul className="divide-y">
              {pdi.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                  <label className="flex flex-1 items-start gap-3">
                    <Checkbox
                      className="mt-0.5"
                      checked={item.concluido}
                      onCheckedChange={async () => {
                        const r = await alternarItemPDI(empresaId, colaboradorId, item.id);
                        if (!r.ok) toast.error(r.error);
                      }}
                    />
                    <div className={item.concluido ? "text-muted-foreground line-through" : ""}>
                      <div>{item.titulo}</div>
                      {(item.prazo || item.descricao) && (
                        <div className="text-xs text-muted-foreground">
                          {item.prazo && `Prazo: ${formatarData(item.prazo)}`}
                          {item.prazo && item.descricao && " · "}
                          {item.descricao}
                        </div>
                      )}
                    </div>
                  </label>
                  <BotaoExcluir
                    onConfirm={async () => {
                      const r = await excluirItemPDI(empresaId, colaboradorId, item.id);
                      if (r.ok) toast.success("Item removido.");
                      else toast.error(r.error);
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editarMeta} onOpenChange={(open) => !open && setEditarMeta(null)}>
        <DialogContent>
          {editarMeta && (
            <EditarMetaForm
              empresaId={empresaId}
              meta={editarMeta}
              statusDisponiveis={statusMetaDisponiveis}
              onSuccess={() => setEditarMeta(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NovaMetaForm({
  empresaId,
  colaboradorId,
  onSuccess,
}: {
  empresaId: string;
  colaboradorId: string;
  onSuccess: () => void;
}) {
  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await criarMetaIndividual(empresaId, colaboradorId, prev, fd);
    if (result.ok) {
      toast.success("Meta criada.");
      onSuccess();
    }
    return result;
  }, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Nova meta</DialogTitle>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="titulo">Título</Label>
        <Input id="titulo" name="titulo" required autoFocus />
      </div>
      <div className="space-y-2">
        <Label htmlFor="descricao">Descrição</Label>
        <Textarea id="descricao" name="descricao" rows={2} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="dataInicio">Início</Label>
          <Input id="dataInicio" name="dataInicio" type="date" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dataFim">Fim</Label>
          <Input id="dataFim" name="dataFim" type="date" required />
        </div>
      </div>
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Criando..." : "Criar meta"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function EditarMetaForm({
  empresaId,
  meta,
  statusDisponiveis,
  onSuccess,
}: {
  empresaId: string;
  meta: Meta;
  statusDisponiveis: OpcaoCatalogo[];
  onSuccess: () => void;
}) {
  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await atualizarMeta(empresaId, meta.id, prev, fd);
    if (result.ok) {
      toast.success("Meta atualizada.");
      onSuccess();
    }
    return result;
  }, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{meta.titulo}</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <select id="status" name="status" defaultValue={meta.status} className={classeSelect}>
            {statusDisponiveis.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="progresso">Progresso (%)</Label>
          <Input id="progresso" name="progresso" type="number" min={0} max={100} defaultValue={meta.progresso} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="descricao">Descrição</Label>
        <Textarea id="descricao" name="descricao" rows={2} defaultValue={meta.descricao ?? ""} />
      </div>
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <DialogFooter className="justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={async () => {
            const r = await excluirMeta(empresaId, meta.id);
            if (r.ok) {
              toast.success("Meta excluída.");
              onSuccess();
            } else toast.error(r.error);
          }}
        >
          Excluir
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function NovoItemPDIForm({
  empresaId,
  colaboradorId,
  onSuccess,
}: {
  empresaId: string;
  colaboradorId: string;
  onSuccess: () => void;
}) {
  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await criarItemPDI(empresaId, colaboradorId, prev, fd);
    if (result.ok) {
      toast.success("Item de PDI adicionado.");
      onSuccess();
    }
    return result;
  }, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Novo item de PDI</DialogTitle>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="titulo">Ação de desenvolvimento</Label>
        <Input id="titulo" name="titulo" placeholder='Ex.: "Curso de NR-10 avançado"' required autoFocus />
      </div>
      <div className="space-y-2">
        <Label htmlFor="descricao">Descrição</Label>
        <Textarea id="descricao" name="descricao" rows={2} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="prazo">Prazo</Label>
        <Input id="prazo" name="prazo" type="date" />
      </div>
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Adicionando..." : "Adicionar"}
        </Button>
      </DialogFooter>
    </form>
  );
}
