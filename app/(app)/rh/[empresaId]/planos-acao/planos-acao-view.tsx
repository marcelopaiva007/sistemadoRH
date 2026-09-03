"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Plus, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { criarPlanoAcao, atualizarStatusPlanoAcao } from "@/lib/actions/planos-acao";
import { STATUS_PLANO_ACAO, statusPlanoAcaoLabel } from "@/lib/constants-rh";
import { formatarData } from "@/lib/datas";
import type { ActionResult } from "@/lib/constants";

const initialState: ActionResult = { ok: true };
const classeSelect =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

type Plano = {
  id: string;
  titulo: string;
  descricao: string | null;
  responsavelNome: string | null;
  prazo: Date;
  status: string;
  concluidoEm: Date | null;
  dimensaoCodigo: string | null;
  setor: { nome: string } | null;
  pesquisa: { titulo: string } | null;
};

function vencido(plano: Plano): boolean {
  return plano.status !== "CONCLUIDO" && plano.status !== "CANCELADO" && plano.prazo < new Date();
}

function corDoStatus(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "CONCLUIDO") return "secondary";
  if (status === "CANCELADO") return "outline";
  return "default";
}

export function PlanosAcaoView({
  empresaId,
  planos,
  setores,
}: {
  empresaId: string;
  planos: Plano[];
  setores: { id: string; nome: string }[];
}) {
  const [criarAberto, setCriarAberto] = useState(false);

  // R7 do seed ("Status de Planos de Ação", mensal p/ direção) — resumo em
  // vez de relatório agendado à parte: com a lista já na tela, um digest
  // mensal por e-mail duplicaria o que AL09 já avisa em tempo real.
  const abertos = planos.filter((p) => p.status !== "CONCLUIDO" && p.status !== "CANCELADO");
  const vencidos = planos.filter(vencido);
  const concluidos = planos.filter((p) => p.status === "CONCLUIDO");
  const concluidosNoPrazo = concluidos.filter((p) => p.concluidoEm && p.concluidoEm <= p.prazo);
  // meta_ano1.planos_acao_no_prazo_pct do seed: % dos concluídos que terminaram até o prazo.
  const pctNoPrazo = concluidos.length > 0 ? Math.round((concluidosNoPrazo.length / concluidos.length) * 100) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>Planos de ação</h1>
          <p className="text-sm text-muted-foreground">
            Ações corretivas com dono, prazo e status — de pesquisas (clima, NR-01) ou de qualquer
            outra origem. Plano vencido e ainda aberto dispara alerta diário (AL09).
          </p>
        </div>
        <Dialog open={criarAberto} onOpenChange={setCriarAberto}>
          <DialogTrigger render={<Button />}>
            <Plus className="size-4" />
            Novo plano
          </DialogTrigger>
          <DialogContent>
            <NovoPlanoForm empresaId={empresaId} setores={setores} onSuccess={() => setCriarAberto(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {planos.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="py-4">
              <div className="text-xs text-muted-foreground">Em aberto</div>
              <div className="text-2xl font-semibold">{abertos.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="text-xs text-muted-foreground">Vencidos</div>
              <div className={"text-2xl font-semibold" + (vencidos.length > 0 ? " text-destructive" : "")}>
                {vencidos.length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="text-xs text-muted-foreground">Concluídos</div>
              <div className="text-2xl font-semibold">{concluidos.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="text-xs text-muted-foreground">Concluídos no prazo</div>
              <div className="text-2xl font-semibold">{pctNoPrazo === null ? "—" : `${pctNoPrazo}%`}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {planos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <ClipboardList className="size-8 text-muted-foreground/60" />
            Nenhum plano de ação criado ainda.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ação</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {planos.map((plano) => (
                  <TableRow key={plano.id}>
                    <TableCell>
                      <div className="font-medium">{plano.titulo}</div>
                      {plano.descricao && <div className="text-xs text-muted-foreground">{plano.descricao}</div>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {plano.setor?.nome ?? plano.pesquisa?.titulo ?? "—"}
                      {plano.dimensaoCodigo && ` · ${plano.dimensaoCodigo}`}
                    </TableCell>
                    <TableCell className="text-sm">{plano.responsavelNome ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      <span className={vencido(plano) ? "font-medium text-destructive" : undefined}>
                        {formatarData(plano.prazo)}
                        {vencido(plano) && " · vencido"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusSelect empresaId={empresaId} plano={plano} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatusSelect({ empresaId, plano }: { empresaId: string; plano: Plano }) {
  const [salvando, setSalvando] = useState(false);

  async function mudar(status: string) {
    if (status === plano.status) return;
    setSalvando(true);
    const result = await atualizarStatusPlanoAcao(empresaId, plano.id, status);
    setSalvando(false);
    if (result.ok) toast.success(`Status atualizado para ${statusPlanoAcaoLabel(status)}.`);
    else toast.error(result.error);
  }

  return (
    <span className="inline-flex items-center gap-2">
      <select
        defaultValue={plano.status}
        disabled={salvando}
        onChange={(e) => mudar(e.target.value)}
        className={classeSelect + " w-auto"}
      >
        {STATUS_PLANO_ACAO.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      {vencido(plano) && <Badge variant={corDoStatus(plano.status)}>Vencido</Badge>}
    </span>
  );
}

function NovoPlanoForm({
  empresaId,
  setores,
  onSuccess,
}: {
  empresaId: string;
  setores: { id: string; nome: string }[];
  onSuccess: () => void;
}) {
  const [state, formAction, isPending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await criarPlanoAcao(empresaId, prev, fd);
    if (result.ok) {
      toast.success("Plano de ação criado.");
      onSuccess();
    }
    return result;
  }, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Novo plano de ação</DialogTitle>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="titulo">Ação</Label>
        <Input id="titulo" name="titulo" placeholder='Ex.: "Reduzir sobrecarga do setor Operações"' required autoFocus />
      </div>
      <div className="space-y-2">
        <Label htmlFor="descricao">Descrição (opcional)</Label>
        <Textarea id="descricao" name="descricao" rows={2} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="responsavelNome">Responsável</Label>
          <Input id="responsavelNome" name="responsavelNome" placeholder="Nome" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="prazo">Prazo</Label>
          <Input id="prazo" name="prazo" type="date" required />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="setorId">Setor (opcional)</Label>
        <select id="setorId" name="setorId" defaultValue="" className={classeSelect}>
          <option value="">Nenhum</option>
          {setores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome}
            </option>
          ))}
        </select>
      </div>
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Criando..." : "Criar plano"}
        </Button>
      </DialogFooter>
    </form>
  );
}
